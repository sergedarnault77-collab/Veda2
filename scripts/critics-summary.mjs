import fs from "node:fs";
import path from "node:path";
import { ensureDirs, CRIT_DIR, writeText } from "./_critic_shared.mjs";

ensureDirs();

const marker = "<!-- veda-critics -->";
const visionMd = path.join(CRIT_DIR, "vision.md");
const dataMd = path.join(CRIT_DIR, "data.md");
const out = path.join(CRIT_DIR, "summary.md");

const v = fs.existsSync(visionMd) ? fs.readFileSync(visionMd, "utf8") : "## AI Vision critic\n\n(Missing)\n";
const d = fs.existsSync(dataMd) ? fs.readFileSync(dataMd, "utf8") : "## AI Data sanity critic\n\n(Missing)\n";

const summary =
`${marker}
# Veda critics report

${v}

---

${d}
`;

writeText(out, summary);
