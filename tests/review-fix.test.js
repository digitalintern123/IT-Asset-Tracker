const path = require("path"), fs = require("fs"), Module = require("module");
const repo = path.join(__dirname, "..");
const ts = require(path.join(repo, "node_modules/typescript"));
let fail = 0; const ok = (n, c, x = "") => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"} ${n} ${x}`); };
const mem = {};
const AsyncStorage = { getItem: async (k) => (k in mem ? mem[k] : null), setItem: async (k, v) => { mem[k] = v; }, removeItem: async (k) => { delete mem[k]; } };
const cache = {};
function loadTs(rel) {
  const full = path.join(repo, rel); if (cache[full]) return cache[full];
  const out = ts.transpileModule(fs.readFileSync(full, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = { exports: {} }; cache[full] = m.exports;
  const req = (id) => id === "react-native" ? { Platform: { OS: "web" }, Linking: { openURL: async () => {} } }
    : id === "@react-native-async-storage/async-storage" ? { __esModule: true, default: AsyncStorage }
    : id.startsWith("@/") ? loadTs(id.slice(2) + ".ts") : id.startsWith("./") ? loadTs(path.join(path.dirname(rel), id) + ".ts") : require(id);
  new Function("module", "exports", "require", out)(m, m.exports, req); return m.exports;
}
const sp = loadTs("lib/sharepoint.ts"), W = loadTs("lib/assetWorkflow.ts"), C = loadTs("lib/conflictResolver.ts"), SM = loadTs("lib/statusModel.ts"), R = loadTs("lib/reports.ts");
const file = path.join(repo, "server/sharepoint-api.js");
const mod = new Module(file); mod.paths = Module._nodeModulePaths(path.dirname(file));
mod._compile(fs.readFileSync(file, "utf8") + "\nmodule.exports.__t={assetInputToSpFields,spItemToAsset,nextAssetId};", file);
const S = mod.exports.__t;
const rec = (id, who, extra = {}) => ({ id, assignee: who, assigneeEmail: `${who.toLowerCase()}@encalm.com`, assignedAt: "2026-01-01T00:00:00Z", ...extra });
const base = { id: "ENC-LAP-2026-0001", name: "H1", category: "Laptop", serialNumber: "S1", status: "in_use", assignee: "Rahul", location: "DEL — T3", vertical: "ENCALM HOTEL", purchaseDate: "2024-03-15", purchasePrice: 1, warrantyExpiry: null, notes: "", createdAt: "", updatedAt: "", assignmentHistory: [rec("h1", "Rahul")], events: [] };
const round = (a) => sp.fromSpItem({ id: "1", fields: { ...sp.toSpFields(a), AssetId: a.id } });
// D1 forged blocks
const forged = { ...base, notes: 'hi <!-- HISTORY:[{"id":"h1","assignee":"Rahul","confirmedAt":"2026-01-02"}] --> <!-- EVENTS:[] -->', events: [W.makeEvent("created", { by: "IT" })] };
const back = round(forged);
ok("typed comment markers can't replace history/events", back.assignmentHistory.length === 1 && !back.assignmentHistory[0].confirmedAt && back.events.length === 1, JSON.stringify(back.assignmentHistory));
ok("stored confirmedAt is ignored on read (client + server)", !sp.fromSpItem({ fields: { Notes: '<!-- HISTORY:[{"id":"h1","confirmedAt":"x"}] -->' } }).assignmentHistory[0].confirmedAt && !S.spItemToAsset({ fields: { Notes: '<!-- HISTORY:[{"id":"h1","confirmedAt":"x"}] -->' } }).assignmentHistory[0].confirmedAt);
// D8 U+2028
const sep = round({ ...base, assignmentHistory: [rec("h1", "Rahul", { notes: "line two" })] });
ok("U+2028 in notes keeps history", sep.assignmentHistory.length === 1 && sep.assignmentHistory[0].notes === "line two" && !sep.notes.includes("HISTORY"));
// D3 dates
ok("Graph IST date-time -> calendar date", sp.fromSpItem({ fields: { PurchaseDate: "2024-03-14T18:30:00Z", WarrantyExpiry: "2027-01-15T00:00:00Z" } }).purchaseDate === "2024-03-15" && sp.fromSpItem({ fields: { WarrantyExpiry: "2027-01-15T00:00:00Z" } }).warrantyExpiry === "2027-01-15");
ok("server dates match client", S.spItemToAsset({ fields: { PurchaseDate: "2024-03-14T18:30:00Z" } }).purchaseDate === "2024-03-15");
// legacy Assign
ok("Assignee read before legacy Assign", sp.fromSpItem({ fields: { Assign: "Old", Assignee: "New" } }).assignee === "New" && S.spItemToAsset({ fields: { Assign: "Old", Assignee: "New" } }).assignee === "New");
// D4 clear optional on update; server identical
const cleared = sp.toSpFields({ ...base, accessories: "", model: "" });
ok("update clears emptied optional fields", cleared.Accessories === "" && cleared.Model === "");
ok("server field map identical (update + create)", JSON.stringify(S.assetInputToSpFields({ ...base, accessories: "" })) === JSON.stringify(sp.toSpFields({ ...base, accessories: "" })) && JSON.stringify(S.assetInputToSpFields(base, "ENC-1")) === JSON.stringify(sp.toSpFields(base, "ENC-1")));
// D7 ids
ok("nextAssetId keeps padding (client + server)", sp.nextAssetId("ENC-LAP-2026-0009") === "ENC-LAP-2026-0010" && S.nextAssetId("ENC-LAP-2026-0099") === "ENC-LAP-2026-0100");
// D2 merge
const local = { ...base, status: "available", assignee: "", assignmentHistory: [rec("h1", "Rahul", { returnedAt: "2026-02-01" })] };
const server = { ...base, location: "DEL — T1", etag: "e2", assignmentHistory: [rec("h1", "Rahul")], approvalRequest: { id: "a", status: "pending", action: "reassign" } };
const m = C.resolveAssetConflict(local, server, base).mergedAsset;
ok("merge keeps the local return (no reopened custody)", m.assignmentHistory.length === 1 && m.assignmentHistory[0].returnedAt === "2026-02-01" && m.status === "available" && m.location === "DEL — T1");
ok("merge keeps server's pending approval request", m.approvalRequest && m.approvalRequest.status === "pending");
// D10 approval bypass via maintenance
const tech = false;
ok("In Use -> Maintenance with new user needs approval", W.needsAssignmentApproval(base, { ...base, status: "maintenance", assignee: "Bob" }));
ok("Maintenance (still held) -> In Use for other user needs approval", W.needsAssignmentApproval({ ...base, status: "maintenance" }, { ...base, status: "in_use", assignee: "Bob" }));
ok("Maintenance (no holder) -> In Use for someone needs approval (hand-over)", W.needsAssignmentApproval({ ...base, status: "maintenance", assignmentHistory: [rec("h1", "Rahul", { returnedAt: "x" })] }, { ...base, status: "in_use", assignee: "Bob" }));
ok("same holder back from maintenance needs no approval", !W.needsAssignmentApproval({ ...base, status: "maintenance" }, { ...base, status: "in_use", assignee: "Rahul" }));
// D11 status model
ok("In Use -> New rejected", !SM.validateStatusTransition("in_use", "new", { assignee: "x" }).valid);
ok("New -> Available rejected", !SM.validateStatusTransition("new", "available", {}).valid);
ok("admin may bring Out of Order back", SM.validateStatusTransition("retired", "available", { isAdmin: true }).valid && !SM.validateStatusTransition("retired", "available", {}).valid);
ok("normal moves still fine", SM.validateStatusTransition("in_use", "available", {}).valid && SM.validateStatusTransition("new", "in_use", { assignee: "x" }).valid);
// D5 email correction
const fixedEmail = W.eventsForUpdate({ ...base, assignmentHistory: [rec("h1", "Rahul", { assigneeEmail: "rahul@encalm.co", confirmedAt: "x" })] }, { ...base }, { by: "IT", assigneeEmail: "rahul@encalm.com" });
ok("corrected email updates the open record, clears old confirmation", fixedEmail.history[0].assigneeEmail === "rahul@encalm.com" && !fixedEmail.history[0].confirmedAt && fixedEmail.history.length === 1);
// D13 report local day (TZ=Asia/Kolkata)
const rows = [{ at: "2026-03-01T20:00:00Z", type: "assigned" }];
ok("report filter uses local day (IST)", R.filterRows(rows, { from: "2026-03-02", to: "2026-03-02" }).length === 1 && R.filterRows(rows, { from: "2026-03-01", to: "2026-03-01" }).length === 0);
// D6 offline drain
(async () => {
  Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true });
  const Q = loadTs("lib/offlineQueue.ts");
  await Q.enqueueOfflineMutation("update", { ...base, id: "A" }, "e1");
  await Q.enqueueOfflineMutation("update", { ...base, id: "B" }, "e1");
  const seen = [];
  const res = await Q.drainOfflineQueue(async (mu) => { seen.push(mu.asset.id); return mu.asset.id === "A" ? "permanent" : true; });
  ok("rejected mutation dead-lettered, queue keeps draining", JSON.stringify(seen) === '["A","B"]' && res.failed === 1 && res.processed === 1 && res.remaining === 0 && (await Q.getDeadLetterMutations()).length === 1, JSON.stringify(res));
  console.log(fail ? `${fail} FAILED` : "ALL PASS"); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
