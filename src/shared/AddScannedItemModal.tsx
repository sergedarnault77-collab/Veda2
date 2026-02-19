import { useEffect, useMemo, useRef, useState } from "react";
import { fileToDataUrl } from "../lib/persist";
import { parseScannedItem } from "../lib/parse-item";
import { compressImageDataUrl } from "../lib/image";
import { withMinDelay } from "../lib/minDelay";
import LoadingBanner from "./LoadingBanner";
import type { NutrientRow } from "../home/stubs";
import "./AddScannedItemModal.css";

const isMobile = typeof navigator !== "undefined" && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

export type ScannedItem = {
  displayName: string;
  brand: string | null;
  form: "tablet" | "capsule" | "powder" | "liquid" | "other" | null;
  strengthPerUnit: number | null;
  strengthUnit: "mg" | "µg" | "g" | "IU" | "mL" | null;
  servingSizeText: string | null;
  servingSizeG?: number | null;
  nutritionPer?: string;
  rawTextHints: string[];
  confidence: number;
  mode: "openai" | "stub";
  frontImage: string | null;
  ingredientsImage: string | null;
  ingredientsImages?: string[];
  labelTranscription?: string | null;
  nutrients?: NutrientRow[];
  nutrientsPer100g?: NutrientRow[] | null;
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
      servingSizeG: initialItem.servingSizeG ?? null,
      nutritionPer: initialItem.nutritionPer ?? "unknown",
      confidence: initialItem.confidence ?? 0,
      mode: initialItem.mode ?? "stub",
      rawTextHints: initialItem.rawTextHints ?? [],
      labelTranscription: initialItem.labelTranscription ?? null,
      nutrients: initialItem.nutrients ?? [],
      nutrientsPer100g: initialItem.nutrientsPer100g ?? null,
      ingredientsDetected: initialItem.ingredientsDetected ?? [],
      ingredientsList: initialItem.ingredientsList ?? [],
      meta: initialItem.meta ?? null,
    });
    if (initialItem.servingSizeG && (initialItem.nutritionPer === "100g" || initialItem.nutrientsPer100g)) {
      setServingG(initialItem.servingSizeG);
    }
  }, [initialItem]);

  const [servingG, setServingG] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const hasIngredients = ingredientsImages.length > 0;
  const canScanIngredients = !!frontImage;
  const hasRealParsedData = parsedItem && (parsedItem.mode === "openai" || (parsedItem.confidence ?? 0) > 0.3 || (Array.isArray(parsedItem.nutrients) && parsedItem.nutrients.length > 0));
  const photosExistButNotParsed = !!frontImage && !hasRealParsedData && parseStatus !== "parsing" && parseStatus !== "parsed" && parseStatus !== "failed";
  const canConfirm = !!name.trim() && (!!frontImage || kind === "med") && parseStatus !== "parsing" && !submitting && !photosExistButNotParsed;

  const isPer100g = parsedItem?.nutritionPer === "100g";
  const nutrientsPer100g = parsedItem?.nutrientsPer100g as NutrientRow[] | null;

  const title = isEdit
    ? (kind === "med" ? "Edit medication" : "Edit supplement")
    : (kind === "med" ? "Add medication" : "Add supplement");

  const confirmLabel = isEdit
    ? "Save changes"
    : (kind === "med" ? "Add to your medications" : "Add to your supplements");

  const onPickFront = async (file: File) => {
    const dataUrl = await fileToDataUrl(file);
    const compressed = await compressImageDataUrl(dataUrl, { maxW: 1024, maxH: 1024, quality: 0.8, mimeType: "image/jpeg" });
    setFrontImage(compressed);
    setParseStatus("idle");
    setParsedItem(null);
    setParseWarning(null);
  };

  const onPickIngredients = async (file: File) => {
    const dataUrl = await fileToDataUrl(file);
    const compressed = await compressImageDataUrl(dataUrl, { maxW: 1600, maxH: 2000, quality: 0.85, mimeType: "image/jpeg" });
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

      if (item?.servingSizeG && item?.nutritionPer === "100g") {
        setServingG(item.servingSizeG);
      }

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

  // Auto-parse: medications parse on front photo; supplements parse once
  // both front and ingredients photos are available.
  useEffect(() => {
    if (!frontImage) return;
    if (kind === "med") {
      doParseNow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frontImage, kind]);

  useEffect(() => {
    if (kind === "med" || !frontImage || ingredientsImages.length === 0) return;
    if (parseStatus === "parsing") return;
    // Already parsed from initialItem pre-fill with real data — skip
    if (parsedItem && parsedItem.mode === "openai" && parsedItem.confidence > 0.3) return;
    const timer = setTimeout(() => doParseNow(), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frontImage, ingredientsImages.length, kind]);

  const activeNutrients = useMemo((): NutrientRow[] => {
    if (!isPer100g || !nutrientsPer100g || !servingG) {
      return (parsedItem?.nutrients || []) as NutrientRow[];
    }
    const scale = servingG / 100;
    return nutrientsPer100g.map(n => ({
      ...n,
      amountToday: Math.round(n.amountToday * scale * 100) / 100,
    }));
  }, [parsedItem, isPer100g, nutrientsPer100g, servingG]);

  const detectedNutrientsPreview = useMemo(() => {
    if (!Array.isArray(activeNutrients) || activeNutrients.length === 0) return [];
    return activeNutrients.slice(0, 8).map((n) => {
      const pct = n.dailyReference != null && n.dailyReference > 0
        ? ` (${Math.round((n.amountToday / n.dailyReference) * 100)}%)`
        : "";
      return `${n.name} — ${n.amountToday}${n.unit}${pct}`;
    });
  }, [activeNutrients]);

  const needsRescan = parsedItem?.meta?.needsRescan === true;

  const confirm = () => {
    if (!canConfirm || submitting) return;
    setSubmitting(true);
    const nowISO = new Date().toISOString();

    const servingText = isPer100g && servingG
      ? `${servingG}g`
      : parsedItem?.servingSizeText ?? initialItem?.servingSizeText ?? null;

    const item: ScannedItem = {
      displayName: name.trim(),
      brand: parsedItem?.brand ?? initialItem?.brand ?? null,
      form: parsedItem?.form ?? initialItem?.form ?? null,
      strengthPerUnit: parsedItem?.strengthPerUnit ?? initialItem?.strengthPerUnit ?? null,
      strengthUnit: parsedItem?.strengthUnit ?? initialItem?.strengthUnit ?? null,
      servingSizeText: servingText,
      servingSizeG: servingG ?? parsedItem?.servingSizeG ?? null,
      nutritionPer: parsedItem?.nutritionPer ?? "unknown",
      rawTextHints: parsedItem?.rawTextHints ?? initialItem?.rawTextHints ?? [],
      confidence: parsedItem?.confidence ?? initialItem?.confidence ?? 0,
      mode: parsedItem?.mode ?? initialItem?.mode ?? "stub",
      frontImage: frontImage!,
      ingredientsImage: ingredientsImages[0] ?? null,
      ingredientsImages,
      labelTranscription: parsedItem?.labelTranscription ?? initialItem?.labelTranscription ?? null,
      nutrients: activeNutrients,
      nutrientsPer100g: nutrientsPer100g ?? initialItem?.nutrientsPer100g ?? null,
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
    ? `Add another label photo (${ingredientsImages.length} added)`
    : (isMobile ? "Scan ingredients label" : "Upload ingredients / nutrition label");

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <h2>{title}</h2>
        <p className="modal-sub">
          {kind === "med"
            ? (isMobile ? "Take a photo of the front of the box — or type the name below." : "Upload a photo of the front of the box — or type the name below.")
            : (isMobile ? "Take a photo of the front, then the ingredients label if available." : "Upload a photo of the front, then the ingredients/nutrition label.")}
        </p>

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
            capture={isMobile ? "environment" : undefined}
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
            capture={isMobile ? "environment" : undefined}
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) onPickIngredients(f);
            }}
          />

          <label className="btn btn--primary" htmlFor="front-file">
            {frontImage
              ? (isMobile ? "Re-scan product front" : "Replace front photo")
              : kind === "med"
                ? (isMobile ? "📷 Take photo of box" : "📷 Upload photo of box")
                : (isMobile ? "Scan product front" : "Upload front photo")}
          </label>

          {kind === "med" ? (
            /* Medications: ingredients label is optional, shown only after front photo */
            frontImage && parseStatus !== "parsing" && (
              <label
                className="btn btn--secondary"
                htmlFor="ing-file"
                style={{ opacity: 0.8 }}
              >
                {hasIngredients ? `Add another label photo (${ingredientsImages.length} added)` : (isMobile ? "Optional: scan ingredients label" : "Optional: upload ingredients label")}
              </label>
            )
          ) : (
            /* Supplements: ingredients label is primary action */
            <label
              className={`btn ${canScanIngredients ? "btn--primary" : "btn--disabled"}`}
              htmlFor={canScanIngredients ? "ing-file" : undefined}
              title={canScanIngredients ? "" : "Scan the front first"}
              aria-disabled={!canScanIngredients}
            >
              {ingButtonLabel}
            </label>
          )}
        </div>

        {/* Manual medication entry */}
        {kind === "med" && !frontImage && (
          <div className="modal-manual-entry">
            <div className="modal-manual-entry__or">or type the medication name above and tap Add</div>
          </div>
        )}

        {/* Front-only: identify without ingredients label (supplements only) */}
        {kind !== "med" && frontImage && !hasIngredients && parseStatus !== "parsing" && parseStatus !== "parsed" && (
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

        {/* Read label button — user triggers when all ingredient photos are taken */}
        {kind !== "med" && hasIngredients && parseStatus !== "parsing" && (
          <button
            className="btn btn--primary"
            style={{ marginTop: 8 }}
            onClick={doParseNow}
          >
            {parseStatus === "parsed"
              ? `Re-read label (${ingredientsImages.length} photo${ingredientsImages.length > 1 ? "s" : ""})`
              : `Read label (${ingredientsImages.length} photo${ingredientsImages.length > 1 ? "s" : ""})`}
          </button>
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

        {isPer100g && parseStatus === "parsed" && (
          <div className="serving-size-block">
            <div className="serving-size-block__label">
              Label shows values <strong>per 100g</strong> — how much do you take per serving?
            </div>
            <div className="serving-size-block__input-row">
              <input
                type="number"
                className="serving-size-block__input"
                min={1}
                max={500}
                step={1}
                value={servingG ?? ""}
                placeholder="e.g. 20"
                onChange={(e) => {
                  const v = e.target.value;
                  setServingG(v ? Math.max(1, Math.min(500, Number(v))) : null);
                }}
              />
              <span className="serving-size-block__unit">grams</span>
            </div>
            {servingG && (
              <div className="serving-size-block__hint">
                Nutrients scaled to {servingG}g serving ({Math.round(servingG / 100 * 100)}% of label values)
              </div>
            )}
          </div>
        )}

        {detectedNutrientsPreview.length > 0 && (
          <div className="parse-hint">
            <strong>Detected nutrients{isPer100g && servingG ? ` (per ${servingG}g)` : ""}:</strong>
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
            {submitting ? "Adding…" : parseStatus === "parsing" ? "Reading label…" : photosExistButNotParsed ? "Waiting for analysis…" : confirmLabel}
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
