const path = require("path"), fs = require("fs"), Module = require("module");
const repo = path.join(__dirname, "..");
const ts = require(path.join(repo, "node_modules/typescript"));
let fail = 0; const ok = (n, c, x = "") => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"} ${n} ${x}`); };
const cache = {};
function loadTs(rel) {
  const full = path.join(repo, rel); if (cache[full]) return cache[full];
  const out = ts.transpileModule(fs.readFileSync(full, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = { exports: {} }; cache[full] = m.exports;
  const req = (id) => id === "react-native" ? { Platform: { OS: "ios" }, Linking: { openURL: async () => {} } } : id.startsWith("@/") ? loadTs(id.slice(2) + ".ts") : id.startsWith("./") ? loadTs(path.join(path.dirname(rel), id) + ".ts") : require(id);
  new Function("module", "exports", "require", out)(m, m.exports, req); return m.exports;
}
const C = loadTs("lib/confirmations.ts"), W = loadTs("lib/assetWorkflow.ts"), M = loadTs("lib/mail.ts"), sp = loadTs("lib/sharepoint.ts"), R = loadTs("lib/reports.ts");
const rec = (id, email, extra = {}) => ({ id, assignee: email.split("@")[0], assigneeEmail: email, assignedAt: "2026-01-01T00:00:00Z", ...extra });
const asset = { id: "ENC-LAP-2026-0001", name: "ENC-DEL-LT-001", make: "Dell", model: "Latitude 5440", category: "Laptop", serialNumber: "SN1", status: "in_use", assignee: "rahul", location: "DEL — T3", vertical: "ENCALM HOTEL", purchaseDate: "", purchasePrice: 0, warrantyExpiry: null, notes: "", createdAt: "", updatedAt: "",
  assignmentHistory: [rec("h1", "old@encalm.com", { returnedAt: "2026-01-05T00:00:00Z" }), rec("h2", "Rahul@Encalm.com")], events: [] };
const conf = (custodyId, email, at = "2026-02-01T10:00:00Z", assetId = asset.id, id = Math.random().toString(36).slice(2)) => ({ id, assetId, custodyId, confirmedAt: at, createdByEmail: email, createdByName: "Rahul Sharma" });
// ---- applyConfirmations
let out = C.applyConfirmations([asset], [conf("h2", "rahul@encalm.com")])[0];
ok("valid confirmation applied (case-insensitive email)", out.assignmentHistory[1].confirmedAt === "2026-02-01T10:00:00Z" && out.assignmentHistory[1].confirmedBy === "Rahul Sharma");
ok("derived 'confirmed' event added for report logs", out.events.length === 1 && out.events[0].type === "confirmed");
ok("idempotent: applying twice adds no duplicate event", C.applyConfirmations([out], [conf("h2", "rahul@encalm.com")])[0].events.length === 1);
out = C.applyConfirmations([asset], [conf("h2", "someoneelse@encalm.com")])[0];
ok("confirmation by another user is ignored", !out.assignmentHistory[1].confirmedAt && out === asset);
out = C.applyConfirmations([asset], [conf("h1", "rahul@encalm.com")])[0];
ok("confirmation for a different custody record is ignored", !out.assignmentHistory.some((r) => r.confirmedAt));
out = C.applyConfirmations([asset], [conf("h2", "rahul@encalm.com", "x", "ENC-OTHER")])[0];
ok("confirmation for another asset is ignored", !out.assignmentHistory[1].confirmedAt);
out = C.applyConfirmations([asset], [conf("h2", "rahul@encalm.com", "2026-03-01T00:00:00Z"), conf("h2", "rahul@encalm.com", "2026-02-15T00:00:00Z")])[0];
ok("earliest valid confirmation wins", out.assignmentHistory[1].confirmedAt === "2026-02-15T00:00:00Z");
ok("asset id match is case-insensitive", !!C.applyConfirmations([asset], [conf("h2", "rahul@encalm.com", "t", "enc-lap-2026-0001")])[0].assignmentHistory[1].confirmedAt);
ok("report logs show the confirmation", R.flattenEvents([C.applyConfirmations([asset], [conf("h2", "rahul@encalm.com")])[0]]).some((r) => r.event === "Receipt confirmed by user"));
// ---- delete lock
const confirmedAsset = C.applyConfirmations([asset], [conf("h2", "rahul@encalm.com")])[0];
ok("locked: in use + confirmed", W.isDeleteLocked(confirmedAsset));
ok("locked: maintenance while still held + confirmed", W.isDeleteLocked({ ...confirmedAsset, status: "maintenance" }));
ok("unlocked: not yet confirmed", !W.isDeleteLocked(asset));
ok("unlocked: returned (Available)", !W.isDeleteLocked({ ...confirmedAsset, status: "available", assignmentHistory: confirmedAsset.assignmentHistory.map((r) => ({ ...r, returnedAt: r.returnedAt || "2026-04-01T00:00:00Z" })) }));
ok("unlocked: Out of Order", !W.isDeleteLocked({ ...confirmedAsset, status: "retired" }));
ok("unlocked: previous user's confirmation doesn't count", !W.isDeleteLocked({ ...asset, assignmentHistory: [rec("h1", "old@encalm.com", { returnedAt: "2026-01-05", confirmedAt: "2026-01-02" }), rec("h2", "rahul@encalm.com")] }));
// ---- new custody detection
ok("newCustodyRecords finds only new ones", JSON.stringify(W.newCustodyRecords([rec("a", "x@y.z")], [rec("a", "x@y.z"), rec("b", "p@q.r")]).map((r) => r.id)) === '["b"]');
// ---- mails
const link = C.confirmLink("https://tracker.encalmhospitality.com/", asset.id, "h2");
ok("confirm link", link === "https://tracker.encalmhospitality.com/confirm?asset=ENC-LAP-2026-0001&custody=h2", link);
const am = M.buildAssignmentConfirmMail(asset, asset.assignmentHistory[1], "IT Admin", link);
ok("assignment mail goes to the user", am.to.length === 1 && am.to[0] === "Rahul@Encalm.com");
ok("assignment mail: 'Laptop Confirmation' subject + confirm link", am.subject === "Laptop Confirmation — ENC-DEL-LT-001" && am.html.includes(link.replace(/&/g, "&amp;")) && am.body.includes(link), am.subject);
ok("assignment mail table: hostname, make/model, serial", am.html.includes("<td") && am.html.includes("ENC-DEL-LT-001") && am.html.includes("Dell Latitude 5440") && am.html.includes("SN1") && am.html.includes("Dear Rahul,"));
ok("assignment mail sent as helpdesk, IT in CC", am.from === "corpit.helpdesk@encalm.com" && am.cc.includes("encalmit@encalm.com"));
const rm = M.buildConfirmationReceiptMail({ id: asset.id, name: asset.name }, "Rahul Sharma", "rahul@encalm.com");
ok("confirmation mail goes to encalmit@encalm.com", JSON.stringify(rm.to) === '["encalmit@encalm.com"]' && rm.subject.startsWith("[Confirmed] Rahul Sharma received"));
// ---- make/model mapping
const f = sp.toSpFields(asset);
ok("client writes Make/Model", f.Make === "Dell" && f.Model === "Latitude 5440" && f.Title === "ENC-DEL-LT-001");
ok("create omits empty Make/Model", !("Make" in sp.toSpFields({ ...asset, make: "", model: undefined }, "ENC-1")));
ok("update clears emptied Make, leaves absent Model untouched", sp.toSpFields({ ...asset, make: "", model: undefined }).Make === "" && !("Model" in sp.toSpFields({ ...asset, make: "", model: undefined })));
const back = sp.fromSpItem({ id: "1", fields: { ...f, AssetId: asset.id } });
ok("client reads Make/Model", back.make === "Dell" && back.model === "Latitude 5440");
const csv = R.toCsv(R.flattenEvents([confirmedAsset]));
ok("CSV header has Host Name, Make, Model", csv.split("\r\n")[0].includes("Host Name,Make,Model,Vertical,Location"));
// ---- server mapping + missing column names the right one
const https = require("https"); const { EventEmitter } = require("events");
let reply;
https.request = (opts, cb) => { const req = new EventEmitter(); req.write = () => {}; req.end = () => {
  let status = 200, data = {};
  if (opts.path.startsWith("/v1.0/sites/") && !opts.path.includes("/lists")) data = { id: "site1" };
  else if (opts.path.includes("/lists?")) data = { value: [{ id: "list1" }] };
  else if (opts.method === "POST" || opts.method === "PATCH") ({ status, data } = reply);
  const res = new EventEmitter(); res.statusCode = status; res.headers = {}; cb(res); res.emit("data", JSON.stringify(data)); res.emit("end"); }; return req; };
const file = path.join(repo, "server/sharepoint-api.js");
const mod = new Module(file); mod.paths = Module._nodeModulePaths(path.dirname(file));
mod._compile(fs.readFileSync(file, "utf8") + "\nmodule.exports.__t={assetInputToSpFields,spItemToAsset};", file);
const S = mod.exports;
ok("server field map identical to client", JSON.stringify(S.__t.assetInputToSpFields(asset)) === JSON.stringify(f));
ok("server reads Make/Model", S.__t.spItemToAsset({ id: "1", fields: { Title: "x", Make: "HP", Model: "EliteBook" } }).model === "EliteBook");
(async () => {
  for (const col of ["Make", "Model", "Vertical"]) {
    reply = { status: 400, data: { error: { message: `Field '${col}' is not recognized` } } };
    let err; try { await S.createAsset("tok", asset); } catch (e) { err = e; }
    ok(`missing ${col} column -> names it`, err && err.statusCode === 400 && err.message.includes(`missing the '${col}' column`), err && err.message);
  }
  // ---- submit/fetch confirmations via fetch stub
  const calls = [];
  let listsExist = true;
  global.fetch = async (url, opts = {}) => {
    calls.push({ url, method: opts.method || "GET", body: opts.body });
    if (url.includes("/lists?")) return { ok: true, status: 200, json: async () => ({ value: listsExist ? [{ id: "conf1" }] : [] }) };
    if (url.endsWith("/lists")) return { ok: true, status: 200, json: async () => ({ value: [] }) };
    if (!url.includes("/lists")) return { ok: true, status: 200, json: async () => ({ id: "site1" }) };
    if ((opts.method || "GET") === "POST") return { ok: true, status: 201, text: async () => "" };
    return { ok: true, status: 200, json: async () => ({ value: [
      { id: "7", fields: { Title: asset.id, CustodyId: "h2", ConfirmedAt: "2026-02-01T10:00:00Z" }, createdBy: { user: { email: "rahul@encalm.com", displayName: "Rahul Sharma" } } },
      { id: "8", fields: { Title: "", CustodyId: "" }, createdBy: { user: { email: "x@y.z" } } } ] }) };
  };
  await C.submitConfirmation("tok", { assetId: asset.id, custodyId: "h2", assetName: asset.name });
  const post = calls.find((c) => c.method === "POST");
  const pf = JSON.parse(post.body).fields;
  ok("submit posts to the Asset Confirmations list", post.url.includes("/lists/conf1/items") && decodeURIComponent(calls.find((c) => c.url.includes("/lists?")).url).includes("Asset Confirmations"));
  ok("submit fields", pf.Title === asset.id && pf.CustodyId === "h2" && pf.AssetName === asset.name && !!pf.ConfirmedAt);
  const got = await C.fetchConfirmations("tok");
  ok("fetch maps createdBy email/name, skips blank items", got.length === 1 && got[0].createdByEmail === "rahul@encalm.com" && got[0].createdByName === "Rahul Sharma");
  // missing list: new module instance to avoid cache
  for (const k of Object.keys(cache)) delete cache[k];
  const C2 = loadTs("lib/confirmations.ts"); listsExist = false;
  let err; try { await C2.submitConfirmation("tok", { assetId: "a", custodyId: "b", assetName: "c" }); } catch (e) { err = e; }
  ok("missing list on submit -> clear error", err && err.statusCode === 404 && err.message.includes("Asset Confirmations") && err.message.includes("docs/DEPLOY.md"), err && err.message);
  ok("missing list on fetch -> no confirmations, no error", (await C2.fetchConfirmations("tok")).length === 0);
  // ---- return-to helper (web)
  for (const k of Object.keys(cache)) delete cache[k];
  const store = {}; global.window = { location: { pathname: "/confirm", search: "?asset=A&custody=h2" }, sessionStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } } };
  const N = loadTs("lib/navigation.ts");
  N.rememberReturnTo();
  ok("return-to saved for deep link", store["@encalm/return_to"] === "/confirm?asset=A&custody=h2");
  global.window.location = { pathname: "/", search: "?code=xyz" };
  N.rememberReturnTo();
  ok("Microsoft redirect (/?code=) doesn't overwrite it", store["@encalm/return_to"] === "/confirm?asset=A&custody=h2");
  ok("taken once, same answer for the second caller", N.takeReturnTo() === "/confirm?asset=A&custody=h2" && N.takeReturnTo() === "/confirm?asset=A&custody=h2" && !("@encalm/return_to" in store));
  store["@encalm/return_to"] = "//evil.example.com/x";
  for (const k of Object.keys(cache)) delete cache[k];
  ok("off-site return path rejected", loadTs("lib/navigation.ts").takeReturnTo() === "/");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("CRASH", e); process.exit(2); });
