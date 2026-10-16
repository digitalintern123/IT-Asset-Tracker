// Approval matrix: approval emails, links and import batch email.
const path = require("path"), fs = require("fs");
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
const M = loadTs("lib/mail.ts"), C = loadTs("lib/msConfig.ts");
const asset = { id: "ENC-LAP-2026-0001", name: "DEL-EATS-NB005", make: "Dell", model: "Latitude 3420", category: "Laptop", serialNumber: "SN1", status: "in_use", assignee: "Rahul", location: "DEL — T3",
  assignmentHistory: [{ id: "h1", assignee: "Rahul", assigneeEmail: "rahul@encalm.com", assignedAt: "2026-01-01" }], events: [] };
const req = { id: "appr_1", action: "reassign", status: "pending", requesterName: "Tech One", requesterEmail: "tech@encalm.com", requestedAt: "2026-02-01T00:00:00Z", reason: "<b>new joiner</b>",
  pendingChanges: { status: "in_use", assignee: "Priya", assigneeEmail: "priya@encalm.com", location: "DEL — T1" } };

const link = M.approvalLink("https://tracker.encalmhospitality.com/", { assetId: asset.id, requestId: req.id }, "approve");
ok("approval link", link === "https://tracker.encalmhospitality.com/approve?asset=ENC-LAP-2026-0001&request=appr_1&decision=approve", link);
ok("batch link", M.approvalLink("https://t", { batchId: "imp_x" }, "reject") === "https://t/approve?batch=imp_x&decision=reject");

const m = M.buildReassignRequestMail(asset, req, "https://t");
const b2 = M.buildImportApprovalMail("imp_0", [{ name: "x", id: "y", assignee: "z" }], { name: "IT" }, "https://t");
ok("goes to the approvers (APPROVAL_EMAILS)", JSON.stringify(m.to) === JSON.stringify(C.MS_CONFIG.APPROVAL_EMAILS.map((e) => e.trim())), JSON.stringify(m.to));
ok("approval emails go to Prasenjit (Head of IT)", JSON.stringify(m.to) === JSON.stringify(["prasenjit.baidya@encalm.com"]) && JSON.stringify(b2.to) === JSON.stringify(["prasenjit.baidya@encalm.com"]));
ok("subject names device and new user", m.subject === "[Approval required] Hand over DEL-EATS-NB005 to Priya", m.subject);
ok("HTML has Approve and Reject buttons to the approval page", m.html.includes("https://t/approve?asset=ENC-LAP-2026-0001&amp;request=appr_1&amp;decision=approve") && m.html.includes("decision=reject") && m.html.includes(">Approve<") && m.html.includes(">Reject<"));
ok("shows current holder and new user", m.html.includes("Rahul") && m.html.includes("Priya (priya@encalm.com)"));
ok("user text is escaped", !m.html.includes("<b>new joiner</b>") && m.html.includes("&lt;b&gt;new joiner&lt;/b&gt;"));
ok("plain-text fallback has both links", m.body.includes("Approve: https://t/approve?") && m.body.includes("Reject: https://t/approve?"));
const fresh = M.buildReassignRequestMail({ ...asset, status: "new", assignee: "", assignmentHistory: [] }, req, "https://t");
ok("new device: 'Nobody (in IT stock)'", fresh.html.includes("Nobody (in IT stock)"));

const devices = Array.from({ length: 60 }, (_, i) => ({ name: `GOA-NB${i}`, id: `ENC-LAP-2026-${String(i).padStart(4, "0")}`, assignee: `User ${i}` }));
const b = M.buildImportApprovalMail("imp_1", devices, { name: "IT Admin" }, "https://t");
ok("batch: one email for the whole import", b.subject === "[Approval required] Inventory import — 60 hand-over(s)" && b.html.includes("https://t/approve?batch=imp_1&amp;decision=approve"));
ok("batch: lists devices (first 50) and says how many more", b.html.includes("GOA-NB49") && !b.html.includes("GOA-NB50<") && b.html.includes("10 more"));

const d = M.buildReassignDecisionMail(asset, { ...req, status: "approved" }, true, "IT Head");
ok("decision email to the requester", JSON.stringify(d.to) === '["tech@encalm.com"]' && d.subject.startsWith("[Approved] Hand over") && d.body.includes("confirmation email"));
console.log(fail ? `${fail} FAILED` : "ALL PASS"); process.exit(fail ? 1 : 0);
