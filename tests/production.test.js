// Production-hardening features: Notes size guard, register backup, error
// log, one-click SharePoint setup.
const path = require("path"), fs = require("fs"), Module = require("module");
const repo = path.join(__dirname, "..");
const ts = require(path.join(repo, "node_modules/typescript"));
let fail = 0; const ok = (n, c, x = "") => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"} ${n} ${x}`); };
const store = {};
global.window = { localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } }, location: { pathname: "/asset/x" } };
const cache = {};
function loadTs(rel) {
  const full = path.join(repo, rel); if (cache[full]) return cache[full];
  const out = ts.transpileModule(fs.readFileSync(full, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = { exports: {} }; cache[full] = m.exports;
  const req = (id) => id === "react-native" ? { Platform: { OS: "web" }, Linking: { openURL: async () => {} } } : id.startsWith("@/") ? loadTs(id.slice(2) + ".ts") : id.startsWith("./") ? loadTs(path.join(path.dirname(rel), id) + ".ts") : require(id);
  new Function("module", "exports", "require", out)(m, m.exports, req); return m.exports;
}
const sp = loadTs("lib/sharepoint.ts"), R = loadTs("lib/reports.ts"), I = loadTs("lib/importSheet.ts"), E = loadTs("lib/errorLog.ts"), SC = loadTs("lib/setupCheck.ts");
const file = path.join(repo, "server/sharepoint-api.js");
const mod = new Module(file); mod.paths = Module._nodeModulePaths(path.dirname(file));
mod._compile(fs.readFileSync(file, "utf8") + "\nmodule.exports.__t={assetInputToSpFields};", file);
const S = mod.exports.__t;

const rec = (i) => ({ id: `h${i}`, assignee: `User ${i}`, assigneeEmail: `u${i}@encalm.com`, assignedAt: "2026-01-01T00:00:00Z" });
const evt = (i) => ({ id: `e${i}`, type: "status_changed", at: `2026-01-01T00:00:${String(i % 60).padStart(2, "0")}Z`, by: "IT", notes: "x".repeat(400) });
const base = { id: "ENC-LAP-2026-0001", name: "H1", category: "Laptop", serialNumber: "S1", status: "in_use", assignee: "User 1", location: "DEL — T3", vertical: "ENCALM HOTEL", department: "IT", purchaseDate: "", purchasePrice: 0, warrantyExpiry: null, notes: "", createdAt: "", updatedAt: "", assignmentHistory: [rec(1), rec(2)], events: Array.from({ length: 200 }, (_, i) => evt(i)) };

// Notes size guard
const f = sp.toSpFields(base);
ok("Notes stays under SharePoint's 63,999-char limit", f.Notes.length <= 63000, String(f.Notes.length));
const back = sp.fromSpItem({ id: "1", fields: { ...f, AssetId: base.id } });
ok("custody history kept in full", back.assignmentHistory.length === 2);
ok("newest events kept, oldest dropped", back.events.length > 0 && back.events.length < 200 && back.events[back.events.length - 1].id === "e199", String(back.events.length));
ok("server guard identical to client", JSON.stringify(S.assetInputToSpFields(base)) === JSON.stringify(f));
ok("small Notes untouched", sp.fromSpItem({ fields: sp.toSpFields({ ...base, events: [evt(1)] }) }).events.length === 1);

// Register backup round-trips through the importer
const assets = [
  { ...base, events: [], make: "Dell", model: "Latitude 3420", criticality: "High", operationalStatus: "Operational", assetClass: "Hardware", accessories: "Bag", custodianship: "IT" },
  { ...base, id: "ENC-LAP-2026-0002", name: "H2", serialNumber: "S2", status: "available", assignee: "", location: "GOA", assignmentHistory: [], events: [] },
];
const csv = R.registerCsv(assets);
const rows = csv.replace(/^﻿/, "").split("\r\n").map((l) => l.split(","));
const parsed = I.parseInventorySheet(rows, [], { category: "Laptop", vertical: "" });
ok("backup CSV re-imports (headers recognised)", parsed.missingHeaders.length === 0 && parsed.rows.length === 2, JSON.stringify(parsed.missingHeaders));
const r1 = parsed.rows[0].input;
ok("re-import keeps host, serial, site + detail, user email, vertical, criticality", r1.name === "H1" && r1.serialNumber === "S1" && r1.location === "DEL — T3" && parsed.rows[0].assigneeEmail === "u2@encalm.com" && r1.vertical === "ENCALM HOTEL" && r1.criticality === "High", JSON.stringify(r1));
const json = JSON.parse(R.registerJson(assets));
ok("JSON backup has every asset with history, no sync metadata", json.count === 2 && json.assets[0].assignmentHistory.length === 2 && !("etag" in json.assets[0]));

// Error log
for (let i = 0; i < 60; i++) E.recordError("sync", new Error(`boom ${i}`));
ok("error log keeps the last 50", E.getErrorLog().length === 50 && E.getErrorLog()[49].message === "boom 59");
E.recordError("sync", new Error("Bearer eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sig and access_token=abc123"));
const last = E.getErrorLog().slice(-1)[0];
ok("tokens are redacted", !/eyJ|abc123/.test(last.message) && /\[token\]/.test(last.message), last.message);
E.recordError("sync", "same"); E.recordError("sync", "same");
ok("repeats collapsed", E.getErrorLog().filter((e) => e.message === "same").length === 1);
ok("report text lists newest first", E.formatErrorReport([{ at: "2026-01-01T00:00:00Z", source: "sync", message: "old" }, { at: "2026-01-02T00:00:00Z", source: "sync", message: "new" }]).indexOf("new") < E.formatErrorReport([{ at: "2026-01-01T00:00:00Z", source: "sync", message: "old" }, { at: "2026-01-02T00:00:00Z", source: "sync", message: "new" }]).indexOf("old"));
E.clearErrorLog();
ok("clear empties the log", E.getErrorLog().length === 0);

// One-click SharePoint setup
const REG_COLS = ["Title", "AssetId", "Category", "SerialNumber", "Status", "Assignee", "Location", "PurchaseDate", "PurchasePrice", "WarrantyExpiry", "Notes"];
function mockGraph(state) {
  const posts = [];
  global.fetch = async (url, opts = {}) => {
    const u = decodeURIComponent(url);
    const j = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
    if (opts.method === "POST") {
      posts.push({ url: u, body: JSON.parse(opts.body) });
      if (state.deny) return j(403, { error: { message: "Access denied" } });
      if (u.endsWith("/lists")) { state.confExists = true; state.confCols = JSON.parse(opts.body).columns.map((c) => c.name); return j(201, { id: "conf" }); }
      if (u.includes("/lists/reg/columns")) { state.regCols.push(JSON.parse(opts.body).name); return j(201, {}); }
      if (u.includes("/lists/conf/columns")) { state.confCols.push(JSON.parse(opts.body).name); return j(201, {}); }
    }
    if (u.includes("sharepoint.com") && !u.includes("/lists")) return j(200, { id: "site1" });
    if (u.includes("/lists?$filter")) return j(200, { value: u.includes("Asset Confirmations") ? (state.confExists ? [{ id: "conf" }] : []) : [{ id: "reg" }] });
    if (/\/lists$/.test(u)) return j(200, { value: [{ id: "reg", displayName: "IT Asset Register" }].concat(state.confExists ? [{ id: "conf", displayName: "Asset Confirmations" }] : []) });
    if (u.includes("/lists/reg/columns")) return j(200, { value: state.regCols.map((name) => ({ name })) });
    if (u.includes("/lists/conf/columns")) return j(200, { value: state.confCols.map((name) => ({ name })) });
    return j(404, {});
  };
  return posts;
}
(async () => {
  const state = { regCols: [...REG_COLS, "Make"], confExists: false, confCols: [] };
  let posts = mockGraph(state);
  let res = await SC.fixSharePointSetup("tok");
  const colPosts = posts.filter((p) => p.url.includes("/lists/reg/columns"));
  ok("creates only the missing register columns", colPosts.length === 8 && !colPosts.some((p) => p.body.name === "Make") && colPosts.every((p) => p.body.text), colPosts.map((p) => p.body.name).join(","));
  ok("creates the Asset Confirmations list with its columns", posts.some((p) => p.url.endsWith("/lists") && p.body.displayName === "Asset Confirmations" && p.body.columns.map((c) => c.name).join() === "CustodyId,AssetName,ConfirmedAt" && p.body.list.template === "genericList"));
  ok("reports what it created", res.created.length === 9 && res.failed.length === 0, JSON.stringify(res));
  posts = mockGraph(state);
  res = await SC.fixSharePointSetup("tok");
  ok("second run changes nothing (idempotent)", posts.length === 0 && res.created.length === 0, JSON.stringify(posts.map((p) => p.url)));
  const denied = { regCols: [...REG_COLS], confExists: true, confCols: [], deny: true };
  mockGraph(denied);
  res = await SC.fixSharePointSetup("tok");
  ok("403 explains the permission needed", res.failed.length > 0 && res.failed.every((f) => /Sites\.Manage\.All/.test(f.error)), res.failed[0] && res.failed[0].error);
  console.log(fail ? `${fail} FAILED` : "ALL PASS"); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
