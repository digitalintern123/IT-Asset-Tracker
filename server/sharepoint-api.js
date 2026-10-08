/**
 * Server-Side SharePoint Online Service via Microsoft Graph API.
 * Handles server-to-server Microsoft Graph operations with zero external dependencies.
 */

const crypto = require("crypto");
const https = require("https");
const { URL } = require("url");

const GRAPH_HOST = "graph.microsoft.com";
const TENANT_ID = process.env.AZURE_TENANT_ID || "cee20abc-e97b-434e-a89b-e8c8ca3d3d75";
const CLIENT_ID = process.env.AZURE_CLIENT_ID || "96823f1a-bdb9-49c5-8461-d181438c74e3";
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET || "";
const SHAREPOINT_SITE_URL = process.env.SHAREPOINT_SITE_URL || "https://encalmit.sharepoint.com";
const LIST_NAME = process.env.SHAREPOINT_LIST_NAME || "IT Asset Register";

// Memory cache for IDs and app token
let cachedSiteId = null;
let cachedListId = null;
let appTokenCache = { token: null, expiresAt: 0 };

/**
 * Make HTTPS request using standard Node.js https module.
 */
function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      // Collect raw bytes: decoding chunk by chunk would split multi-byte
      // characters (e.g. the "—" in locations) into U+FFFD.
      const chunks = [];
      res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        try {
          const parsed = body ? JSON.parse(body) : {};
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, data: body });
        }
      });
    });

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });

    if (data) {
      req.write(typeof data === "string" ? data : JSON.stringify(data));
    }
    req.end();
  });
}

/**
 * Acquire application token using client_credentials grant if CLIENT_SECRET is provided.
 */
async function getAppToken() {
  if (!CLIENT_SECRET) return null;

  if (appTokenCache.token && Date.now() < appTokenCache.expiresAt - 60000) {
    return appTokenCache.token;
  }

  const postData = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "client_credentials",
    scope: "https://graph.microsoft.com/.default",
  }).toString();

  const res = await request(
    {
      hostname: "login.microsoftonline.com",
      path: `/${TENANT_ID}/oauth2/v2.0/token`,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(postData),
      },
      timeout: 10000,
    },
    postData
  );

  if (res.status === 200 && res.data.access_token) {
    appTokenCache = {
      token: res.data.access_token,
      expiresAt: Date.now() + (res.data.expires_in || 3600) * 1000,
    };
    return appTokenCache.token;
  }

  console.warn("Could not acquire client_credentials token:", res.data);
  return null;
}

/**
 * Resolve effective token (app secret token takes precedence, otherwise forwarded user token).
 */
async function getEffectiveToken(userToken) {
  const appToken = await getAppToken();
  if (appToken) return appToken;
  if (userToken) return userToken;
  throw new Error("Unauthorized: No Microsoft 365 token or client secret configured.");
}

// Tenant signing keys for id_token verification, keyed by `kid`.
let jwksCache = new Map();
let jwksFetchedAt = 0;
const JWKS_MIN_REFRESH_MS = 60000;
const CLOCK_SKEW_SEC = 300;

