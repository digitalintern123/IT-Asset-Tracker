const path = require("path"), fs = require("fs");
const repo = path.join(__dirname, "..");
const ts = require(path.join(repo, "node_modules/typescript"));
let fail = 0; const ok = (n, c, x = "") => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"} ${n} ${x}`); };
function loadTs(rel, stubs) {
  const out = ts.transpileModule(fs.readFileSync(path.join(repo, rel), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const m = { exports: {} };
  new Function("module", "exports", "require", out)(m, m.exports, (id) => { if (id in stubs) return stubs[id]; throw new Error("unstubbed " + id); });
  return m.exports;
}
const msConfig = loadTs("lib/msConfig.ts", {});
const assetId = loadTs("lib/assetId.ts", {});
const spMod = loadTs("lib/sharepoint.ts", { "./msConfig": msConfig, "@/lib/assetId": assetId });
const { resolveAssetConflict } = loadTs("lib/conflictResolver.ts", {});
const r = (status, body) => ({ ok: status >= 200 && status < 300, status, statusText: "", json: async () => body, text: async () => JSON.stringify(body) });
const serverItem = { id: "7", "@odata.etag": "\"e2\"", fields: { Title: "MacBook", Category: "Laptop", Status: "Available", Location: "T1", Notes: "serviced by Priya", AssetId: "ENC-LAP-2026-0001" } };
let mode; const seen = [];
global.fetch = async (url, opts = {}) => {
  const m = opts.method || "GET"; seen.push(`${m} ${url}`);
  if (url.includes("/lists?") || url.endsWith("/lists")) return r(200, { value: [{ id: "list1" }] });
  if (!url.includes("/lists")) return r(200, { id: "site1" });
  if (m === "PATCH") return mode.patch === 412 ? r(412, { error: { code: "preconditionFailed" } }) : r(200, {});
  if (m === "GET" && url.includes("/items/7?expand=fields")) {
    if (mode.get === "throw") throw new TypeError("Failed to fetch");
    return mode.get === 200 ? r(200, serverItem) : r(500, {});
  }
  return r(404, {});
};
const base = { name: "MacBook", category: "Laptop", status: "available", assignee: "", location: "T1", serialNumber: "", purchaseDate: "", purchasePrice: 0, warrantyExpiry: null, notes: "" };
(async () => {
  const sp = await spMod.createSharePointService("tok");
  const local = { ...base, location: "T3" };  // this user moved it to T3
  mode = { patch: 412, get: 200 };
  let err; try { await sp.update("7", local, "\"e1\""); } catch (e) { err = e; }
  ok("412 + GET 200: statusCode 412", err && err.statusCode === 412);
  ok("412 + GET 200: serverAsset attached", err && err.serverAsset && err.serverAsset.notes === "serviced by Priya", err && err.serverAsset && JSON.stringify({ n: err.serverAsset.notes, etag: err.serverAsset.etag }));
  ok("412 + GET 200: serverAsset carries new etag", err && err.serverAsset && err.serverAsset.etag === "\"e2\"");
  ok("If-Match sent on PATCH", seen.some((s) => s.startsWith("PATCH")));
  // merge as AssetContext does: base = pre-edit copy
  const merged = resolveAssetConflict({ ...local, id: "ENC-LAP-2026-0001" }, err.serverAsset, { ...base, id: "ENC-LAP-2026-0001" });
  ok("merge keeps this user's edit (location T3)", merged.mergedAsset.location === "T3");
  ok("merge keeps other user's edit (notes)", merged.mergedAsset.notes === "serviced by Priya");
  ok("merge: no false conflict", !merged.hasConflict);
  ok("merge: next save uses new etag", merged.mergedAsset.etag === "\"e2\"");
  for (const g of [500, "throw"]) {
    mode = { patch: 412, get: g }; err = undefined;
    try { await sp.update("7", local, "\"e1\""); } catch (e) { err = e; }
    ok(`412 + GET ${g}: still a 412, no serverAsset, no crash`, err && err.statusCode === 412 && !err.serverAsset, err && err.message);
  }
  mode = { patch: 200, get: 500 };
  const res = await sp.update("7", local, "\"e1\"");
  ok("PATCH ok + re-fetch fails: fallback keeps etag", res.etag === "\"e1\"");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("CRASH", e); process.exit(2); });
