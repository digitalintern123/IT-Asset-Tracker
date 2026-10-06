/**
 * Production web server and SharePoint API backend for ENCALM Asset Tracker.
 * Serves Expo Web static bundle and provides integrated /api/assets REST endpoints.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const sharepointApi = require("./sharepoint-api");

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

const FAVICON_HEAD_TAGS = [
  '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png?v=3">',
  '<link rel="icon" type="image/png" sizes="128x128" href="/favicon.png?v=3">',
  '<link rel="icon" type="image/x-icon" href="/favicon.ico?v=3">',
  '<link rel="apple-touch-icon" sizes="192x192" href="/apple-touch-icon.png?v=3">',
  '<link rel="preconnect" href="https://fonts.googleapis.com">',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
  '<link href="https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">',
  '<style>',
  '  body, [class*="css-text"] { font-family: "Open Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important; letter-spacing: 0.3px; }',
  '  .encalm-serif, h1, h2, [data-encalm-heading="true"] { font-family: "Playfair Display", Georgia, serif !important; }',
  '</style>'
].join("\n");

function sendFile(filePath, res) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return false;
  }

  const extension = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath).toLowerCase();
  const isFavicon = basename.includes("favicon") || basename.includes("apple-touch-icon");

  let cacheControl = "public, max-age=31536000, immutable";
  if (extension === ".html") {
    cacheControl = "no-cache, no-store, must-revalidate";
  } else if (isFavicon) {
    cacheControl = "public, max-age=3600, must-revalidate";
  }

  let payload;
  try {
    if (extension === ".html") {
      let content = fs.readFileSync(filePath, "utf8");
      if (content.includes("</head>")) {
        content = content.replace("</head>", `${FAVICON_HEAD_TAGS}\n</head>`);
      }
      payload = content;
    } else {
      payload = fs.readFileSync(filePath);
    }
  } catch (readErr) {
    console.error(`Failed to read ${filePath}:`, readErr.message);
    return false;
  }

  res.writeHead(200, {
    "content-type": MIME_TYPES[extension] || "application/octet-stream",
    "cache-control": cacheControl,
  });
  res.end(payload);
  return true;
}

function safeFilePath(requestPath) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(requestPath.split("?")[0]);
  } catch {
    return null;
  }
  const relativePath = decodedPath.replace(/^[/\\]+/, "");
  if (!relativePath) return null;
  const filePath = path.resolve(STATIC_ROOT, relativePath);
  if (filePath === STATIC_ROOT) return filePath;
  return filePath.startsWith(STATIC_ROOT + path.sep) ? filePath : null;
}

const MAX_BODY_BYTES = 1_048_576; // 1 MB

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error("Request body too large"));
        return;
      }
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-ID-Token",
  });
  res.end(JSON.stringify(data));
}

function extractUserToken(req) {
  const auth = req.headers["authorization"] || "";
  if (auth.startsWith("Bearer ")) {
    return auth.slice(7).trim();
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  try {
    const cleanUrl = (req.url || "/").split("?")[0];
    const method = req.method.toUpperCase();

    // 0. Handle CORS preflight
    if (method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-ID-Token",
      });
      res.end();
      return;
    }

    // 1. Health checks
    if (
      cleanUrl === "/health" ||
      cleanUrl === "/healthz" ||
      cleanUrl === "/ping" ||
      cleanUrl === "/status" ||
      cleanUrl === "/api/health"
    ) {
      sendJson(res, 200, {
        status: "healthy",
        service: "encalm-asset-tracker",
        timestamp: Date.now(),
      });
      return;
    }

    // 2. BACKEND AUTH API: /api/auth/token & /api/auth/refresh
    if (cleanUrl.startsWith("/api/auth")) {
      try {
        if (cleanUrl === "/api/auth/token" && method === "POST") {
          const body = await parseBody(req);
          const tokens = await sharepointApi.exchangeAuthCode(body);
          sendJson(res, 200, tokens);
          return;
        }

        if (cleanUrl === "/api/auth/refresh" && method === "POST") {
          const body = await parseBody(req);
          const tokens = await sharepointApi.refreshAuthToken(body);
          sendJson(res, 200, tokens);
          return;
        }

        sendJson(res, 404, { error: `Endpoint not found: ${cleanUrl}` });
        return;
      } catch (authErr) {
        console.error(`Auth API Error on ${method} ${cleanUrl}:`, authErr.message);
        sendJson(res, 400, { error: authErr.message || "Auth exchange error" });
        return;
      }
    }

    // 3. BACKEND API: /api/assets
    if (cleanUrl.startsWith("/api/assets")) {
      const userToken = extractUserToken(req);
      const parts = cleanUrl.split("/").filter(Boolean); // ['api', 'assets', ':id']
      const assetId = parts[2] || null;

      // Extract role from token
      const ADMIN_EMAILS = [
        "digital.intern@encalm.com",
        "admin@encalmhospitality.com",
        "it@encalmhospitality.com",
      ];
      // Role and email are trusted only from a signature-verified id_token.
      // The bearer is a Graph access token, which cannot be verified here.
      let callerRole = "viewer";
      if (userToken) {
        let payload;
        try {
          payload = await sharepointApi.verifyIdToken(req.headers["x-id-token"]);
        } catch (verifyErr) {
          console.warn(`Rejected id_token on ${method} ${cleanUrl}:`, verifyErr.message);
          sendJson(res, 401, { error: "Unauthorized: Microsoft 365 sign-in could not be verified." });
          return;
        }
        const email = (payload.email || payload.upn || payload.preferred_username || "").toLowerCase();
        const roles = Array.isArray(payload.roles) ? payload.roles.map((r) => String(r).toLowerCase()) : [];
        if (roles.some((r) => r.includes("admin")) || ADMIN_EMAILS.includes(email)) {
          callerRole = "admin";
        } else if (roles.some((r) => r.includes("technician") || r.includes("staff"))) {
          callerRole = "technician";
        }
      }

      try {
        if (method === "GET" && !assetId) {
          if (!userToken) {
            sendJson(res, 401, { error: "Unauthorized: Microsoft 365 sign-in required." });
            return;
          }
          const assets = await sharepointApi.fetchAllAssets(userToken);
          sendJson(res, 200, { data: assets, count: assets.length });
          return;
        }

        if (method === "POST" && !assetId) {
          if (!userToken) {
            sendJson(res, 401, { error: "Unauthorized: Microsoft 365 sign-in required." });
            return;
          }
          if (callerRole === "viewer") {
            sendJson(res, 403, { error: "Forbidden: Viewer role cannot create assets." });
            return;
          }
          const body = await parseBody(req);
          const created = await sharepointApi.createAsset(userToken, body);
          sendJson(res, 201, { data: created });
          return;
        }

        if (method === "PATCH" && assetId) {
          if (!userToken) {
            sendJson(res, 401, { error: "Unauthorized: Microsoft 365 sign-in required." });
            return;
          }
          if (callerRole === "viewer") {
            sendJson(res, 403, { error: "Forbidden: Viewer role cannot modify assets." });
            return;
          }
          const body = await parseBody(req);
          const ifMatch = req.headers["if-match"] || null;
          const updated = await sharepointApi.updateAsset(userToken, assetId, body, ifMatch);
          sendJson(res, 200, { data: updated });
          return;
        }

        if (method === "DELETE" && assetId) {
          if (!userToken) {
            sendJson(res, 401, { error: "Unauthorized: Microsoft 365 sign-in required." });
            return;
          }
          if (callerRole !== "admin") {
            sendJson(res, 403, { error: "Forbidden: Only IT Administrators can permanently delete assets." });
            return;
          }
          await sharepointApi.deleteAsset(userToken, assetId);
          sendJson(res, 200, { success: true });
          return;
        }

        sendJson(res, 405, { error: `Method ${method} not allowed on ${cleanUrl}` });
        return;
      } catch (apiErr) {
        console.error(`API Error on ${method} ${cleanUrl}:`, apiErr.message);
        const status = apiErr.statusCode || 500;
        sendJson(res, status, { error: apiErr.message || "SharePoint API Error" });
        return;
      }
    }

    // 3. Direct Favicon handlers
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
    if (cleanUrl === "/favicon-32.png") {
      const fav32 = path.join(STATIC_ROOT, "favicon-32.png");
      if (sendFile(fav32, res)) return;
      const brand32 = path.resolve(__dirname, "..", "assets", "brand", "favicon-32.png");
      if (sendFile(brand32, res)) return;
    }
    if (cleanUrl === "/apple-touch-icon.png" || cleanUrl === "/apple-touch-icon-precomposed.png") {
      const touchPng = path.join(STATIC_ROOT, "apple-touch-icon.png");
      if (sendFile(touchPng, res)) return;
      const brandTouch = path.resolve(__dirname, "..", "assets", "brand", "apple-touch-icon.png");
      if (sendFile(brandTouch, res)) return;
    }

    // 4. Static frontend asset files
    const requestedFile = safeFilePath(req.url || "/");
    if (requestedFile && sendFile(requestedFile, res)) {
      return;
    }

    // 5. SPA Fallback: root index.html
    const indexFile = path.join(STATIC_ROOT, "index.html");
    if (sendFile(indexFile, res)) {
      return;
    }

    // 6. SPA Fallback: login.html
    const loginFile = path.join(STATIC_ROOT, "login.html");
    if (sendFile(loginFile, res)) {
      return;
    }

    // 7. Fallback: any available html file
    if (fs.existsSync(STATIC_ROOT)) {
      const files = fs.readdirSync(STATIC_ROOT).filter((f) => f.endsWith(".html"));
      if (files.length > 0 && sendFile(path.join(STATIC_ROOT, files[0]), res)) {
        return;
      }
    }

    // 8. Safe 200 OK fallback HTML
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(
      `<!DOCTYPE html><html><head><title>ENCALM Asset Tracker</title>${FAVICON_HEAD_TAGS}</head><body><h1>ENCALM Asset Tracker</h1><p>Starting up...</p></body></html>`
    );
  } catch (error) {
    console.error("Unhandled server error:", error);
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end("Internal Server Error");
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`ENCALM Web & API Server running on port ${port} (static: ${STATIC_ROOT})`);
});