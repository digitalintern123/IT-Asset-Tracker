/**
 * Server-Side SharePoint Online Service via Microsoft Graph API.
 * Handles server-to-server Microsoft Graph operations with zero external dependencies.
 */

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
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
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

  const encodedName = encodeURIComponent(LIST_NAME);
  const res = await request({
    hostname: GRAPH_HOST,
    path: `/v1.0/sites/${siteId}/lists?$filter=displayName eq '${encodedName}'`,
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    timeout: 10000,
  });

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

  throw new Error(`List "${LIST_NAME}" not found in SharePoint site.`);
}

/**
 * Normalize category string.
 */
function mapCategory(raw) {
  const c = (raw || "").trim().toLowerCase();
  if (c.includes("laptop") || c.includes("macbook") || c.includes("thinkpad")) return "Laptop";
  if (c.includes("desktop") || c.includes("pc") || c.includes("imac")) return "Desktop";
  if (c.includes("monitor") || c.includes("screen") || c.includes("display")) return "Monitor";
  if (c.includes("phone") || c.includes("iphone") || c.includes("mobile")) return "Phone";
  if (c.includes("tablet") || c.includes("ipad")) return "Tablet";
  if (c.includes("furniture") || c.includes("chair") || c.includes("desk")) return "Furniture";
  if (c.includes("equip") || c.includes("network") || c.includes("server") || c.includes("printer")) return "Equipment";
  return "Other";
}

/**
 * Normalize status string.
 */
function mapStatus(raw) {
  const s = (raw || "").trim().toLowerCase();
  if (s.includes("use") || s.includes("issue") || s.includes("assigned")) return "in_use";
  if (s.includes("maint") || s.includes("repair")) return "maintenance";
  if (s.includes("retir") || s.includes("dispos")) return "retired";
  return "available";
}

/**
 * Transform SharePoint Graph item to client Asset format.
 */
function spItemToAsset(item) {
  const f = item.fields || item;
  const spId = String(item.id || f.id || f.ID || "");
  const assetId = String(f.AssetId || f.AssetID || spId || Date.now().toString(36));

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
    purchaseDate: String(f.PurchaseDate || ""),
    purchasePrice: Number(f.PurchasePrice) || 0,
    warrantyExpiry: f.WarrantyExpiry ? String(f.WarrantyExpiry) : null,
    notes: String(f.Notes || f.Description || ""),
    createdAt: String(f.Created || item.createdDateTime || new Date().toISOString()),
    updatedAt: String(f.Modified || item.lastModifiedDateTime || new Date().toISOString()),
    _syncStatus: "synced",
  };
}

/**
 * Format input fields for SharePoint write.
 */
function assetInputToSpFields(input, assetId = null) {
  const fields = {
    Title: input.name,
    Category: input.category,
    SerialNumber: input.serialNumber || "",
    Status: input.status,
    Assignee: input.assignee || "",
    Location: input.location || "",
    PurchaseDate: input.purchaseDate || "",
    PurchasePrice: Number(input.purchasePrice) || 0,
    WarrantyExpiry: input.warrantyExpiry || "",
    Notes: input.notes || "",
  };

  if (assetId) {
    fields.AssetId = assetId;
  }

  return fields;
}

/**
 * Fetch all assets from SharePoint list.
 */
async function fetchAllAssets(userToken) {
  const token = await getEffectiveToken(userToken);
  const siteId = await resolveSiteId(token);
  const listId = await resolveListId(token, siteId);

  const res = await request({
    hostname: GRAPH_HOST,
    path: `/v1.0/sites/${siteId}/lists/${listId}/items?expand=fields&$top=500`,
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000,
  });

  if (res.status !== 200) {
    throw new Error(`Graph error (${res.status}): ${JSON.stringify(res.data)}`);
  }

  return (res.data.value || []).map(spItemToAsset);
}

/**
 * Create a new asset in SharePoint list.
 */
async function createAsset(userToken, input) {
  const token = await getEffectiveToken(userToken);
  const siteId = await resolveSiteId(token);
  const listId = await resolveListId(token, siteId);

  const assetId = "AST-" + Date.now().toString(36).toUpperCase();
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
    throw new Error(`Graph create failed (${res.status}): ${JSON.stringify(res.data)}`);
  }

  return spItemToAsset(res.data);
}

/**
 * Update an existing asset in SharePoint list.
 */
async function updateAsset(userToken, id, input) {
  const token = await getEffectiveToken(userToken);
  const siteId = await resolveSiteId(token);
  const listId = await resolveListId(token, siteId);

  const fields = assetInputToSpFields(input);

  const res = await request(
    {
      hostname: GRAPH_HOST,
      path: `/v1.0/sites/${siteId}/lists/${listId}/items/${id}/fields`,
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    },
    fields
  );

  if (res.status !== 200 && res.status !== 204) {
    throw new Error(`Graph update failed (${res.status}): ${JSON.stringify(res.data)}`);
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

module.exports = {
  fetchAllAssets,
  createAsset,
  updateAsset,
  deleteAsset,
  getAppToken,
};
