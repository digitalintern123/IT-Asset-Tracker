/**
 * Production web server for ENCALM Asset Tracker on Render / Docker.
 * Includes dedicated health endpoints, brand favicon handlers, and robust SPA fallback.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const STATIC_ROOT = path.resolve(
  __dirname,
  "..",
  process.env.STATIC_DIR || "web-build",
);
const port = Number.parseInt(process.env.PORT || "10000", 10);

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
  if (!relativePath) return null;
  const filePath = path.resolve(STATIC_ROOT, relativePath);
  return filePath.startsWith(STATIC_ROOT) ? filePath : null;
}

const server = http.createServer((req, res) => {
  try {
    const cleanUrl = (req.url || "/").split("?")[0];

    // 1. Instant 200 OK for health check endpoints (Render / AWS / K8s)
    if (
      cleanUrl === "/health" ||
      cleanUrl === "/healthz" ||
      cleanUrl === "/ping" ||
      cleanUrl === "/status"
    ) {
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end("OK");
      return;
    }

    // 2. Direct Encalm favicon handlers
    if (cleanUrl === "/favicon.ico") {
      const favIco = path.join(STATIC_ROOT, "favicon.ico");
      if (sendFile(favIco, res)) return;
      const rootIco = path.resolve(__dirname, "..", "favicon.ico");
      if (sendFile(rootIco, res)) return;
    }
    if (cleanUrl === "/favicon.png") {
      const favPng = path.join(STATIC_ROOT, "favicon.png");
      if (sendFile(favPng, res)) return;
      const brandPng = path.resolve(__dirname, "..", "assets", "brand", "encalm-favicon.png");
      if (sendFile(brandPng, res)) return;
    }

    // 3. Serve static asset if requested file exists
    const requestedFile = safeFilePath(req.url || "/");
    if (requestedFile && sendFile(requestedFile, res)) {
      return;
    }

    // 4. SPA Fallback: root index.html
    const indexFile = path.join(STATIC_ROOT, "index.html");
    if (sendFile(indexFile, res)) {
      return;
    }

    // 5. Fallback: login.html
    const loginFile = path.join(STATIC_ROOT, "login.html");
    if (sendFile(loginFile, res)) {
      return;
    }

    // 6. Fallback: any available html file in static root
    if (fs.existsSync(STATIC_ROOT)) {
      const files = fs.readdirSync(STATIC_ROOT).filter((f) => f.endsWith(".html"));
      if (files.length > 0 && sendFile(path.join(STATIC_ROOT, files[0]), res)) {
        return;
      }
    }

    // 7. Safe 200 OK fallback HTML so health check never times out
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(
      "<!DOCTYPE html><html><head><title>ENCALM Asset Tracker</title><link rel='icon' href='/favicon.ico'></head><body><h1>ENCALM Asset Tracker</h1><p>Starting up...</p></body></html>"
    );
  } catch (error) {
    console.error("Request handling error:", error);
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end("Internal Server Error");
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Serving Expo web build from ${STATIC_ROOT} on port ${port}`);
});