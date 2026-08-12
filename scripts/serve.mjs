import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

export function createStaticServer({ root, port = 4174, hostname = "127.0.0.1" }) {
  const absoluteRoot = path.resolve(root);
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || "/", `http://${request.headers.host || `${hostname}:${port}`}`);
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      response.writeHead(400).end("Bad request");
      return;
    }
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const file = path.resolve(absoluteRoot, relative);
    if (file !== absoluteRoot && !file.startsWith(`${absoluteRoot}${path.sep}`)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    try {
      const info = await stat(file);
      if (!info.isFile()) throw new Error("Not a file");
      const extension = path.extname(file).toLowerCase();
      const headers = {
        "Content-Type": CONTENT_TYPES[extension] || "application/octet-stream",
        "Cache-Control": [".html", ".webmanifest"].includes(extension) || path.basename(file) === "sw.js" ? "no-cache" : "public, max-age=60",
        "X-Content-Type-Options": "nosniff",
      };
      if (path.basename(file) === "sw.js") headers["Service-Worker-Allowed"] = "/";
      response.writeHead(200, headers);
      createReadStream(file).pipe(response);
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
    }
  });

  return {
    server,
    listen: () => new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, hostname, () => {
        server.removeListener("error", reject);
        resolve(server.address());
      });
    }),
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const requestedRoot = process.argv.find((value, index) => index > 1 && process.argv[index - 1] !== "--port" && !value.startsWith("--")) || "dist";
  const portIndex = process.argv.indexOf("--port");
  const port = portIndex >= 0 ? Number(process.argv[portIndex + 1]) : 4174;
  const root = path.resolve(process.cwd(), requestedRoot);
  const staticServer = createStaticServer({ root, port });
  await staticServer.listen();
  console.log(`OpeningLab test server ready on http://127.0.0.1:${port}`);
  const stop = async () => {
    await staticServer.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
