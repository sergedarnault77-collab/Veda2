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

export function AddScannedItemModal(props: {
  kind: "med" | "supp";
  onCancel: () => void;
  onConfirm: (draft: ScannedItemDraft) => void;
}) {
  const [name, setName] = useState(props.kind === "med" ? "New medication" : "New supplement");
  const [frontDataUrl, setFrontDataUrl] = useState<string | null>(null);
  const [ingredientsDataUrl, setIngredientsDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedItem | null>(null);

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

  // Auto-parse once both images are captured
  useEffect(() => {
    if (!frontDataUrl || !ingredientsDataUrl) return;
    let cancelled = false;
    setParsing(true);
    parseScannedItem(props.kind, frontDataUrl, ingredientsDataUrl).then((item) => {
      if (cancelled) return;
      setParsed(item);
      // Auto-fill name from parsed displayName (user can still edit)
      if (item.displayName && item.mode !== "stub") {
        setName(item.displayName);
      }
      setParsing(false);
    });
    return () => { cancelled = true; };
  }, [frontDataUrl, ingredientsDataUrl, props.kind]);

  const canIng = !!frontDataUrl;
  const canConfirm = !!frontDataUrl && !!ingredientsDataUrl && name.trim().length > 0 && !parsing;

  function handleConfirm() {
    props.onConfirm({
      name: name.trim(),
      frontDataUrl: frontDataUrl!,
      ingredientsDataUrl: ingredientsDataUrl!,
      brand: parsed?.brand ?? null,
      form: parsed?.form ?? null,
      strengthPerUnit: parsed?.strengthPerUnit ?? null,
      strengthUnit: parsed?.strengthUnit ?? null,
      servingSizeText: parsed?.servingSizeText ?? null,
      rawTextHints: parsed?.rawTextHints ?? [],
      parseConfidence: parsed?.confidence ?? 0,
      parseMode: parsed?.mode ?? "stub",
    });
  }

  // Helper to render the strength line
  const strengthLine =
    parsed?.strengthPerUnit != null && parsed?.strengthUnit
      ? `${parsed.strengthPerUnit} ${parsed.strengthUnit}`
      : null;

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
            onChange={(e) => setName(e.target.value)}
            style={styles.input}
            placeholder={props.kind === "med" ? "e.g. Brand + dosage" : "e.g. Magnesium glycinate"}
          />
        </div>

        {/* hidden inputs */}
        <input ref={frontRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={onPickFront} />
        <input ref={ingRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={onPickIng} />

        <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
          <button
            disabled={busy || parsing}
            onClick={() => frontRef.current?.click()}
            style={{ ...styles.btn, opacity: (busy || parsing) ? 0.6 : 1 }}
          >
            {frontDataUrl ? "Re-scan product front" : "Scan product front"}
          </button>

          <button
            disabled={!canIng || busy || parsing}
            onClick={() => ingRef.current?.click()}
            style={{
              ...styles.btn,
              background: canIng ? "rgba(108,92,231,0.30)" : "rgba(255,255,255,0.08)",
              borderColor: canIng ? "rgba(108,92,231,0.45)" : "rgba(255,255,255,0.14)",
              opacity: (!canIng || busy || parsing) ? 0.6 : 1,
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

        {/* Parsing status / parsed details */}
        {parsing && (
          <div style={styles.parseStatus}>Reading label…</div>
        )}

        {parsed && !parsing && (
          <div style={styles.parsedDetails}>
            {parsed.brand && (
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Brand</span>
                <span>{parsed.brand}</span>
              </div>
            )}
            {strengthLine && (
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Strength</span>
                <span>{strengthLine}{parsed.form ? ` (${parsed.form})` : ""}</span>
              </div>
            )}
            {parsed.servingSizeText && (
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Serving</span>
                <span>{parsed.servingSizeText}</span>
              </div>
            )}
            {parsed.mode === "stub" && (
              <div style={{ fontSize: 12, opacity: 0.5, marginTop: 4 }}>
                Could not read label — you can edit the name manually.
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
          <button onClick={props.onCancel} style={styles.ghostBtn}>Cancel</button>
          <button
            disabled={!canConfirm || busy}
            onClick={handleConfirm}
            style={{ ...styles.primaryBtn, opacity: (!canConfirm || busy) ? 0.55 : 1 }}
          >
            Add to your {props.kind === "med" ? "medications" : "supplements"}
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
  parsedDetails: {
    marginTop: 12, padding: "10px 14px", borderRadius: 12,
    background: "rgba(255,255,255,0.04)", fontSize: 13,
    display: "flex", flexDirection: "column", gap: 6,
  },
  detailRow: { display: "flex", gap: 8 },
  detailLabel: { opacity: 0.55, minWidth: 64 },
};
