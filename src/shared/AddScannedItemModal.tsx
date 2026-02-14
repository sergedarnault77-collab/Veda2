// src/shared/AddScannedItemModal.tsx
import { useEffect, useRef, useState } from "react";
import { fileToDataUrl } from "../lib/persist";
import { parseScannedItem } from "../lib/parse-item";
import type { ParsedItem } from "../lib/parse-item";

export type ScannedItemDraft = {
  name: string;
  frontDataUrl: string;
  ingredientsDataUrl: string;
  // Parsed fields (may be null if parse failed or stub)
  brand: string | null;
  form: ParsedItem["form"];
  strengthPerUnit: number | null;
  strengthUnit: ParsedItem["strengthUnit"];
  servingSizeText: string | null;
  rawTextHints: string[];
  parseConfidence: number;
  parseMode: "openai" | "stub";
};

type ParseStatus = "idle" | "parsing" | "parsed" | "failed";

export function AddScannedItemModal(props: {
  kind: "med" | "supp";
  onCancel: () => void;
  onConfirm: (draft: ScannedItemDraft) => void;
}) {
  const defaultName = props.kind === "med" ? "New medication" : "New supplement";
  const [name, setName] = useState(defaultName);
  const [frontDataUrl, setFrontDataUrl] = useState<string | null>(null);
  const [ingredientsDataUrl, setIngredientsDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [parseStatus, setParseStatus] = useState<ParseStatus>("idle");
  const [parsedItem, setParsedItem] = useState<ParsedItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const userEditedName = useRef(false);

  const frontRef = useRef<HTMLInputElement | null>(null);
  const ingRef = useRef<HTMLInputElement | null>(null);

  async function onPickFront(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true);
    try {
      setFrontDataUrl(await fileToDataUrl(f));
    } finally {
      setBusy(false);
    }
  }

  async function onPickIng(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true);
    try {
      setIngredientsDataUrl(await fileToDataUrl(f));
    } finally {
      setBusy(false);
    }
  }

  // Auto-parse ONCE when both images are captured
  useEffect(() => {
    if (!frontDataUrl || !ingredientsDataUrl) return;
    let cancelled = false;
    setParseStatus("parsing");
    setParsedItem(null);

    parseScannedItem(props.kind, frontDataUrl, ingredientsDataUrl)
      .then((item) => {
        if (cancelled) return;
        console.log("[parse] response", item);
        setParsedItem(item);
        if (!userEditedName.current) {
          if (item.mode === "openai" && item.displayName) {
            setName(item.displayName);
          } else {
            setName("Unrecognized item");
          }
        }
        setParseStatus("parsed");
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[parse] error", err);
        setParseStatus("failed");
        if (!userEditedName.current) {
          setName("Unrecognized item");
        }
      });

    return () => { cancelled = true; };
  }, [frontDataUrl, ingredientsDataUrl, props.kind]);

  const isParsing = parseStatus === "parsing";
  const canIng = !!frontDataUrl;
  const canConfirm =
    !!frontDataUrl && !!ingredientsDataUrl && name.trim().length > 0 && !isParsing && !isSaving;

  function handleConfirm() {
    if (isSaving) return;
    setIsSaving(true);

    props.onConfirm({
      name: name.trim(),
      frontDataUrl: frontDataUrl!,
      ingredientsDataUrl: ingredientsDataUrl!,
      brand: parsedItem?.brand ?? null,
      form: parsedItem?.form ?? null,
      strengthPerUnit: parsedItem?.strengthPerUnit ?? null,
      strengthUnit: parsedItem?.strengthUnit ?? null,
      servingSizeText: parsedItem?.servingSizeText ?? null,
      rawTextHints: parsedItem?.rawTextHints ?? [],
      parseConfidence: parsedItem?.confidence ?? 0,
      parseMode: parsedItem?.mode ?? "stub",
    });

    // Reset local state
    setName(defaultName);
    setFrontDataUrl(null);
    setIngredientsDataUrl(null);
    setParsedItem(null);
    setParseStatus("idle");
    userEditedName.current = false;
    setIsSaving(false);
  }

  // Helper
  const strengthLine =
    parsedItem?.strengthPerUnit != null && parsedItem?.strengthUnit
      ? `${parsedItem.strengthPerUnit} ${parsedItem.strengthUnit}`
      : null;

  const isStubOrFailed =
    parseStatus === "failed" ||
    (parseStatus === "parsed" && parsedItem?.mode === "stub");

  return (
    <div style={styles.backdrop}>
      <div style={styles.modal}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>
              {props.kind === "med" ? "Add medication" : "Add supplement"}
            </div>
            <div style={{ opacity: 0.75, fontSize: 13, marginTop: 4 }}>
              Take a photo of the front, then the ingredients label.
            </div>
          </div>
          <button onClick={props.onCancel} style={styles.ghostBtn}>✕</button>
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={styles.label}>Name</label>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              userEditedName.current = true;
            }}
            style={styles.input}
            placeholder={props.kind === "med" ? "e.g. Brand + dosage" : "e.g. Magnesium glycinate"}
          />
          {parseStatus === "parsed" && parsedItem?.mode === "openai" && strengthLine && (
            <div style={styles.detectedHint}>
              Detected: {strengthLine}{parsedItem.form ? ` · ${parsedItem.form}` : ""}
            </div>
          )}
        </div>

        {/* hidden inputs */}
        <input ref={frontRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={onPickFront} />
        <input ref={ingRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={onPickIng} />

        <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
          <button
            disabled={busy || isParsing}
            onClick={() => frontRef.current?.click()}
            style={{ ...styles.btn, opacity: (busy || isParsing) ? 0.6 : 1 }}
          >
            {frontDataUrl ? "Re-scan product front" : "Scan product front"}
          </button>

          <button
            disabled={!canIng || busy || isParsing}
            onClick={() => ingRef.current?.click()}
            style={{
              ...styles.btn,
              background: canIng ? "rgba(108,92,231,0.30)" : "rgba(255,255,255,0.08)",
              borderColor: canIng ? "rgba(108,92,231,0.45)" : "rgba(255,255,255,0.14)",
              opacity: (!canIng || busy || isParsing) ? 0.6 : 1,
            }}
            title={!canIng ? "Scan the front first" : ""}
          >
            {ingredientsDataUrl ? "Re-scan ingredients label" : "Scan ingredients label"}
          </button>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          {frontDataUrl && <img src={frontDataUrl} alt="Front" style={styles.preview} />}
          {ingredientsDataUrl && <img src={ingredientsDataUrl} alt="Ingredients" style={styles.preview} />}
        </div>

        {/* Parsing spinner */}
        {isParsing && (
          <div style={styles.parseStatus}>Reading label…</div>
        )}

        {/* Amber warning for stub / failure */}
        {isStubOrFailed && (
          <div style={styles.stubWarning}>
            Couldn't read the label on this device/deployment.
            {parsedItem?.rawTextHints?.length
              ? ` (${parsedItem.rawTextHints.join(", ")})`
              : ""}
          </div>
        )}

        {/* Parsed details — only for successful openai parse */}
        {parseStatus === "parsed" && parsedItem?.mode === "openai" && (
          <div style={styles.parsedDetails}>
            {parsedItem.brand && (
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Brand</span>
                <span>{parsedItem.brand}</span>
              </div>
            )}
            {strengthLine && (
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Strength</span>
                <span>{strengthLine}{parsedItem.form ? ` (${parsedItem.form})` : ""}</span>
              </div>
            )}
            {parsedItem.servingSizeText && (
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Serving</span>
                <span>{parsedItem.servingSizeText}</span>
              </div>
            )}
          </div>
        )}

        {/* Dev debug */}
        {import.meta.env.DEV && (
          <div style={styles.debugLine}>
            [debug] status={parseStatus} mode={parsedItem?.mode ?? "–"} conf={parsedItem?.confidence ?? "–"}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
          <button onClick={props.onCancel} style={styles.ghostBtn}>Cancel</button>
          <button
            disabled={!canConfirm || busy || isSaving}
            onClick={handleConfirm}
            style={{ ...styles.primaryBtn, opacity: (!canConfirm || busy || isSaving) ? 0.55 : 1 }}
          >
            {isSaving ? "Adding…" : `Add to your ${props.kind === "med" ? "medications" : "supplements"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, any> = {
  backdrop: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: 16, zIndex: 50,
  },
  modal: {
    width: "min(560px, 100%)",
    maxHeight: "90vh",
    overflowY: "auto",
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(12,12,16,0.92)",
    backdropFilter: "blur(12px)",
    padding: 16,
    boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
    color: "rgba(255,255,255,0.92)",
  },
  label: { fontSize: 12, opacity: 0.7, display: "block", marginBottom: 6 },
  input: {
    width: "100%", borderRadius: 12, padding: "10px 12px",
    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
    color: "rgba(255,255,255,0.92)", outline: "none", fontFamily: "inherit",
  },
  btn: {
    width: "100%", padding: "12px 12px", borderRadius: 14,
    background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)",
    color: "rgba(255,255,255,0.92)", cursor: "pointer", fontFamily: "inherit",
  },
  ghostBtn: {
    padding: "10px 12px", borderRadius: 12,
    background: "transparent", border: "1px solid rgba(255,255,255,0.14)",
    color: "rgba(255,255,255,0.9)", cursor: "pointer", fontFamily: "inherit",
  },
  primaryBtn: {
    padding: "10px 12px", borderRadius: 12,
    background: "rgba(108,92,231,0.34)", border: "1px solid rgba(108,92,231,0.55)",
    color: "rgba(255,255,255,0.95)", cursor: "pointer", fontFamily: "inherit",
  },
  preview: { width: 96, height: 96, objectFit: "cover", borderRadius: 14, border: "1px solid rgba(255,255,255,0.12)" },
  parseStatus: {
    marginTop: 12, padding: "10px 14px", borderRadius: 12,
    background: "rgba(108,92,231,0.10)", fontSize: 13, opacity: 0.8,
  },
  stubWarning: {
    marginTop: 12, padding: "10px 14px", borderRadius: 12,
    background: "rgba(230,126,34,0.12)", border: "1px solid rgba(230,126,34,0.3)",
    fontSize: 13, color: "rgba(230,168,80,0.95)",
  },
  parsedDetails: {
    marginTop: 12, padding: "10px 14px", borderRadius: 12,
    background: "rgba(255,255,255,0.04)", fontSize: 13,
    display: "flex", flexDirection: "column", gap: 6,
  },
  detailRow: { display: "flex", gap: 8 },
  detailLabel: { opacity: 0.55, minWidth: 64 },
  detectedHint: {
    marginTop: 6, fontSize: 12, opacity: 0.65,
    color: "rgba(108,92,231,0.9)",
  },
  debugLine: {
    marginTop: 8, fontSize: 10, opacity: 0.4, fontFamily: "monospace",
  },
};
