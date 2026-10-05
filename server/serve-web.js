/**
 * Small dependency-free server for a Plesk Node.js deployment.
 *
 * It serves the output created by `pnpm run build:web` and falls back to
 * index.html for Expo Router client-side routes.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const STATIC_ROOT = path.resolve(
  __dirname,
  "..",
  process.env.STATIC_DIR || "web-build",
);
const port = Number.parseInt(process.env.PORT || "3000", 10);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".map": "application/json",
};

function sendFile(filePath, res) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return false;
  }

  const extension = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    "content-type": MIME_TYPES[extension] || "application/octet-stream",
    "cache-control":
      extension === ".html"
        ? "no-cache"
        : "public, max-age=31536000, immutable",
  });
  res.end(fs.readFileSync(filePath));
  return true;
}

function safeFilePath(requestPath) {
  const decodedPath = decodeURIComponent(requestPath.split("?")[0]);
  const relativePath = decodedPath.replace(/^[/\\]+/, "");
  const filePath = path.resolve(STATIC_ROOT, relativePath);
  return filePath.startsWith(STATIC_ROOT) ? filePath : null;
}

const server = http.createServer((req, res) => {
  try {
    const requestedFile = safeFilePath(req.url || "/");
    if (requestedFile && sendFile(requestedFile, res)) {
      return;
    }

    const indexFile = path.join(STATIC_ROOT, "index.html");
    if (sendFile(indexFile, res)) {
      return;
    }

    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Web build not found. Run pnpm run build:web first.");
  } catch (error) {
    console.error(error);
    res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    res.end("Bad request");
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Serving Expo web build from ${STATIC_ROOT} on port ${port}`);
});