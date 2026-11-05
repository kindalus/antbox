import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const source = new URL("./antbox.d.ts", import.meta.url);
const target = new URL("../antbox.d.ts", import.meta.url);

await fs.copyFile(fileURLToPath(source), fileURLToPath(target));
console.log(`Generated ${fileURLToPath(target)}`);
