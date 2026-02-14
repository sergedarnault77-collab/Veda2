// src/shared/AddScannedItemModal.tsx
import { useEffect, useRef, useState } from "react";
import { parseScannedItem } from "../lib/parse-item";
import { compressImageDataUrl } from "../lib/image";
import "./AddScannedItemModal.css";

type Kind = "med" | "supp";

/** Shape of a confirmed scanned item. Consumers persist this. */
export type ScannedItem = {
  displayName: string;
  brand: string | null;
  form: string | null;
  strengthPerUnit: number | null;
  strengthUnit: string | null;
  servingSizeText: string | null;
  rawTextHints: string[];
  confidence: number;
  mode: "openai" | "stub";
  frontImage: string;
  ingredientsImage: string;
  createdAtISO: string;
};

interface Props {
  kind: Kind;
  onConfirm(item: ScannedItem): void;
  onClose(): void;
}

type ParseStatus = "idle" | "parsing" | "parsed" | "failed";

export default function AddScannedItemModal({ kind, onConfirm, onClose }: Props) {
  const [frontImage, setFrontImage] = useState<string | null>(null);
  const [ingredientsImage, setIngredientsImage] = useState<string | null>(null);

  const [name, setName] = useState("");
  const userEditedName = useRef(false);

  const [parsedItem, setParsedItem] = useState<any | null>(null);
  const [parseStatus, setParseStatus] = useState<ParseStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const frontInputRef = useRef<HTMLInputElement>(null);
  const ingredientsInputRef = useRef<HTMLInputElement>(null);

  async function handleFrontCapture(file: File) {
    const dataUrl = await fileToDataUrl(file);
    const compressed = await compressImageDataUrl(dataUrl, {
      maxW: 1200,
      maxH: 1200,
      quality: 0.85,
    });
    setFrontImage(compressed);
  }

  async function handleIngredientsCapture(file: File) {
    const dataUrl = await fileToDataUrl(file);
    const compressed = await compressImageDataUrl(dataUrl, {
      maxW: 1600,
      maxH: 1600,
      quality: 0.9,
    });
    setIngredientsImage(compressed);
  }

  useEffect(() => {
    if (!frontImage || !ingredientsImage) return;

    let cancelled = false;
    setParseStatus("parsing");
    setErrorMsg(null);

    parseScannedItem(kind, frontImage, ingredientsImage)
      .then((item) => {
        if (cancelled) return;

        console.log("[parse] response", item);
        setParsedItem(item);

        if (!userEditedName.current) {
          setName(item.displayName || "Unrecognized item");
        }

        setParseStatus("parsed");
      })
      .catch((err) => {
        console.error("[parse] failed", err);
        if (cancelled) return;
        setParseStatus("failed");
        setParsedItem(null);
        if (!userEditedName.current) {
          setName("Unrecognized item");
        }
        setErrorMsg(
          err?.message ||
            "Couldn't read the label on this device/deployment."
        );
      });

    return () => {
      cancelled = true;
    };
  }, [frontImage, ingredientsImage, kind]);

  const canConfirm =
    !!frontImage && !!ingredientsImage && !!name.trim() && parseStatus !== "parsing";

  function confirm() {
    const item: ScannedItem = {
      displayName: name.trim() || "Unrecognized item",
      brand: parsedItem?.brand ?? null,
      form: parsedItem?.form ?? null,
      strengthPerUnit: parsedItem?.strengthPerUnit ?? null,
      strengthUnit: parsedItem?.strengthUnit ?? null,
      servingSizeText: parsedItem?.servingSizeText ?? null,
      rawTextHints: parsedItem?.rawTextHints ?? [],
      confidence: parsedItem?.confidence ?? 0,
      mode: parsedItem?.mode ?? "stub",
      frontImage: frontImage!,
      ingredientsImage: ingredientsImage!,
      createdAtISO: new Date().toISOString(),
    };
    onConfirm(item);
    onClose();
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <button className="modal-close" onClick={onClose}>
          &times;
        </button>

        <h2>{kind === "med" ? "Add medication" : "Add supplement"}</h2>
        <p className="modal-sub">
          Take a photo of the front, then the ingredients label.
        </p>

        <label>Name</label>
        <input
          value={name}
          onChange={(e) => {
            userEditedName.current = true;
            setName(e.target.value);
          }}
          placeholder={kind === "med" ? "e.g. Brand + dosage" : "e.g. Magnesium glycinate"}
        />

        {parsedItem?.strengthPerUnit && parsedItem.mode === "openai" && (
          <div className="parse-hint">
            Detected: {parsedItem.strengthPerUnit}{" "}
            {parsedItem.strengthUnit}
            {parsedItem.form ? ` · ${parsedItem.form}` : ""}
          </div>
        )}

        {parseStatus === "parsing" && (
          <div className="parse-hint">Reading label…</div>
        )}

        {parseStatus === "failed" && (
          <div className="parse-warning">
            {errorMsg || "Couldn't read the label on this device/deployment."}
          </div>
        )}

        {parseStatus === "parsed" && parsedItem?.mode === "stub" && (
          <div className="parse-warning">
            Couldn't read the label on this device/deployment.
            {parsedItem?.rawTextHints?.length
              ? ` (${parsedItem.rawTextHints.join(", ")})`
              : ""}
          </div>
        )}

        <div className="scan-buttons">
          <button
            disabled={parseStatus === "parsing"}
            onClick={() => frontInputRef.current?.click()}
          >
            {frontImage ? "Re-scan product front" : "Scan product front"}
          </button>

          <button
            disabled={!frontImage || parseStatus === "parsing"}
            className={frontImage ? "primary" : ""}
            onClick={() => ingredientsInputRef.current?.click()}
            title={!frontImage ? "Scan the front first" : undefined}
          >
            {ingredientsImage
              ? "Re-scan ingredients label"
              : "Scan ingredients label"}
          </button>
        </div>

        <div className="thumbs">
          {frontImage && <img src={frontImage} alt="Front" />}
          {ingredientsImage && <img src={ingredientsImage} alt="Ingredients" />}
        </div>

        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button
            className="primary"
            disabled={!canConfirm}
            onClick={confirm}
          >
            Add to your {kind === "med" ? "medications" : "supplements"}
          </button>
        </div>

        {import.meta.env.DEV && (
          <div className="dev-debug">
            status={parseStatus} | mode={parsedItem?.mode ?? "–"} | confidence=
            {parsedItem?.confidence ?? "–"}
          </div>
        )}

        <input
          ref={frontInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFrontCapture(f);
            e.target.value = "";
          }}
        />

        <input
          ref={ingredientsInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleIngredientsCapture(f);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}
