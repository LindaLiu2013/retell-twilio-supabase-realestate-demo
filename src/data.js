import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function dataPath(relativePath) {
  return fileURLToPath(new URL(relativePath, import.meta.url));
}

export function readJson(relativePath) {
  return JSON.parse(readFileSync(dataPath(relativePath), "utf8"));
}

export function writeJson(relativePath, value) {
  writeFileSync(dataPath(relativePath), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
