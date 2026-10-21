// Browser tests sign in with a seeded Microsoft 365 session and talk to this
// in-memory stand-in for the /api/assets backend and Microsoft Graph.
const { seedSession } = require("./seed");

const BASE = "http://localhost:10000";

// Entra app roles per test user (the id_token `roles` claim).
const USERS = {
  admin: { email: "it.head@encalm.com", name: "IT Head", initials: "IH", roles: ["Asset.Admin", "Asset.Approver"] },
  technician: { email: "tech.one@encalm.com", name: "Tech One", initials: "TO", roles: ["Asset.Technician"] },
  viewer: { email: "auditor@encalm.com", name: "Auditor", initials: "AU", roles: ["Asset.Viewer"] },
};

const SAMPLE_ASSETS = [
  {
    id: "ENC-LAP-2026-0001", spItemId: "1", name: "ENC-DEL-LT-001", make: "Apple", model: 'MacBook Pro 16" M3',
    category: "Laptop", serialNumber: "C02G1234MD6R", status: "in_use", assignee: "Rahul Sharma",
    location: "DEL — T3 Terminal Lounge - Reception", vertical: "ENCALM HOSPITALITY PVT LTD", department: "IT",
    criticality: "Medium", operationalStatus: "Operational", assetClass: "Hardware",
    purchaseDate: "2024-03-15", purchasePrice: 249900, warrantyExpiry: "2027-03-15", notes: "Dual external displays.",
    assignmentHistory: [{ id: "hist_1", assignee: "Rahul Sharma", assignedBy: "IT Administrator", assignedAt: "2024-03-16T10:00:00Z", location: "DEL — T3 Terminal Lounge - Reception", notes: "Initial hardware issuance" }],
    createdAt: "2024-03-15T00:00:00.000Z", updatedAt: "2024-03-16T00:00:00.000Z",
  },
  {
    id: "ENC-MON-2026-0002", spItemId: "2", name: "ENC-HYD-MN-002", make: "Dell", model: 'UltraSharp 27" 4K',
    category: "Monitor", serialNumber: "CN0987654321", status: "available", assignee: "", location: "HYD — IT Storage",
    vertical: "ENCALM EATS PVT LTD", department: "IT", criticality: "Medium", operationalStatus: "Operational", assetClass: "Hardware",
    purchaseDate: "2024-01-10", purchasePrice: 48500, warrantyExpiry: "2027-01-10", notes: "Spares inventory.",
    assignmentHistory: [], createdAt: "2024-01-10T00:00:00.000Z", updatedAt: "2024-01-10T00:00:00.000Z",
  },
  {
    id: "ENC-PHN-2026-0003", spItemId: "3", name: "ENC-GOA-PH-003", make: "Apple", model: "iPhone 15 Pro",
    category: "Phone", serialNumber: "F2LZ7890N6T1", status: "maintenance", assignee: "Priya Nair", location: "GOA — Encalm Operations Desk",
    vertical: "ENCALM HOTEL", department: "IT", criticality: "Medium", operationalStatus: "Operational", assetClass: "Hardware",
    purchaseDate: "2023-11-20", purchasePrice: 134900, warrantyExpiry: "2025-11-20", notes: "Battery replacement.",
    assignmentHistory: [{ id: "hist_2", assignee: "Priya Nair", assignedBy: "IT Lead", assignedAt: "2023-11-21T09:30:00Z", location: "GOA — Encalm Operations Desk" }],
    createdAt: "2023-11-20T00:00:00.000Z", updatedAt: "2024-02-01T00:00:00.000Z",
  },
];

// Entra directory for the people picker.
const PEOPLE = [
  { id: "u1", displayName: "Neha Verma", mail: "neha.verma@encalm.com", jobTitle: "Duty Manager" },
  { id: "u2", displayName: "Carol New", mail: "carol@encalm.com" },
  { id: "u3", displayName: "Bob Test", mail: "bob@encalm.com" },
];

/**
 * Routes /api/assets (GET/POST/PATCH/DELETE) to an in-memory store and
 * answers Microsoft Graph (mail, people search, Asset Confirmations list).
 */
