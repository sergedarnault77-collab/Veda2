import { useEffect, useMemo, useRef, useState } from "react";
import { fileToDataUrl } from "../lib/persist";
import { parseScannedItem } from "../lib/parse-item";
import { compressImageDataUrl } from "../lib/image";
import { withMinDelay } from "../lib/minDelay";
import LoadingBanner from "./LoadingBanner";
import type { NutrientRow } from "../home/stubs";
import "./AddScannedItemModal.css";

export type ScannedItem = {
  displayName: string;
  brand: string | null;
  form: "tablet" | "capsule" | "powder" | "liquid" | "other" | null;
  strengthPerUnit: number | null;
  strengthUnit: "mg" | "µg" | "g" | "IU" | "mL" | null;
  servingSizeText: string | null;
  rawTextHints: string[];
  confidence: number;
  mode: "openai" | "stub";
  frontImage: string | null;
  ingredientsImage: string | null;
  ingredientsImages?: string[];
  labelTranscription?: string | null;
  nutrients?: NutrientRow[];
  ingredientsDetected?: string[];
  ingredientsList?: string[];
  ingredientsCount?: number;
  insights?: ItemInsights | null;
  meta?: {
    transcriptionConfidence?: number;
    needsRescan?: boolean;
    rescanHint?: string | null;
  };
  createdAtISO?: string;
};

export type ItemInsights = {
  summary: string;
  overlaps: Array<{
    key: string;
    what: string;
    whyItMatters: string;
    risk: "low" | "medium" | "high";
    related: string[];
  }>;
  notes: string[];
};

type Props = {
  kind: "med" | "supp";
  onClose: () => void;
  onConfirm: (item: ScannedItem) => void;
  initialItem?: ScannedItem;
};

const MAX_ING_PHOTOS = 4;

