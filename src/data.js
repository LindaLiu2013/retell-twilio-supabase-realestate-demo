import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function readJson(relativePath) {
  const path = fileURLToPath(new URL(relativePath, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8"));
}
