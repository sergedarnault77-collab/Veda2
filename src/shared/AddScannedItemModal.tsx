import { useEffect, useMemo, useRef, useState } from "react";
import { fileToDataUrl } from "../lib/persist";
import { parseScannedItem } from "../lib/parse-item";
import { compressImageDataUrl } from "../lib/image";
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
  labelTranscription?: string | null;
  nutrients?: NutrientRow[];
  ingredientsDetected?: string[];
  createdAtISO?: string;
};

type Props = {
  kind: "med" | "supp";
  onClose: () => void;
  onConfirm: (item: ScannedItem) => void;
  initialItem?: ScannedItem; // if present -> edit/re-read mode
};

export default function AddScannedItemModal({ kind, onClose, onConfirm, initialItem }: Props) {
  const isEdit = !!initialItem;
  const defaultName = "New " + (kind === "med" ? "medication" : "supplement");

  const [frontImage, setFrontImage] = useState<string | null>(initialItem?.frontImage ?? null);
  const [ingredientsImage, setIngredientsImage] = useState<string | null>(initialItem?.ingredientsImage ?? null);
  const [name, setName] = useState<string>(initialItem?.displayName || defaultName);

  const [parseStatus, setParseStatus] = useState<"idle" | "parsing" | "parsed" | "failed">("idle");
  const [parsedItem, setParsedItem] = useState<any | null>(null);
  const [parseWarning, setParseWarning] = useState<string | null>(null);
  const userEditedName = useRef(false);

  // If we're editing an existing item, pre-fill parsed fields so UI shows what we already have.
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
    });
  }, [initialItem]);

  const canScanIngredients = !!frontImage;
  const canConfirm = !!name.trim() && !!frontImage && !!ingredientsImage && parseStatus !== "parsing";

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
    // resetting downstream state
    setParseStatus("idle");
    setParsedItem(null);
    setParseWarning(null);
  };

  const onPickIngredients = async (file: File) => {
    const dataUrl = await fileToDataUrl(file);
    const compressed = await compressImageDataUrl(dataUrl, { maxW: 1200, maxH: 1200, quality: 0.78, mimeType: "image/jpeg" });
    setIngredientsImage(compressed);
    // reset parse state and trigger parse
    setParseStatus("idle");
    setParsedItem(null);
    setParseWarning(null);
  };

  const doParseNow = async () => {
    if (!frontImage || !ingredientsImage) return;
    setParseStatus("parsing");
    try {
      const item = await parseScannedItem(kind, frontImage, ingredientsImage);
      console.log("[parse] response", item);
      setParsedItem(item);
      setParseStatus("parsed");
      if (!userEditedName.current && item?.displayName) setName(item.displayName);
      if (item?.mode === "stub") {
        setParseWarning(item?.rawTextHints?.[0] || "Couldn't read label reliably.");
      } else {
        setParseWarning(null);
      }
    } catch (e: any) {
      setParseStatus("failed");
      setParseWarning(e?.message || "Parse failed");
    }
  };

  // Auto-parse for new items once both images exist.
  // For edit mode, we *don't* auto-run; user can tap "Re-read label".
  useEffect(() => {
    if (isEdit) return;
    if (!frontImage || !ingredientsImage) return;
    doParseNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frontImage, ingredientsImage, kind, isEdit]);

  const detectedNutrientsPreview = useMemo(() => {
    const ns = (parsedItem?.nutrients || []) as any[];
    if (!Array.isArray(ns) || ns.length === 0) return [];
    return ns.slice(0, 8).map((n: any) => `${n.name} — ${n.amountToday}${n.unit}`);
  }, [parsedItem]);

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
      ingredientsImage: ingredientsImage!,
      labelTranscription: parsedItem?.labelTranscription ?? initialItem?.labelTranscription ?? null,
      nutrients: parsedItem?.nutrients ?? initialItem?.nutrients ?? [],
      ingredientsDetected: parsedItem?.ingredientsDetected ?? initialItem?.ingredientsDetected ?? [],
      createdAtISO: initialItem?.createdAtISO ?? nowISO,
    };
    onConfirm(item);
    onClose();
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <h2>{title}</h2>
        <p className="modal-sub">Take a photo of the front, then the ingredients label.</p>

        <label className="modal-label">Name</label>
        <input
          className="modal-input"
          value={name}
          onChange={(e) => {
            userEditedName.current = true;
            setName(e.target.value);
          }}
        />

        {isEdit && frontImage && ingredientsImage && (
          <button
            className="btn btn--secondary"
            style={{ marginTop: 10 }}
            onClick={doParseNow}
            disabled={parseStatus === "parsing"}
          >
            {parseStatus === "parsing" ? "Reading label..." : "Re-read label from photos"}
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
            {ingredientsImage ? "Re-scan ingredients label" : "Scan ingredients label"}
          </label>
        </div>

        {(frontImage || ingredientsImage) && (
          <div className="thumbs">
            {frontImage && <img src={frontImage} alt="Front preview" />}
            {ingredientsImage && <img src={ingredientsImage} alt="Ingredients preview" />}
          </div>
        )}

        {parseStatus === "parsing" && <div className="parse-hint">Reading label…</div>}

        {!!parseWarning && (
          <div className="parse-warning">
            Couldn't read the label on this device/deployment. ({parseWarning})
          </div>
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
          <button className="btn btn--primary" onClick={confirm} disabled={!canConfirm}>
            {confirmLabel}
          </button>
        </div>

        {import.meta.env.DEV && (
          <div className="dev-debug">
            status={parseStatus} · mode={(parsedItem?.mode as string) || "n/a"} · conf={(parsedItem?.confidence as number) ?? 0}
          </div>
        )}
      </div>
    </div>
  );
}
