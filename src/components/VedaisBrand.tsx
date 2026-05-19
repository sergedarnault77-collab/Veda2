/** Inline brand name — always muted powder blue (#8FAABC). */
export function VedaisBrand({ suffix = "" }: { suffix?: string }) {
  return <span className="vedais-brand">Vedais{suffix}</span>;
}

/** Highlight "Vedais" in plain text (e.g. API disclaimers). */
export function VedaisInText({ text }: { text: string }) {
  const parts = text.split(/(Vedais)/g);
  return (
    <>
      {parts.map((part, i) =>
        part === "Vedais" ? <VedaisBrand key={i} /> : <span key={i}>{part}</span>
      )}
    </>
  );
}