async function mockBackend(ctx, assets = SAMPLE_ASSETS, { confirmations = [], directory = PEOPLE } = {}) {
  const store = new Map();
  for (const a of JSON.parse(JSON.stringify(assets))) store.set(String(a.spItemId), a);
  let seq = 100;
  const mails = [];
  const json = (route, status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await ctx.route("**/api/assets**", async (route) => {
    const req = route.request();
    const key = decodeURIComponent(new URL(req.url()).pathname.split("/")[3] || "");
    const method = req.method();
    if (method === "GET" && !key) return json(route, 200, { data: [...store.values()] });
    if (method === "POST" && !key) {
      const body = JSON.parse(req.postData() || "{}");
      const saved = { ...body, spItemId: String(seq++), etag: "1" };
      store.set(saved.spItemId, saved);
      return json(route, 201, { data: saved });
    }
    const existing = store.get(key) || [...store.values()].find((a) => a.id === key);
    if (!existing) return json(route, 404, { error: "Not found" });
    if (method === "PATCH") {
      // The app sends the whole device; the real server rebuilds the
      // SharePoint item from it (a field left out, like a decided request, is cleared).
      const saved = { ...JSON.parse(req.postData() || "{}"), spItemId: existing.spItemId, etag: String(Number(existing.etag || 1) + 1) };
      store.set(saved.spItemId, saved);
      return json(route, 200, { data: saved });
    }
    if (method === "DELETE") {
      store.delete(String(existing.spItemId));
      return json(route, 200, { success: true });
    }
    return json(route, 405, { error: "Method not allowed" });
  });
  await ctx.route("https://graph.microsoft.com/**", async (route) => {
    const req = route.request();
    const url = req.url();
    if (url.includes("/sendMail")) {
      mails.push(JSON.parse(req.postData() || "{}").message);
      return route.fulfill({ status: 202, body: "" });
    }
    if (url.includes("/users?")) {
      // "forbidden": directory search not consented -> the picker falls back to manual entry.
      if (directory === "forbidden") return json(route, 403, { error: { code: "Authorization_RequestDenied" } });
      const q = (decodeURIComponent(url).match(/displayName:([^"]*)"/) || [])[1] || "";
      return json(route, 200, { value: directory.filter((u) => `${u.displayName} ${u.mail}`.toLowerCase().includes(q.toLowerCase())) });
    }
    if (url.includes("/lists?")) return json(route, 200, { value: [{ id: "conf-list" }] });
    if (url.includes("/lists/conf-list/items")) return json(route, 200, { value: confirmations });
    if (/\/sites\/[^/]+(:\/[^?]*)?$/.test(new URL(url).pathname) || url.includes("encalmit.sharepoint.com")) return json(route, 200, { id: "site1" });
    return json(route, 404, {});
  });
  // Extra-permission tokens (per-device SharePoint access) aren't available here.
  await ctx.route("https://login.microsoftonline.com/**", (route) => json(route, 400, { error: "invalid_grant" }));
  return { store, mails };
}

/** Pick a person in the "Assigned to" / "New custodian" directory search. */
async function pickPerson(page, name) {
  await page.getByPlaceholder("Search Azure AD by name or email").last().fill(name.split(" ")[0]);
  await page.waitForTimeout(900);
  await page.getByText(name, { exact: true }).last().click();
  await page.waitForTimeout(300);
}

/** Sign in as one of USERS (or a custom profile) and open `path`. */
async function signIn(page, who = "admin", path = "/") {
  const u = typeof who === "string" ? USERS[who] : who;
  if (!page.url().startsWith(BASE)) await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await seedSession(page, { email: u.email, name: u.name, initials: u.initials || "XX" }, { roles: u.roles || [] });
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
}

/** The cached copy of one device, as the app last saved it. */
function cachedAsset(page, id) {
  return page.evaluate((id) => JSON.parse(localStorage.getItem("@encalm/asset_cache_v4")).items.find((a) => a.id === id), id);
}

module.exports = { BASE, USERS, PEOPLE, SAMPLE_ASSETS, mockBackend, signIn, pickPerson, cachedAsset };
