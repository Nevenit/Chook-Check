import { readFileSync } from "node:fs";
import { join } from "node:path";

const outputs = ["chrome-mv3", "firefox-mv3"];
const expectedCollectors = new Map([
  ["https://www.woolworths.com.au/*", "woolworths-collector.js"],
  ["https://www.coles.com.au/*", "coles-collector.js"],
]);
const forbiddenCollectorMarkers = [
  "wxt:content-script-started",
  "postMessage(",
  "dispatchEvent(",
  "runtime.getURL(",
  "chrome-extension://",
  "moz-extension://",
  "appendChild(",
  ".append(",
  ".prepend(",
  "insertAdjacent",
  "replaceChildren(",
  "attachShadow(",
  "setAttribute(",
  "document.write(",
];

for (const output of outputs) {
  const outputDir = join(".output", output);
  const manifest = JSON.parse(
    readFileSync(join(outputDir, "manifest.json"), "utf8"),
  );
  const contentScripts = manifest.content_scripts ?? [];

  if (manifest.web_accessible_resources?.length) {
    throw new Error(`${output}: web-accessible resources must remain empty`);
  }
  if (contentScripts.length !== expectedCollectors.size) {
    throw new Error(`${output}: unexpected manifest content script count`);
  }

  for (const [match, filename] of expectedCollectors) {
    const entry = contentScripts.find(
      (candidate) =>
        candidate.matches?.length === 1 && candidate.matches[0] === match,
    );
    if (
      !entry ||
      entry.js?.length !== 1 ||
      entry.js[0] !== filename ||
      entry.run_at !== "document_idle"
    ) {
      throw new Error(`${output}: invalid silent collector entry for ${match}`);
    }

    const source = readFileSync(join(outputDir, filename), "utf8");
    for (const marker of forbiddenCollectorMarkers) {
      if (source.includes(marker)) {
        throw new Error(`${output}/${filename}: forbidden marker ${marker}`);
      }
    }
  }
}
