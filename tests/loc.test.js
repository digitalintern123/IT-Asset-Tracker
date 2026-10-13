const path = require("path"), fs = require("fs"), Module = require("module");
const repo = path.join(__dirname, "..");
const ts = require(path.join(repo, "node_modules/typescript"));
let fail = 0; const ok = (n, c, x = "") => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"} ${n} ${x}`); };
const cache = {};
function loadTs(rel) {
  const full = path.join(repo, rel); if (cache[full]) return cache[full];
  const out = ts.transpileModule(fs.readFileSync(full, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = { exports: {} }; cache[full] = m.exports;
  const req = (id) => id === "react-native" ? { Platform: { OS: "ios" }, Linking: {} } : id.startsWith("@/") ? loadTs(id.slice(2) + ".ts") : id.startsWith("./") ? loadTs(path.join(path.dirname(rel), id) + ".ts") : require(id);
  new Function("module", "exports", "require", out)(m, m.exports, req); return m.exports;
}
const L = loadTs("lib/location.ts"), C = loadTs("constants/categories.ts"), sp = loadTs("lib/sharepoint.ts"), rep = loadTs("lib/reports.ts");
ok("5 sites in order", C.LOCATIONS.map((l) => l.code).join() === "DEL,HYD,GOA,BUG,NAG" && C.LOCATIONS[3].name === "Bhogapuram");
ok("4 verticals", C.VERTICALS.length === 4 && C.VERTICALS[1] === "ENCALM EATS PVT LTD");
const P = L.parseLocation;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
ok("code only", eq(P("DEL"), { site: "DEL", detail: "" }));
ok("code + detail", eq(P("BUG — Arrivals desk"), { site: "BUG", detail: "Arrivals desk" }));
ok("hyphen/en-dash separators", eq(P("nag - T1"), { site: "NAG", detail: "T1" }) && eq(P("GOA – Gate 4"), { site: "GOA", detail: "Gate 4" }));
ok("legacy free text kept as detail", eq(P("T3 Terminal Lounge - Reception"), { site: "", detail: "T3 Terminal Lounge - Reception" }));
ok("unknown 3-letter code -> detail", eq(P("BLR — x"), { site: "", detail: "BLR — x" }));
ok("word starting with code not misread", eq(P("Delhi office"), { site: "", detail: "Delhi office" }));
ok("empty", eq(P(""), { site: "", detail: "" }) && eq(P(null), { site: "", detail: "" }));
ok("format", L.formatLocation("HYD", " IT Storage ") === "HYD — IT Storage" && L.formatLocation("DEL", "") === "DEL" && L.formatLocation("", "x") === "x");
ok("round trip", eq(P(L.formatLocation("NAG", "Cargo")), { site: "NAG", detail: "Cargo" }));
const base = { name: "A", category: "Laptop", status: "new", assignee: "", location: "DEL — T3", purchaseDate: "", purchasePrice: 0, warrantyExpiry: null, notes: "" };
let f = sp.toSpFields({ ...base, vertical: "ENCALM HOTEL" });
ok("client writes Vertical + Location", f.Vertical === "ENCALM HOTEL" && f.Location === "DEL — T3");
ok("client omits Vertical when unset", !("Vertical" in sp.toSpFields(base)));
ok("client reads Vertical", sp.fromSpItem({ id: "1", fields: { Title: "A", Vertical: "ENCALM SKYPLATES", Location: "BUG" } }).vertical === "ENCALM SKYPLATES");
// server mapping + missing-column error
const https = require("https"); const { EventEmitter } = require("events");
let patchReply = { status: 400, data: { error: { code: "invalidRequest", message: "Field 'Vertical' is not recognized" } } };
https.request = (opts, cb) => { const req = new EventEmitter(); req.write = () => {}; req.end = () => {
  let status = 200, data = {};
  if (opts.path.startsWith("/v1.0/sites/") && !opts.path.includes("/lists")) data = { id: "site1" };
  else if (opts.path.includes("/lists?")) data = { value: [{ id: "list1" }] };
  else if (opts.method === "POST" || opts.method === "PATCH") ({ status, data } = patchReply);
  const res = new EventEmitter(); res.statusCode = status; res.headers = {}; cb(res); res.emit("data", JSON.stringify(data)); res.emit("end"); }; return req; };
const file = path.join(repo, "server/sharepoint-api.js");
const mod = new Module(file); mod.paths = Module._nodeModulePaths(path.dirname(file));
mod._compile(fs.readFileSync(file, "utf8") + "\nmodule.exports.__t={assetInputToSpFields,spItemToAsset};", file);
const S = mod.exports;
ok("server writes/omits Vertical", S.__t.assetInputToSpFields({ ...base, vertical: "ENCALM HOTEL" }).Vertical === "ENCALM HOTEL" && !("Vertical" in S.__t.assetInputToSpFields(base)));
ok("server reads Vertical", S.__t.spItemToAsset({ id: "1", fields: { Title: "A", Vertical: "ENCALM HOTEL" } }).vertical === "ENCALM HOTEL");
ok("client/server field maps identical", JSON.stringify(S.__t.assetInputToSpFields({ ...base, vertical: "ENCALM HOTEL" })) === JSON.stringify(f));
(async () => {
  for (const [name, fn] of [["server create", () => S.createAsset("tok", { ...base, vertical: "ENCALM HOTEL" })], ["server update", () => S.updateAsset("tok", "7", { ...base, vertical: "ENCALM HOTEL" })]]) {
    let err; try { await fn(); } catch (e) { err = e; }
    ok(`${name}: missing column -> clear 400`, err && err.statusCode === 400 && /missing the 'Vertical' column/.test(err.message), err && err.message);
  }
  patchReply = { status: 400, data: { error: { message: "Some other validation problem" } } };
  let err2; try { await S.updateAsset("tok", "7", base); } catch (e) { err2 = e; }
  ok("other 400 keeps original Graph message", err2 && /Graph update failed \(400\)/.test(err2.message));
  // client direct-Graph path
  global.fetch = async (url, opts = {}) => {
    const m = opts.method || "GET";
    if (url.includes("/lists?") || url.endsWith("/lists")) return { ok: true, status: 200, json: async () => ({ value: [{ id: "list1" }] }) };
    if (!url.includes("/lists")) return { ok: true, status: 200, json: async () => ({ id: "site1" }) };
    if (m === "POST") return { ok: false, status: 400, statusText: "Bad Request", text: async () => '{"error":{"message":"Field \'Vertical\' is not recognized"}}' };
    return { ok: false, status: 500, text: async () => "" };
  };
  const svc = await sp.createSharePointService("tok");
  let err3; try { await svc.create({ ...base, vertical: "ENCALM HOTEL" }); } catch (e) { err3 = e; }
  ok("client create: missing column -> clear 400", err3 && err3.statusCode === 400 && /missing the 'Vertical' column/.test(err3.message), err3 && err3.message);
  const rows = rep.flattenEvents([{ ...base, id: "ENC-1", vertical: "ENCALM HOTEL", events: [{ id: "e", type: "created", at: "2026-01-01T00:00:00Z", by: "X" }] }]);
  const csv = rep.toCsv(rows);
  ok("CSV has Vertical + Location columns", csv.split("\r\n")[0].includes("Host Name,Make,Model,Vertical,Location,Department,Criticality,Operational status,Event") && csv.includes(",,ENCALM HOTEL,DEL — T3"));
  ok("report search matches vertical", rep.filterRows(rows, { search: "hotel" }).length === 1);
  process.exit(fail ? 1 : 0);
})();
