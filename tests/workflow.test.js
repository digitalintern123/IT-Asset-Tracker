const path = require("path"), fs = require("fs"), Module = require("module");
const repo = path.join(__dirname, "..");
const ts = require(path.join(repo, "node_modules/typescript"));
let fail = 0; const ok = (n, c, x = "") => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"} ${n} ${x}`); };
const cache = {};
function loadTs(rel, extra = {}) {
  const full = path.join(repo, rel);
  if (cache[full]) return cache[full];
  const out = ts.transpileModule(fs.readFileSync(full, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const m = { exports: {} }; cache[full] = m.exports;
  const req = (id) => {
    if (id in extra) return extra[id];
    if (id.startsWith("@/")) return loadTs(id.slice(2) + ".ts", extra);
    if (id.startsWith("./")) return loadTs(path.join(path.dirname(rel), id) + ".ts", extra);
    throw new Error("unstubbed " + id);
  };
  new Function("module", "exports", "require", out)(m, m.exports, req);
  return m.exports;
}
let opened = [];
const RN = { Platform: { OS: "ios" }, Linking: { openURL: async (u) => { opened.push(u); } } };
const stubs = { "react-native": RN };
const { canTransitionStatus, validateStatusTransition } = loadTs("lib/statusModel.ts", stubs);
const { STATUSES, STATUS_LABELS } = loadTs("constants/categories.ts", stubs);
const wf = loadTs("lib/assetWorkflow.ts", stubs);
const mail = loadTs("lib/mail.ts", stubs);
const reports = loadTs("lib/reports.ts", stubs);
const sp = loadTs("lib/sharepoint.ts", stubs);
const { resolveAssetConflict } = loadTs("lib/conflictResolver.ts", stubs);

// ---- 1. statuses
ok("5 statuses in order", JSON.stringify(STATUSES) === JSON.stringify(["new", "in_use", "available", "maintenance", "retired"]));
ok("labels", STATUS_LABELS.new === "New Device" && STATUS_LABELS.retired === "Out of Order" && STATUS_LABELS.available === "Available");
ok("new -> in_use allowed", canTransitionStatus("new", "in_use"));
ok("nothing goes back to new", !["in_use", "available", "maintenance", "retired"].some((s) => canTransitionStatus(s, "new")));
ok("out of order terminal for non-admin", !validateStatusTransition("retired", "available", { isAdmin: false }).valid);
ok("in use still needs assignee", !validateStatusTransition("new", "in_use", { assignee: "" }).valid);
ok("maintenance still needs notes", !validateStatusTransition("in_use", "maintenance", { assignee: "A", notes: "" }).valid);
const file = path.join(repo, "server/sharepoint-api.js");
const smod = new Module(file); smod.paths = Module._nodeModulePaths(path.dirname(file));
smod._compile(fs.readFileSync(file, "utf8") + "\nmodule.exports.__t={mapStatus,assetInputToSpFields,spItemToAsset};", file);
const S = smod.exports.__t;
for (const [raw, want] of [["new", "new"], ["New Device", "new"], ["Out of Order", "retired"], ["retired", "retired"], ["in_use", "in_use"], ["available", "available"], ["maintenance", "maintenance"], ["Not in Use", "available"]])
  ok(`server mapStatus(${raw}) = ${want}`, S.mapStatus(raw) === want, S.mapStatus(raw));

// ---- 2. workflow scenario
const base = { name: "MacBook Pro", category: "Laptop", serialNumber: "SN1", status: "new", assignee: "", location: "T3", purchaseDate: "2024-01-01", purchasePrice: 1, warrantyExpiry: null, notes: "" };
const c = wf.eventsForCreate(base, { by: "Tech Tina" });
ok("create: registered event, no custody", c.events.length === 1 && c.events[0].type === "created" && c.events[0].toStatus === "new" && c.history.length === 0);
let asset = { ...base, id: "ENC-LAP-1", createdAt: "", updatedAt: "", assignmentHistory: c.history, events: c.events };
const apply = (input, ctx) => { const r = wf.eventsForUpdate(asset, input, ctx); asset = { ...asset, ...input, assignmentHistory: r.history, events: [...asset.events, ...r.events] }; return r; };
let r = apply({ ...wf.toAssetInput(asset), status: "in_use", assignee: "Rahul" }, { by: "Tech Tina", assigneeEmail: "rahul@encalm.com" });
ok("issue: assigned + status event, custody opened with email", r.events.map((e) => e.type).join() === "assigned,status_changed" && asset.assignmentHistory.length === 1 && asset.assignmentHistory[0].assigneeEmail === "rahul@encalm.com");
const toPriya = { ...wf.toAssetInput(asset), assignee: "Priya" };
ok("technician reassign needs approval", wf.needsReassignApproval(asset, toPriya, false));
ok("admin reassign does not", !wf.needsReassignApproval(asset, toPriya, true));
ok("returning (available) needs no approval", !wf.needsReassignApproval(asset, { ...toPriya, status: "available", assignee: "" }, false));
ok("same user (case) needs no approval", !wf.needsReassignApproval(asset, { ...toPriya, assignee: " rahul " }, false));
r = apply(toPriya, { by: "Admin Anu", approvedBy: "Admin Anu", assigneeEmail: "priya@encalm.com" });
ok("approved reassign: Rahul returned, Priya assigned with approver", r.events.map((e) => e.type).join() === "returned,assigned" && r.events[1].approvedBy === "Admin Anu");
ok("custody: old closed, new open with approvedBy", asset.assignmentHistory.length === 2 && !!asset.assignmentHistory[0].returnedAt && !asset.assignmentHistory[1].returnedAt && asset.assignmentHistory[1].approvedBy === "Admin Anu");
r = apply({ ...wf.toAssetInput(asset), status: "maintenance", notes: "Screen flicker" }, { by: "Tech Tina" });
ok("maintenance: status event with reason, custody stays open", r.events.length === 1 && r.events[0].toStatus === "maintenance" && r.events[0].notes === "Screen flicker" && !asset.assignmentHistory[1].returnedAt);
ok("maintenance mail goes to user + IT manager", (() => { const m = mail.buildMaintenanceMail(asset, "Screen flicker", "Tech Tina"); return m.to.includes("priya@encalm.com") && m.to.includes("it@encalmhospitality.com") && m.body.includes("Screen flicker"); })());
r = apply({ ...wf.toAssetInput(asset), status: "retired", notes: "Water damage" }, { by: "Admin Anu" });
ok("out of order: custody closed, returned + status events", r.events.map((e) => e.type).join() === "returned,status_changed" && asset.assignmentHistory.every((h) => h.returnedAt));
ok("full trail recorded", asset.events.length === 8, asset.events.map((e) => e.type).join());

// ---- 3. Notes round-trip (client + server), escaping, cap
const evil = { ...asset, notes: "user notes --> tricky", events: [...asset.events, wf.makeEvent("status_changed", { by: "X", notes: "closes --> comment" })] };
const fields = sp.toSpFields(evil);
ok("no raw --> inside stored JSON", (fields.Notes.match(/-->/g) || []).length === (fields.Notes.match(/<!-- /g) || []).length, fields.Notes.slice(0, 60));
const back = sp.fromSpItem({ id: "9", fields: { ...fields, Title: "MacBook Pro", AssetId: "ENC-LAP-1" } });
ok("client round-trip keeps events/history", back.events.length === evil.events.length && back.assignmentHistory.length === 2 && back.events.at(-1).notes === "closes --> comment");
ok("client round-trip keeps user notes (comment markers removed)", back.notes === "user notes  tricky", back.notes);
const sfields = S.assetInputToSpFields(evil);
const sback = S.spItemToAsset({ id: "9", fields: { ...sfields, Title: "MacBook Pro" } });
ok("server round-trip keeps events", sback.events.length === evil.events.length);
ok("client/server serialize identically", JSON.stringify(sfields.Notes) === JSON.stringify(fields.Notes));
const many = { ...evil, events: Array.from({ length: 250 }, (_, i) => wf.makeEvent("status_changed", { by: "X", notes: `e${i}` })) };
const capped = sp.fromSpItem({ id: "9", fields: sp.toSpFields(many) }).events;
ok("cap keeps newest 200", capped.length === 200 && capped[0].notes === "e50" && capped[199].notes === "e249");
const legacy = sp.fromSpItem({ id: "1", fields: { Title: "Old", Status: "Retired", Notes: "plain" } });
ok("legacy item: no events, Retired -> Out of Order", Array.isArray(legacy.events) && legacy.events.length === 0 && legacy.status === "retired");

// ---- 4. conflict merge keeps both sides' events
const e1 = wf.makeEvent("assigned", { by: "A", at: "2026-01-01T00:00:00Z" }), e2 = wf.makeEvent("status_changed", { by: "B", at: "2026-01-02T00:00:00Z" }), e3 = wf.makeEvent("returned", { by: "C", at: "2026-01-03T00:00:00Z" });
const merged = resolveAssetConflict({ ...asset, events: [e1, e3] }, { ...asset, events: [e1, e2] }, asset).mergedAsset;
ok("conflict merge unions events in time order", merged.events.map((e) => e.by).join() === "A,B,C");

(async () => {
  // ---- 5. email
  let calls = [];
  global.fetch = async (url, opts) => { calls.push({ url, body: JSON.parse(opts.body), auth: opts.headers.Authorization }); return { status: global.__status || 202 }; };
  const msg = { to: ["a@x.com"], cc: ["b@x.com"], subject: "S", body: "B" };
  ok("deliverMail sends via Graph", (await mail.deliverMail("tok", msg)) === "sent" && calls[0].url.endsWith("/me/sendMail") && calls[0].body.message.toRecipients[0].emailAddress.address === "a@x.com" && calls[0].body.message.body.contentType === "Text");
  global.__status = 403; opened = [];
  ok("403 (no consent) falls back to draft", (await mail.deliverMail("tok", msg)) === "draft" && opened[0].startsWith("mailto:a%40x.com?"));
  opened = [];
  ok("no token -> draft", (await mail.deliverMail(null, msg)) === "draft" && opened.length === 1);
  ok("no recipients -> failed, nothing opened", (await mail.deliverMail("tok", { ...msg, to: [] })) === "failed");
  ok("cleanRecipients dedupes/validates", JSON.stringify(mail.cleanRecipients(["A@x.com", "a@x.com", "bad", "", null, " c@y.org "])) === JSON.stringify(["A@x.com", "c@y.org"]));
  const req = { id: "r", action: "reassign", status: "pending", requesterName: "Tina", requesterEmail: "tina@encalm.com", requestedAt: new Date().toISOString(), reason: "Shift change", pendingChanges: { assignee: "Priya", assigneeEmail: "priya@encalm.com" } };
  const rm = mail.buildReassignRequestMail(asset, req);
  ok("reassign request mail -> admins, names new user", rm.to.length === 3 && rm.body.includes("Priya") && rm.body.includes("Shift change"));
  const dm = mail.buildReassignDecisionMail(asset, req, true, "Admin Anu");
  ok("decision mail -> requester", dm.to[0] === "tina@encalm.com" && dm.subject.startsWith("[Approved]"));

  // ---- 6. reports
  const rows = reports.flattenEvents([asset, { ...asset, id: "ENC-MON-2", name: "Monitor", events: [wf.makeEvent("created", { by: "Z", toStatus: "new", at: "2020-05-05T00:00:00Z" })] }]);
  ok("flatten: all events, newest first", rows.length === 9 && rows[0].at >= rows[rows.length - 1].at && rows[rows.length - 1].assetId === "ENC-MON-2");
  ok("filter by type", reports.filterRows(rows, { type: "assigned" }).length === 2);
  ok("filter by status (Out of Order)", reports.filterRows(rows, { status: "retired" }).length === 1);
  ok("filter by search user", reports.filterRows(rows, { search: "priya" }).length >= 1 && reports.filterRows(rows, { search: "priya" }).every((x) => JSON.stringify(x).toLowerCase().includes("priya")));
  ok("filter by date range", reports.filterRows(rows, { from: "2020-05-05", to: "2020-05-05" }).length === 1);
  const csv = reports.toCsv([{ ...rows[0], notes: 'He said "hi", then\nleft', device: "=HYPERLINK(1)" }]);
  ok("csv: BOM + header", csv.startsWith("﻿Date,Asset ID,Host Name,Make,Model,Vertical,Location,Department,Criticality,Operational status,Event"));
  ok("csv: quotes/commas/newlines escaped", csv.includes('"He said ""hi"", then\nleft"'));
  ok("csv: formula injection neutralised", csv.includes("'=HYPERLINK(1)") && !csv.includes(",=HYPERLINK"));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("CRASH", e); process.exit(2); });
