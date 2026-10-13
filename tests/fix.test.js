const path = require("path"), fs = require("fs"), Module = require("module");
const repo = path.join(__dirname, "..");
const ts = require(path.join(repo, "node_modules/typescript"));
let fail = 0; const ok = (n, c, x = "") => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"} ${n} ${x}`); };
function loadTs(rel, stubs) {
  const out = ts.transpileModule(fs.readFileSync(path.join(repo, rel), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const m = { exports: {} };
  new Function("module", "exports", "require", out)(m, m.exports, (id) => { if (id in stubs) return stubs[id]; throw new Error("unstubbed " + id); });
  return m.exports;
}
// ---- api.ts with stubbed fetch + SharePoint service
let graphCalls = 0, graphFails = false;
const sp = new Proxy({}, { get: (_, k) => k === "then" ? undefined : async () => { graphCalls++; if (graphFails) throw new Error("graph down"); return { via: "graph" }; } });
const api = loadTs("lib/api.ts", {
  "./secureStorage": { getSecureTokens: async () => ({ idToken: "idt" }) },
  "./sharepoint": { createSharePointService: async () => sp },
});
const json = (status, body) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const html200 = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token <"); } });
const netErr = async () => { throw new TypeError("Failed to fetch"); };
const calls = {
  fetchAll: () => api.apiFetchAll("tok"),
  create: () => api.apiCreateAsset({ name: "A" }, "tok"),
  update: () => api.apiUpdateAsset("7", { name: "A" }, "tok", "\"e1\""),
  delete: () => api.apiDeleteAsset("7", "tok"),
};
(async () => {
  const cases = [
    ["403 role refusal", json(403, { error: "Forbidden: Viewer role cannot create assets." }), "throw", 403],
    ["401 unverified", json(401, { error: "Unauthorized" }), "throw", 401],
    ["400 bad payload", json(400, { error: "bad" }), "throw", 400],
    ["412 conflict", json(412, { error: "Conflict: etag", data: { name: "srv" } }), "throw", 412],
    ["500 backend error", json(500, { error: "boom" }), "graph"],
    ["503 unavailable", json(503, {}), "graph"],
    ["405 (IIS static POST)", json(405, {}), "graph"],
    ["404 (no endpoint)", json(404, {}), "graph"],
    ["200 HTML (IIS SPA rewrite)", html200, "graph"],
    ["network TypeError", netErr, "graph"],
  ];
  for (const [label, f, expect, status] of cases) {
    for (const [name, call] of Object.entries(calls)) {
      global.fetch = f; graphCalls = 0; graphFails = false;
      let res, err;
      try { res = await call(); } catch (e) { err = e; }
      if (expect === "throw") ok(`${name}: ${label} -> surfaces, no Graph call`, err && err.statusCode === status && graphCalls === 0, err ? err.message : "no error");
      else ok(`${name}: ${label} -> Graph once`, !err && graphCalls === 1, `graphCalls=${graphCalls}`);
    }
  }
  global.fetch = json(412, { error: "Conflict: etag", data: { name: "srv" } });
  try { await calls.update(); } catch (e) { ok("412 carries serverAsset", e.serverAsset && e.serverAsset.name === "srv"); }
  for (const [name, call] of Object.entries(calls)) {
    global.fetch = json(500, {}); graphCalls = 0; graphFails = true;
    let err; try { await call(); } catch (e) { err = e; }
    ok(`${name}: Graph fallback fails -> thrown once (no double call)`, err && err.message === "graph down" && graphCalls === 1, `graphCalls=${graphCalls}`);
  }
  global.fetch = json(403, {}); let e2; try { await api.apiCreateAsset({}, undefined); } catch (e) { e2 = e; }
  ok("no token: 403 surfaces", e2 && e2.statusCode === 403 && graphCalls === 1);
  // ---- server mapCategory + date fields
  const file = path.join(repo, "server/sharepoint-api.js");
  const mod = new Module(file); mod.paths = Module._nodeModulePaths(path.dirname(file));
  mod._compile(fs.readFileSync(file, "utf8") + "\nmodule.exports.__t={mapCategory,assetInputToSpFields};", file);
  const { mapCategory, assetInputToSpFields } = mod.exports.__t;
  const exp = { "Epcot Kiosk": "Epcot Kiosk", "Headphones": "Headphones", "Desk Lamp": "Desk Lamp", "Standing Desk": "Furniture",
    "Desk": "Furniture", "Gaming PC": "Desktop", "PC": "Desktop", "MacBook Air": "Laptop", "Kiosk Tablet Stand": "Tablet",
    "Laptop": "Laptop", "Desktop": "Desktop", "Monitor": "Monitor", "Phone": "Phone", "Tablet": "Tablet", "Furniture": "Furniture",
    "Equipment": "Equipment", "Other": "Other", "Network Switch": "Equipment", "Office Chair": "Furniture", "iPhone 15 Pro": "Phone",
    "Smartphone": "Phone", "4K Display": "Monitor", "": "Other" };
  for (const [k, v] of Object.entries(exp)) ok(`mapCategory(${JSON.stringify(k)}) = ${v}`, mapCategory(k) === v, `got ${mapCategory(k)}`);
  const body = (s) => s.slice(s.indexOf("function mapCategory"), s.indexOf('return original || "Other";'));
  const cl = body(fs.readFileSync(path.join(repo, "lib/sharepoint.ts"), "utf8")).replace("(raw: string): AssetCategory", "(raw)");
  ok("client/server mapCategory bodies identical", cl === body(fs.readFileSync(file, "utf8")));
  let f = assetInputToSpFields({ name: "A", category: "Laptop", status: "available", purchaseDate: "", warrantyExpiry: null });
  ok("blank dates sent as null (clears column)", f.PurchaseDate === null && f.WarrantyExpiry === null);
  f = assetInputToSpFields({ name: "A", category: "Laptop", status: "available", purchaseDate: "2024-01-01", warrantyExpiry: "2027-01-01" });
  ok("real dates sent", f.PurchaseDate === "2024-01-01" && f.WarrantyExpiry === "2027-01-01");
  ok("no empty-string dates ever", f.PurchaseDate !== "" && f.WarrantyExpiry !== "");
  process.exit(fail ? 1 : 0);
})();