export default function AddScannedItemModal({ kind, onClose, onConfirm, initialItem }: Props) {
  const isEdit = !!initialItem;
  const defaultName = "New " + (kind === "med" ? "medication" : "supplement");

  const [frontImage, setFrontImage] = useState<string | null>(initialItem?.frontImage ?? null);
  const [ingredientsImages, setIngredientsImages] = useState<string[]>(() => {
    if (initialItem?.ingredientsImages?.length) return initialItem.ingredientsImages;
    if (initialItem?.ingredientsImage) return [initialItem.ingredientsImage];
    return [];
  });
  const [name, setName] = useState<string>(initialItem?.displayName || defaultName);

  const [parseStatus, setParseStatus] = useState<"idle" | "parsing" | "parsed" | "failed">("idle");
  const [parsedItem, setParsedItem] = useState<any | null>(null);
  const [parseWarning, setParseWarning] = useState<string | null>(null);
  const userEditedName = useRef(false);
  const ingredientsInputRef = useRef<HTMLInputElement>(null);

  // Pre-fill from initialItem
  useEffect(() => {
    if (!initialItem) return;
    setParsedItem({
      displayName: initialItem.displayName,
      brand: initialItem.brand ?? null,
      form: initialItem.form ?? null,
      strengthPerUnit: initialItem.strengthPerUnit ?? null,
      strengthUnit: initialItem.strengthUnit ?? null,
      servingSizeText: initialItem.servingSizeText ?? null,
      confidence: initialItem.confidence ?? 0,
      mode: initialItem.mode ?? "stub",
      rawTextHints: initialItem.rawTextHints ?? [],
      labelTranscription: initialItem.labelTranscription ?? null,
      nutrients: initialItem.nutrients ?? [],
      ingredientsDetected: initialItem.ingredientsDetected ?? [],
      meta: initialItem.meta ?? null,
    });
  }, [initialItem]);

  const hasIngredients = ingredientsImages.length > 0;
  const canScanIngredients = !!frontImage;
  const canConfirm = !!name.trim() && !!frontImage && parseStatus !== "parsing";

  const title = isEdit
    ? (kind === "med" ? "Edit medication" : "Edit supplement")
    : (kind === "med" ? "Add medication" : "Add supplement");

  const confirmLabel = isEdit
    ? "Save changes"
    : (kind === "med" ? "Add to your medications" : "Add to your supplements");

  const onPickFront = async (file: File) => {
    const dataUrl = await fileToDataUrl(file);
    const compressed = await compressImageDataUrl(dataUrl, { maxW: 900, maxH: 900, quality: 0.72, mimeType: "image/jpeg" });
    setFrontImage(compressed);
    setParseStatus("idle");
    setParsedItem(null);
    setParseWarning(null);
  };

  const onPickIngredients = async (file: File) => {
    const dataUrl = await fileToDataUrl(file);
    const compressed = await compressImageDataUrl(dataUrl, { maxW: 1200, maxH: 1200, quality: 0.78, mimeType: "image/jpeg" });
    setIngredientsImages((prev) => [...prev, compressed].slice(-MAX_ING_PHOTOS));
    setParseStatus("idle");
    setParsedItem(null);
    setParseWarning(null);
  };

  const doParseNow = async () => {
    if (!frontImage) return;
    setParseStatus("parsing");
    setParseWarning(null);
    try {
      const item = await withMinDelay(
        parseScannedItem(kind, frontImage, hasIngredients ? ingredientsImages : null),
        700,
      );
      console.log("[parse] response", item);
      setParsedItem(item);
      setParseStatus("parsed");
      if (!userEditedName.current && item?.displayName) setName(item.displayName);

      if (item?.meta?.needsRescan) {
        setParseWarning(item.meta.rescanHint || "Photo is hard to read. Take a closer photo of the ingredients label.");
      } else if (item?.mode === "stub") {
        setParseWarning(item?.rawTextHints?.[0] || "Couldn't read label reliably.");
      } else {
        setParseWarning(null);
      }
    } catch (e: any) {
      setParseStatus("failed");
      setParseWarning(e?.message || "Parse failed");
    }
  };

  // Auto-parse when images change (front-only or front+ingredients)
  useEffect(() => {
    if (!frontImage) return;
    if (hasIngredients) {
      doParseNow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frontImage, ingredientsImages, kind]);

  const detectedNutrientsPreview = useMemo(() => {
    const ns = (parsedItem?.nutrients || []) as any[];
    if (!Array.isArray(ns) || ns.length === 0) return [];
    return ns.slice(0, 8).map((n: any) => {
      const pct = n.dailyReference != null && n.dailyReference > 0
        ? ` (${Math.round((n.amountToday / n.dailyReference) * 100)}%)`
        : "";
      return `${n.name} — ${n.amountToday}${n.unit}${pct}`;
    });
  }, [parsedItem]);

  const needsRescan = parsedItem?.meta?.needsRescan === true;

  const confirm = () => {
    if (!canConfirm) return;
    const nowISO = new Date().toISOString();
    const item: ScannedItem = {
      displayName: name.trim(),
      brand: parsedItem?.brand ?? initialItem?.brand ?? null,
      form: parsedItem?.form ?? initialItem?.form ?? null,
      strengthPerUnit: parsedItem?.strengthPerUnit ?? initialItem?.strengthPerUnit ?? null,
      strengthUnit: parsedItem?.strengthUnit ?? initialItem?.strengthUnit ?? null,
      servingSizeText: parsedItem?.servingSizeText ?? initialItem?.servingSizeText ?? null,
      rawTextHints: parsedItem?.rawTextHints ?? initialItem?.rawTextHints ?? [],
      confidence: parsedItem?.confidence ?? initialItem?.confidence ?? 0,
      mode: parsedItem?.mode ?? initialItem?.mode ?? "stub",
      frontImage: frontImage!,
      ingredientsImage: ingredientsImages[0] ?? null,
      ingredientsImages,
      labelTranscription: parsedItem?.labelTranscription ?? initialItem?.labelTranscription ?? null,
      nutrients: parsedItem?.nutrients ?? initialItem?.nutrients ?? [],
      ingredientsDetected: parsedItem?.ingredientsDetected ?? initialItem?.ingredientsDetected ?? [],
      ingredientsList: parsedItem?.ingredientsList ?? initialItem?.ingredientsList ?? [],
      ingredientsCount: parsedItem?.ingredientsCount ?? initialItem?.ingredientsCount ?? 0,
      insights: initialItem?.insights ?? null,
      meta: parsedItem?.meta ?? initialItem?.meta ?? undefined,
      createdAtISO: initialItem?.createdAtISO ?? nowISO,
    };
    onConfirm(item);
    onClose();
  };

  const ingButtonLabel = hasIngredients
    ? `Add another label photo (${ingredientsImages.length} taken)`
    : "Scan ingredients label";

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <h2>{title}</h2>
        <p className="modal-sub">Take a photo of the front, then the ingredients label if available.</p>

        <label className="modal-label">Name</label>
        <input
          className="modal-input"
          value={name}
          onChange={(e) => {
            userEditedName.current = true;
            setName(e.target.value);
          }}
        />

        {isEdit && frontImage && (
          <button
            className="btn btn--secondary"
            style={{ marginTop: 10 }}
            onClick={doParseNow}
            disabled={parseStatus === "parsing"}
          >
            {parseStatus === "parsing" ? "Reading…" : "Re-read from photos"}
          </button>
        )}

        <div className="scan-buttons">
          <input
            id="front-file"
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) onPickFront(f);
            }}
          />
          <input
            id="ing-file"
            ref={ingredientsInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) onPickIngredients(f);
            }}
          />

          <label className="btn btn--secondary" htmlFor="front-file">
            {frontImage ? "Re-scan product front" : "Scan product front"}
          </label>
          <label
            className={`btn ${canScanIngredients ? "btn--primary" : "btn--disabled"}`}
            htmlFor={canScanIngredients ? "ing-file" : undefined}
            title={canScanIngredients ? "" : "Scan the front first"}
            aria-disabled={!canScanIngredients}
          >
            {ingButtonLabel}
          </label>
        </div>

        {/* Front-only: identify without ingredients label */}
        {frontImage && !hasIngredients && parseStatus !== "parsing" && parseStatus !== "parsed" && (
          <button
            className="btn btn--tertiary"
            style={{ marginTop: 6 }}
            onClick={doParseNow}
          >
            No ingredients label — identify from front
          </button>
        )}

        {hasIngredients && ingredientsImages.length < MAX_ING_PHOTOS && (
          <div className="parse-hint">
            Multi-column label? Add more photos for better accuracy.
          </div>
        )}

        {(frontImage || hasIngredients) && (
          <div className="thumbs">
            {frontImage && <img src={frontImage} alt="Front preview" />}
            {ingredientsImages.map((img, i) => (
              <img key={i} src={img} alt={`Ingredients ${i + 1}`} />
            ))}
          </div>
        )}

        {/* Loading banner */}
        {parseStatus === "parsing" && (
          <LoadingBanner
            title="Reading label…"
            subtitle="This can take a few seconds on mobile"
            tone="info"
          />
        )}

        {/* Rescan warning banner */}
        {parseStatus !== "parsing" && needsRescan && parseWarning && (
          <>
            <LoadingBanner
              tone="warn"
              title="Photo is hard to read"
              subtitle={parseWarning}
            />
            <button
              className="btn btn--rescan"
              onClick={() => ingredientsInputRef.current?.click()}
            >
              Re-scan ingredients label
            </button>
          </>
        )}

        {/* Non-rescan warning */}
        {parseStatus !== "parsing" && !needsRescan && !!parseWarning && (
          <LoadingBanner
            tone="warn"
            title="Label read issue"
            subtitle={parseWarning}
          />
        )}

        {detectedNutrientsPreview.length > 0 && (
          <div className="parse-hint">
            <strong>Detected nutrients:</strong>
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.9 }}>
              {detectedNutrientsPreview.map((t) => (
                <div key={t}>• {t}</div>
              ))}
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn--primary"
            onClick={confirm}
            disabled={!canConfirm}
          >
            {parseStatus === "parsing" ? "Reading…" : confirmLabel}
          </button>
        </div>

        {import.meta.env.DEV && (
          <div className="dev-debug">
            status={parseStatus} · mode={(parsedItem?.mode as string) || "n/a"} · conf={parsedItem?.meta?.transcriptionConfidence ?? "n/a"} · rescan={String(parsedItem?.meta?.needsRescan ?? "n/a")}
          </div>
        )}
      </div>
    </div>
  );
}
