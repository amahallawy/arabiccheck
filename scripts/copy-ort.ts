// Copies the onnxruntime-web WebAssembly runtime into apps/playground/public/ort/,
// so the page loads it from its own origin and never from a CDN (AgDR-0003, AgDR-0005).
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { copyOrt, ortDistDir } from "./lib/ort.ts";

const playground = fileURLToPath(new URL("../apps/playground/", import.meta.url));

try {
  const copied = await copyOrt(
    ortDistDir(join(playground, "package.json")),
    join(playground, "public", "ort"),
  );
  console.log(`copy-ort: ${copied.join(", ")} -> apps/playground/public/ort/`);
} catch (error) {
  console.error(`copy-ort failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
