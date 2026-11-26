// Serves the downloaded model files over a local HTTP server, so tests can load
// the real checkers the way a page does (both packages fetch `baseUrl + file`,
// and Node's fetch can't read file: URLs). See AgDR-0006.
import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const MODELS_DIR = fileURLToPath(new URL("../../apps/playground/public/models/", import.meta.url));

export interface ModelServer {
  /** Ends in "/"; the English files are at `${baseUrl}en/`, the Arabic ones at `${baseUrl}ar/`. */
  readonly baseUrl: string;
  close(): Promise<void>;
}

/** Starts the server. Fails, never skips, when the models haven't been downloaded. */
export async function startModelServer(): Promise<ModelServer> {
  for (const file of ["en/words.txt", "ar/model.onnx"]) {
    if (!existsSync(join(MODELS_DIR, file))) {
      throw new Error(`Model file ${file} is missing from ${MODELS_DIR}. Run \`npm run fetch-models\` first.`);
    }
  }
  const root = normalize(MODELS_DIR);
  const server = createServer((request, response) => {
    const path = normalize(join(root, decodeURIComponent(new URL(request.url ?? "/", "http://x").pathname)));
    if (!path.startsWith(root.endsWith(sep) ? root : root + sep) || !existsSync(path)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200);
    createReadStream(path).pipe(response);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}/`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}
