// src/shared/AddScannedItemModal.tsx
import { useRef, useState } from "react";
import { fileToDataUrl } from "../lib/persist";

export type ScannedItemDraft = {
  name: string;
  frontDataUrl: string;
  ingredientsDataUrl: string;
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

  const frontRef = useRef<HTMLInputElement | null>(null);
  const ingRef = useRef<HTMLInputElement | null>(null);

  async function onPickFront(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true);
    try {
      const dataUrl = await fileToDataUrl(f);
      setFrontDataUrl(dataUrl);
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
      const dataUrl = await fileToDataUrl(f);
      setIngredientsDataUrl(dataUrl);
    } finally {
      setBusy(false);
    }
  }

  const canIng = !!frontDataUrl;
  const canConfirm = !!frontDataUrl && !!ingredientsDataUrl && name.trim().length > 0;

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
            disabled={busy}
            onClick={() => frontRef.current?.click()}
            style={{ ...styles.btn, opacity: busy ? 0.6 : 1 }}
          >
            Scan product front
          </button>

          <button
            disabled={!canIng || busy}
            onClick={() => ingRef.current?.click()}
            style={{
              ...styles.btn,
              background: canIng ? "rgba(108,92,231,0.30)" : "rgba(255,255,255,0.08)",
              borderColor: canIng ? "rgba(108,92,231,0.45)" : "rgba(255,255,255,0.14)",
              opacity: (!canIng || busy) ? 0.6 : 1,
            }}
            title={!canIng ? "Scan the front first" : ""}
          >
            Scan ingredients label
          </button>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          {frontDataUrl && <img src={frontDataUrl} alt="Front" style={styles.preview} />}
          {ingredientsDataUrl && <img src={ingredientsDataUrl} alt="Ingredients" style={styles.preview} />}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
          <button onClick={props.onCancel} style={styles.ghostBtn}>Cancel</button>
          <button
            disabled={!canConfirm || busy}
            onClick={() => props.onConfirm({ name: name.trim(), frontDataUrl: frontDataUrl!, ingredientsDataUrl: ingredientsDataUrl! })}
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
    color: "rgba(255,255,255,0.92)", outline: "none",
  },
  btn: {
    width: "100%", padding: "12px 12px", borderRadius: 14,
    background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)",
    color: "rgba(255,255,255,0.92)", cursor: "pointer",
  },
  ghostBtn: {
    padding: "10px 12px", borderRadius: 12,
    background: "transparent", border: "1px solid rgba(255,255,255,0.14)",
    color: "rgba(255,255,255,0.9)", cursor: "pointer",
  },
  primaryBtn: {
    padding: "10px 12px", borderRadius: 12,
    background: "rgba(108,92,231,0.34)", border: "1px solid rgba(108,92,231,0.55)",
    color: "rgba(255,255,255,0.95)", cursor: "pointer",
  },
  preview: { width: 96, height: 96, objectFit: "cover", borderRadius: 14, border: "1px solid rgba(255,255,255,0.12)" },
};