function base64UrlDecode(segment) {
  return Buffer.from(segment.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

async function refreshJwks() {
  const res = await request({
    hostname: "login.microsoftonline.com",
    path: `/${TENANT_ID}/discovery/v2.0/keys`,
    method: "GET",
    timeout: 10000,
  });
  if (res.status !== 200 || !Array.isArray(res.data.keys)) {
    throw new Error(`Failed to fetch signing keys (HTTP ${res.status})`);
  }
  const next = new Map();
  for (const k of res.data.keys) {
    if (k.kty !== "RSA" || !k.kid || !k.n || !k.e) continue;
    next.set(k.kid, crypto.createPublicKey({ key: { kty: k.kty, n: k.n, e: k.e }, format: "jwk" }));
  }
  jwksCache = next;
  jwksFetchedAt = Date.now();
}

async function getSigningKey(kid) {
  if (!jwksCache.has(kid) && Date.now() - jwksFetchedAt > JWKS_MIN_REFRESH_MS) {
    await refreshJwks();
  }
  const key = jwksCache.get(kid);
  if (!key) throw new Error("Unknown token signing key");
  return key;
}

/**
 * Verify an Entra ID id_token (RS256 signature, iss, aud, exp, nbf) and return its claims.
 * The Graph access token cannot be verified by third parties, so role and email
 * claims are only ever trusted from this verified id_token.
 */
async function verifyIdToken(idToken) {
  if (!idToken || typeof idToken !== "string") throw new Error("Missing id_token");
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Malformed id_token");

  const [h, p, s] = parts;
  const header = JSON.parse(base64UrlDecode(h).toString("utf8"));
  if (header.alg !== "RS256" || !header.kid) throw new Error("Unsupported token algorithm");

  const key = await getSigningKey(header.kid);
  const valid = crypto.createVerify("RSA-SHA256").update(`${h}.${p}`).verify(key, base64UrlDecode(s));
  if (!valid) throw new Error("Invalid token signature");

  const payload = JSON.parse(base64UrlDecode(p).toString("utf8"));
  const now = Math.floor(Date.now() / 1000);
  if (payload.iss !== `https://login.microsoftonline.com/${TENANT_ID}/v2.0`) throw new Error("Invalid token issuer");
  if (payload.aud !== CLIENT_ID) throw new Error("Invalid token audience");
  if (typeof payload.exp !== "number" || payload.exp + CLOCK_SKEW_SEC < now) throw new Error("Token expired");
  if (typeof payload.nbf === "number" && payload.nbf - CLOCK_SKEW_SEC > now) throw new Error("Token not yet valid");

  return payload;
}

/**
 * Resolve SharePoint site ID.
 */
async function resolveSiteId(token) {
  if (cachedSiteId) return cachedSiteId;

  const url = new URL(SHAREPOINT_SITE_URL);
  const hostname = url.hostname;
  const sitePath = url.pathname.replace(/^\/|\/$/g, "");
  const path = sitePath
    ? `/v1.0/sites/${hostname}:/${sitePath}`
    : `/v1.0/sites/${hostname}`;

  const res = await request({
    hostname: GRAPH_HOST,
    path,
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    timeout: 10000,
  });

  if (res.status === 403 || res.status === 401) {
    const err = new Error(
      `Access denied reading SharePoint site (HTTP ${res.status}). The signed-in ` +
      `account or app registration is missing Sites.ReadWrite.All or ` +
      `Sites.Selected on ${SHAREPOINT_SITE_URL}.`
    );
    err.statusCode = res.status;
    throw err;
  }

  if (res.status !== 200 || !res.data.id) {
    throw new Error(`Failed to resolve site ID (HTTP ${res.status}): ${JSON.stringify(res.data)}`);
  }

  cachedSiteId = res.data.id;
  return cachedSiteId;
}

/**
 * Resolve SharePoint list ID.
 */
async function resolveListId(token, siteId) {
  if (cachedListId) return cachedListId;

  // https.request rejects paths with raw spaces, so encode the whole filter.
  const filter = encodeURIComponent(`displayName eq '${LIST_NAME.replace(/'/g, "''")}'`);
  const res = await request({
    hostname: GRAPH_HOST,
    path: `/v1.0/sites/${siteId}/lists?$filter=${filter}`,
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    timeout: 10000,
  });

  if (res.status === 403 || res.status === 401) {
    const err = new Error(
      `Access denied reading SharePoint lists (HTTP ${res.status}). The signed-in ` +
      `account or app registration is missing Sites.ReadWrite.All or ` +
      `Sites.Selected on ${SHAREPOINT_SITE_URL}.`
    );
    err.statusCode = res.status;
    throw err;
  }

  if (res.status === 200 && res.data.value && res.data.value.length > 0) {
    cachedListId = res.data.value[0].id;
    return cachedListId;
  }

  // Fallback: search all lists case-insensitively
  const allRes = await request({
    hostname: GRAPH_HOST,
    path: `/v1.0/sites/${siteId}/lists`,
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    timeout: 10000,
  });

  if (allRes.status === 200 && allRes.data.value) {
    const target = LIST_NAME.trim().toLowerCase();
    const match = allRes.data.value.find(
      (l) =>
        (l.displayName && l.displayName.trim().toLowerCase() === target) ||
        (l.name && l.name.trim().toLowerCase() === target)
    );
    if (match) {
      cachedListId = match.id;
      return cachedListId;
    }
  }

  const notFound = new Error(`List "${LIST_NAME}" not found in SharePoint site.`);
  notFound.statusCode = 404;
  throw notFound;
}

/**
 * Normalize category string.
 */
function mapCategory(raw) {
  const c = (raw || "").trim().toLowerCase();
  // Match on word boundaries so short keywords ("pc", "desk") do not capture
  // unrelated custom categories such as "Epcot Kiosk" or "Desk Lamp".
  if (/\b(laptop|macbook|thinkpad)/.test(c)) return "Laptop";
  if (/\b(desktop|imac)|\bpc\b/.test(c)) return "Desktop";
  if (/\b(monitor|screen|display)/.test(c)) return "Monitor";
  if (/\b(phone|iphone|mobile|smartphone)/.test(c)) return "Phone";
  if (/\b(tablet|ipad)/.test(c)) return "Tablet";
  if (/\b(furniture|chair)|\bdesks?$/.test(c)) return "Furniture";
  if (/\b(equip|network|server|printer)/.test(c)) return "Equipment";
  // Preserve a custom category the user typed rather than flattening it to "Other".
  const original = (raw || "").trim();
  return original || "Other";
}

/**
 * Normalize status string.
 */
function mapStatus(raw) {
  const s = (raw || "").trim().toLowerCase();

  if (s === "new" || s === "new device" || s === "new_device") return "new";
  if (s.includes("out of order")) return "retired";

  // Check negations and terminal states before the substring matches below,
  // otherwise "Not in Use" / "Unused" fall into the "use" branch.
  if (/\b(not|un|never)\b/.test(s) || s.startsWith("un")) {
    if (s.includes("use") || s.includes("issue") || s.includes("assign")) return "available";
  }
  if (s.includes("retir") || s.includes("dispos") || s.includes("written off") ||
      s.includes("lost") || s.includes("stolen") || s.includes("scrap")) return "retired";
  if (s.includes("maint") || s.includes("repair") || s.includes("service")) return "maintenance";
  if (s.includes("use") || s.includes("issue") || s.includes("assigned")) return "in_use";
  if (s.includes("avail") || s.includes("spare") || s.includes("stock") || s.includes("store")) return "available";
  return "available";
}

/**
 * Transform SharePoint Graph item to client Asset format.
 */
function spItemToAsset(item) {
  const f = item.fields || item;
  const spId = String(item.id || f.id || f.ID || "");
  const assetId = String(f.AssetId || f.AssetID || spId || Date.now().toString(36));

  // Extract Assignment History
  let assignmentHistory = [];
  if (Array.isArray(f.AssignmentHistory)) {
    assignmentHistory = f.AssignmentHistory;
  } else if (typeof f.AssignmentHistory === "string" && f.AssignmentHistory.trim()) {
    try {
      assignmentHistory = JSON.parse(f.AssignmentHistory);
    } catch {}
  } else if (f.Notes && typeof f.Notes === "string" && f.Notes.includes("<!-- HISTORY:")) {
    try {
      const match = f.Notes.match(/<!-- HISTORY:(.*?) -->/);
      if (match && match[1]) {
        assignmentHistory = JSON.parse(match[1]);
      }
    } catch {}
  }

  // Extract Approval Request if pending or recorded
  let approvalRequest = undefined;
  if (f.Notes && typeof f.Notes === "string" && f.Notes.includes("<!-- APPROVAL:")) {
    try {
      const match = f.Notes.match(/<!-- APPROVAL:(.*?) -->/);
      if (match && match[1]) {
        approvalRequest = JSON.parse(match[1]);
      }
    } catch {}
  }

  // Clean notes from embedded history and approval comments
  // Extract the audit trail (report logs)
  let events = [];
  if (f.Notes && typeof f.Notes === "string" && f.Notes.includes("<!-- EVENTS:")) {
    try {
      const match = f.Notes.match(/<!-- EVENTS:(.*?) -->/);
      if (match && match[1]) {
        events = JSON.parse(match[1]);
      }
    } catch {}
  }

  const cleanNotes = (f.Notes || f.Description || "")
    .replace(/<!-- HISTORY:.*? -->/g, "")
    .replace(/<!-- APPROVAL:.*? -->/g, "")
    .replace(/<!-- EVENTS:.*? -->/g, "")
    .trim();

  return {
    id: assetId,
    spItemId: spId,
    name: String(f.Title || f.ComputerName || f.AssetID || f.name || "Unknown"),
    category: mapCategory(f.Category || f.AssetType || "Other"),
    serialNumber: String(f.SerialNumber || f.Serial_x0020_Number || ""),
    status: mapStatus(f.Status || f.AssetStatus || "available"),
    assignee: String(
      f.AssignedTo?.Title ||
      f.Assign ||
      f.Assignee ||
      (typeof f.AssignedTo === "string" ? f.AssignedTo : "") ||
      ""
    ),
    location: String(f.Location || ""),
    vertical: String(f.Vertical || ""),
    make: String(f.Make || ""),
    model: String(f.Model || ""),
    department: String(f.Department || ""),
    custodianship: String(f.Custodianship || ""),
    criticality: String(f.Criticality || ""),
    operationalStatus: String(f.OperationalStatus || ""),
    assetClass: String(f.AssetClass || ""),
    accessories: String(f.Accessories || ""),
    purchaseDate: String(f.PurchaseDate || ""),
    purchasePrice: Number(f.PurchasePrice) || 0,
    warrantyExpiry: f.WarrantyExpiry ? String(f.WarrantyExpiry) : null,
    notes: cleanNotes,
    assignmentHistory,
    events,
    approvalRequest,
    etag: item["@odata.etag"] || item.eTag || null,
    version: Number(item.version || f._UIVersionString || 1),
    createdAt: String(f.Created || item.createdDateTime || new Date().toISOString()),
    updatedAt: String(f.Modified || item.lastModifiedDateTime || new Date().toISOString()),
    _syncStatus: "synced",
  };
}

/**
 * Format input fields for SharePoint write.
 */
const MAX_STORED_EVENTS = 200;

const OPTIONAL_COLUMNS = [
  "Vertical",
  "Make",
  "Model",
  "Department",
  "Custodianship",
  "Criticality",
  "OperationalStatus",
  "AssetClass",
  "Accessories",
];

/** Graph rejects writes to a column the list doesn't have; say which one. */
function missingColumnError(status, body) {
  if (status !== 400) return null;
  const column = OPTIONAL_COLUMNS.find((c) => new RegExp(`\\b${c}\\b`).test(body || ""));
  if (!column) return null;
  const err = new Error(
    `SharePoint list is missing the '${column}' column. Add it to the IT Asset Register list (see docs/DEPLOY.md), then try again.`
  );
  err.statusCode = 400;
  return err;
}

/**
 * JSON for a <!-- KEY:... --> block in Notes. "-->" inside user text would end
 * the comment early, so ">" is escaped (JSON.parse restores it).
 */
function toNotesJson(value) {
  return JSON.stringify(value).replace(/>/g, "\\u003e");
}

function assetInputToSpFields(input, assetId = null) {
  let notesWithHistory = input.notes || "";
  if (Array.isArray(input.assignmentHistory) && input.assignmentHistory.length > 0) {
    notesWithHistory = `${notesWithHistory}\n<!-- HISTORY:${toNotesJson(input.assignmentHistory)} -->`.trim();
  }
  if (input.approvalRequest) {
    notesWithHistory = `${notesWithHistory}\n<!-- APPROVAL:${toNotesJson(input.approvalRequest)} -->`.trim();
  }
  if (Array.isArray(input.events) && input.events.length > 0) {
    // Keep the newest events so the Notes field stays within SharePoint's limit.
    const recent = input.events.slice(-MAX_STORED_EVENTS);
    notesWithHistory = `${notesWithHistory}\n<!-- EVENTS:${toNotesJson(recent)} -->`.trim();
  }

  const fields = {
    Title: input.name,
    Category: input.category,
    SerialNumber: input.serialNumber || "",
    Status: input.status,
    Assignee: input.assignee || "",
    Location: input.location || "",
    // Date columns reject "" — send null so a cleared date clears in SharePoint.
    PurchaseDate: input.purchaseDate || null,
    PurchasePrice: Number(input.purchasePrice) || 0,
    WarrantyExpiry: input.warrantyExpiry || null,
    Notes: notesWithHistory,
  };

  // Only sent when set, so items without a vertical still save on a list
  // that does not have the Vertical column yet.
  if (input.vertical) fields.Vertical = input.vertical;
  if (input.make) fields.Make = input.make;
  if (input.model) fields.Model = input.model;
  if (input.department) fields.Department = input.department;
  if (input.custodianship) fields.Custodianship = input.custodianship;
  if (input.criticality) fields.Criticality = input.criticality;
  if (input.operationalStatus) fields.OperationalStatus = input.operationalStatus;
  if (input.assetClass) fields.AssetClass = input.assetClass;
  if (input.accessories) fields.Accessories = input.accessories;

  if (assetId) {
    fields.AssetId = assetId;
  }

  return fields;
}

/**
 * Category code mapping for stable IDs.
 */
const CATEGORY_CODES = {
  Laptop: "LAP",
  Desktop: "DSK",
  Monitor: "MON",
  Phone: "PHN",
  Tablet: "TAB",
  Furniture: "FUR",
  Equipment: "EQP",
  Other: "AST",
};

/**
 * Fetch all assets from SharePoint list with automated @odata.nextLink pagination.
 */
async function fetchAllAssets(userToken) {
  const token = await getEffectiveToken(userToken);
  const siteId = await resolveSiteId(token);
  const listId = await resolveListId(token, siteId);

  let nextUrl = `/v1.0/sites/${siteId}/lists/${listId}/items?expand=fields&$top=200`;
  let allAssets = [];
  let pageCount = 0;

  while (nextUrl && pageCount < 50) {
    pageCount++;
    const urlObj = nextUrl.startsWith("http") ? new URL(nextUrl) : null;
    const reqPath = urlObj ? `${urlObj.pathname}${urlObj.search}` : nextUrl;

    const res = await request({
      hostname: GRAPH_HOST,
      path: reqPath,
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000,
    });

    if (res.status !== 200) {
      throw new Error(`Graph error (${res.status}): ${JSON.stringify(res.data)}`);
    }

    const items = (res.data.value || []).map(spItemToAsset);
    allAssets = allAssets.concat(items);

    nextUrl = res.data["@odata.nextLink"] || null;
  }

  return allAssets;
}

/**
 * Create a new asset in SharePoint list with stable ID generation.
 */
async function createAsset(userToken, input) {
  const token = await getEffectiveToken(userToken);
  const siteId = await resolveSiteId(token);
  const listId = await resolveListId(token, siteId);

  const catCode = CATEGORY_CODES[input.category] || "AST";
  const year = new Date().getFullYear();
  const randNum = String(Math.floor(1000 + Math.random() * 9000));
  const assetId = input.id && input.id.startsWith("ENC-")
    ? input.id
    : `ENC-${catCode}-${year}-${randNum}`;

  const fields = assetInputToSpFields(input, assetId);

  const res = await request(
    {
      hostname: GRAPH_HOST,
      path: `/v1.0/sites/${siteId}/lists/${listId}/items`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    },
    { fields }
  );

  if (res.status !== 201 && res.status !== 200) {
    throw (
      missingColumnError(res.status, JSON.stringify(res.data)) ||
      new Error(`Graph create failed (${res.status}): ${JSON.stringify(res.data)}`)
    );
  }

  return spItemToAsset(res.data);
}

/**
 * Update an existing asset in SharePoint list with optional If-Match ETag concurrency.
 */
async function updateAsset(userToken, id, input, ifMatchEtag = null) {
  const token = await getEffectiveToken(userToken);
  const siteId = await resolveSiteId(token);
  const listId = await resolveListId(token, siteId);

  const fields = assetInputToSpFields(input);
  const reqHeaders = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  if (ifMatchEtag) {
    reqHeaders["If-Match"] = ifMatchEtag;
  }

  const res = await request(
    {
      hostname: GRAPH_HOST,
      path: `/v1.0/sites/${siteId}/lists/${listId}/items/${id}/fields`,
      method: "PATCH",
      headers: reqHeaders,
      timeout: 15000,
    },
    fields
  );

  if (res.status === 412 || res.status === 409) {
    const err = new Error("Conflict: Asset was modified by another user (ETag mismatch).");
    err.statusCode = 412;
    try {
      const currentRes = await request({
        hostname: GRAPH_HOST,
        path: `/v1.0/sites/${siteId}/lists/${listId}/items/${id}?$expand=fields`,
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000,
      });
      if (currentRes.status === 200) {
        err.serverAsset = spItemToAsset(currentRes.data);
      }
    } catch {}
    throw err;
  }

  if (res.status !== 200 && res.status !== 204) {
    throw (
      missingColumnError(res.status, JSON.stringify(res.data)) ||
      new Error(`Graph update failed (${res.status}): ${JSON.stringify(res.data)}`)
    );
  }

  // Fetch updated item
  const itemRes = await request({
    hostname: GRAPH_HOST,
    path: `/v1.0/sites/${siteId}/lists/${listId}/items/${id}?expand=fields`,
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    timeout: 10000,
  });

  if (itemRes.status === 200) {
    return spItemToAsset(itemRes.data);
  }

  return {
    id,
    spItemId: id,
    ...input,
    // Carry the caller's etag forward. Dropping it silently disables
    // If-Match on every subsequent update.
    etag: ifMatchEtag || input.etag || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    _syncStatus: "synced",
  };
}

/**
 * Delete an asset from SharePoint list.
 */
async function deleteAsset(userToken, id) {
  const token = await getEffectiveToken(userToken);
  const siteId = await resolveSiteId(token);
  const listId = await resolveListId(token, siteId);

  const res = await request({
    hostname: GRAPH_HOST,
    path: `/v1.0/sites/${siteId}/lists/${listId}/items/${id}`,
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000,
  });

  if (res.status !== 204 && res.status !== 200 && res.status !== 404) {
    throw new Error(`Graph delete failed (${res.status}): ${JSON.stringify(res.data)}`);
  }

  return { success: true };
}

/**
 * Exchange PKCE authorization code for access and refresh tokens.
 */
async function exchangeAuthCode({ code, codeVerifier, redirectUri }) {
  const postData = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: "authorization_code",
    code: code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  if (CLIENT_SECRET) {
    postData.append("client_secret", CLIENT_SECRET);
  }

  const payload = postData.toString();

  const res = await request(
    {
      hostname: "login.microsoftonline.com",
      path: `/${TENANT_ID}/oauth2/v2.0/token`,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(payload),
      },
      timeout: 15000,
    },
    payload
  );

  if (res.status !== 200) {
    const errMsg =
      res.data && res.data.error_description
        ? res.data.error_description
        : "Code exchange failed";
    throw new Error(`Token exchange failed (${res.status}): ${errMsg}`);
  }

  return res.data;
}

/**
 * Silently refresh tokens using OAuth refresh_token grant.
 */
async function refreshAuthToken({ refreshToken }) {
  const postData = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  if (CLIENT_SECRET) {
    postData.append("client_secret", CLIENT_SECRET);
  }

  const payload = postData.toString();

  const res = await request(
    {
      hostname: "login.microsoftonline.com",
      path: `/${TENANT_ID}/oauth2/v2.0/token`,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(payload),
      },
      timeout: 15000,
    },
    payload
  );

  if (res.status !== 200) {
    const errMsg =
      res.data && res.data.error_description
        ? res.data.error_description
        : "Token refresh failed";
    throw new Error(`Token refresh failed (${res.status}): ${errMsg}`);
  }

  return res.data;
}

module.exports = {
  fetchAllAssets,
  createAsset,
  updateAsset,
  deleteAsset,
  exchangeAuthCode,
  refreshAuthToken,
  getAppToken,
  verifyIdToken,
};
