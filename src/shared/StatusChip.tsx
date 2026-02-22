import type { ReactNode } from "react";

const styles = {
  ok: "bg-veda-balance-soft text-veda-balance",
  caution: "bg-veda-caution-soft text-veda-caution",
  issue: "bg-veda-issue-soft text-veda-issue",
} as const;

export function StatusChip({ kind, children }: { kind: keyof typeof styles; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[kind]}`}>
      {children}
    </span>
  );
}
