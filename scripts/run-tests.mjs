import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

// React's testing APIs and Vite's Node resolution require a test environment,
// even when the invoking shell exports NODE_ENV=production.
const result = spawnSync(
  process.execPath,
  [
    fileURLToPath(
      new URL("vitest.mjs", import.meta.resolve("vitest/package.json")),
    ),
    ...process.argv.slice(2),
  ],
  { stdio: "inherit", env: { ...process.env, NODE_ENV: "test" } },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
