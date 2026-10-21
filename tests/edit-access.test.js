// Approver group, technician edit approval, "my devices only" for staff,
// per-device SharePoint access, QR labels and the report status overview.
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
const R = loadTs("lib/roles.ts"), E = loadTs("lib/editAccess.ts"), A = loadTs("lib/itemAccess.ts"), M = loadTs("lib/mail.ts");
const Q = loadTs("lib/qrLabel.ts"), P = loadTs("lib/reports.ts");

// --- role flags ---------------------------------------------------------
const flags = (roles) => R.roleFlags(R.resolveUserRole("x@encalm.com", roles), roles);
ok("Asset.Approver -> approver, sees all", flags(["Asset.Approver"]).isApprover && flags(["Asset.Approver"]).seesAll);
ok("approver flag is case-insensitive, exact", flags(["APPROVER"]).isApprover && !flags(["NotApprover"]).isApprover);
ok("approver does not raise the rank", R.resolveUserRole("x@encalm.com", ["Asset.Approver"]) === "viewer");
ok("admin is not an approver by itself", !flags(["Asset.Admin"]).isApprover && flags(["Asset.Admin"]).seesAll);
ok("Asset.Viewer (auditor) sees all", flags(["Asset.Viewer"]).seesAll && !flags(["Asset.Viewer"]).isApprover);
ok("technician sees all", flags(["Asset.Technician"]).seesAll);
ok("staff (no role) sees only own", !flags([]).seesAll && !flags([]).isApprover);
ok("admin + approver claims: both flags", flags(["Asset.Admin", "Asset.Approver"]).isApprover && flags(["Asset.Admin", "Asset.Approver"]).seesAll);
const src = fs.readFileSync(path.join(repo, "server/serve-web.js"), "utf8");
const serverApprover = new Function(src.slice(src.indexOf("const APPROVER_CLAIMS"), src.indexOf("\n}\n", src.indexOf("function isApproverClaim")) + 3) + "\nreturn { APPROVER_CLAIMS, isApproverClaim };")();
ok("server APPROVER_CLAIMS identical to client", JSON.stringify(serverApprover.APPROVER_CLAIMS) === JSON.stringify(R.APPROVER_CLAIMS));
ok("server: approver may PATCH and apply approved deletes", /callerRole === "viewer" && !callerIsApprover/.test(src) && /callerRole !== "admin" && !callerIsApprover/.test(src));
ok("server isApproverClaim", serverApprover.isApproverClaim(["Asset.Approver"]) && !serverApprover.isApproverClaim(["Asset.Admin"]) && !serverApprover.isApproverClaim(null));

// --- edit grant ----------------------------------------------------------
const now = Date.parse("2026-10-19T10:00:00Z");
const tech = { role: "technician", email: "Tech@encalm.com", isApprover: false };
const grant = (o = {}) => ({ id: "appr_e", action: "edit_access", status: "approved", requesterName: "Tech", requesterEmail: "tech@encalm.com", requestedAt: "2026-10-19T08:00:00Z", reason: "fix serial", decidedAt: "2026-10-19T09:00:00Z", ...o });
const dev = (req) => ({ id: "ENC-1", name: "H1", status: "available", assignee: "", approvalRequest: req });
ok("technician needs approval; admin/approver don't", E.needsEditApproval(tech) && !E.needsEditApproval({ role: "admin" }) && !E.needsEditApproval({ role: "technician", isApprover: true }));
ok("valid grant for requester (any case)", !!E.activeEditGrant(dev(grant()), "TECH@encalm.com", now));
ok("grant is for the requester only", !E.activeEditGrant(dev(grant()), "other@encalm.com", now));
ok("grant expires after 24 hours", !!E.activeEditGrant(dev(grant()), tech.email, Date.parse("2026-10-20T08:59:00Z")) && !E.activeEditGrant(dev(grant()), tech.email, Date.parse("2026-10-20T09:00:01Z")));
ok("grant is single use", !E.activeEditGrant(dev(grant({ consumedAt: "2026-10-19T09:30:00Z" })), tech.email, now));
ok("pending / rejected / other action is no grant", !E.activeEditGrant(dev(grant({ status: "pending" })), tech.email, now) && !E.activeEditGrant(dev(grant({ status: "rejected" })), tech.email, now) && !E.activeEditGrant(dev(grant({ action: "reassign" })), tech.email, now));
ok("editState: direct for admin", E.editState(dev(), { role: "admin" }, true, now) === "direct");
ok("editState: request / pending / granted / none", E.editState(dev(), tech, true, now) === "request" && E.editState(dev(grant({ status: "pending" })), tech, true, now) === "pending" && E.editState(dev(grant()), tech, true, now) === "granted" && E.editState(dev(), { role: "viewer" }, false, now) === "none");
ok("editState: someone else's pending request -> request", E.editState(dev(grant({ status: "pending", requesterEmail: "b@encalm.com" })), tech, true, now) === "request");

// --- own devices ---------------------------------------------------------
const mine = { id: "A", name: "a", status: "in_use", assignee: "Neha", assignmentHistory: [{ id: "h", assignee: "Neha", assigneeEmail: "neha@encalm.com", assignedAt: "x" }] };
const returned = { id: "B", name: "b", status: "available", assignee: "", assignmentHistory: [{ id: "h", assignee: "Neha", assigneeEmail: "neha@encalm.com", assignedAt: "x", returnedAt: "y" }] };
const legacy = { id: "C", name: "c", status: "in_use", assignee: "neha@encalm.com" };
const other = { id: "D", name: "d", status: "in_use", assignee: "Raj", assignmentHistory: [{ id: "h", assignee: "Raj", assigneeEmail: "raj@encalm.com", assignedAt: "x" }] };
const list = [mine, returned, legacy, other];
ok("staff sees only open custody + legacy email assignee", JSON.stringify(E.visibleAssets(list, { role: "viewer", email: "NEHA@encalm.com", seesAll: false }).map((a) => a.id)) === '["A","C"]');
ok("auditor/IT/signed-out see all", E.visibleAssets(list, { seesAll: true }).length === 4 && E.visibleAssets(list, null).length === 4);
ok("staff with no email sees nothing", E.visibleAssets(list, { role: "viewer", seesAll: false }).length === 0);

// --- emails --------------------------------------------------------------
const asset = { id: "ENC-LAP-1", name: "DEL-NB005", make: "Dell", model: "5420", category: "Laptop", serialNumber: "SN1", status: "in_use", assignee: "Rahul" };
const pend = grant({ status: "pending", decidedAt: undefined, reason: "<b>wrong serial</b>" });
const rm = M.buildEditRequestMail(asset, pend, "https://t");
ok("edit request goes to approvers with Approve/Reject", JSON.stringify(rm.to) === '["prasenjit.baidya@encalm.com"]' && rm.html.includes("approve?asset=ENC-LAP-1&amp;request=appr_e&amp;decision=approve") && rm.html.includes(">Reject<"));
ok("edit request subject + escaped reason", rm.subject === "[Approval required] Edit DEL-NB005 — requested by Tech" && rm.html.includes("&lt;b&gt;wrong serial") && !rm.html.includes("<b>wrong"));
ok("approve buttons name the approver group", rm.html.includes("IT-Asset Approver"));
const ok1 = M.buildEditDecisionMail(asset, grant(), true, "Prasenjit", "https://t");
ok("approved: to technician, says one save in 24 h, links device", JSON.stringify(ok1.to) === '["tech@encalm.com"]' && ok1.subject === "[Approved] Edit DEL-NB005 (ENC-LAP-1)" && /one save within 24 hours/.test(ok1.body) && ok1.body.includes("https://t/asset/ENC-LAP-1"));
const no1 = M.buildEditDecisionMail(asset, grant({ status: "rejected", decisionNotes: "not needed" }), false, "Prasenjit");
ok("rejected: says so with notes, no edit link", no1.subject.startsWith("[Rejected]") && no1.body.includes("not needed") && !no1.body.includes("/asset/"));

// --- per-device SharePoint access ----------------------------------------
ok("access plan: grant current, revoke earlier holders", JSON.stringify(A.accessPlan([{ assigneeEmail: "A@x.com", returnedAt: "t" }, { assigneeEmail: "b@x.com", returnedAt: "t" }, { assigneeEmail: "B@x.com" }])) === '{"grant":"b@x.com","revoke":["a@x.com"]}');
ok("access plan: returned device revokes only", JSON.stringify(A.accessPlan([{ assigneeEmail: "a@x.com", returnedAt: "t" }])) === '{"revoke":["a@x.com"]}');
ok("scope is the SharePoint site's AllSites.Manage", A.ITEM_ACCESS_SCOPE === "https://encalmit.sharepoint.com/AllSites.Manage");
function mockSp({ unique = false, failOn } = {}) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url: decodeURIComponent(url), method: init.method, body: init.body, auth: init.headers.Authorization });
    const j = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
    if (failOn && url.includes(failOn)) return j(403, { "odata.error": { message: { value: "Access denied" } } });
    if (url.includes("HasUniqueRoleAssignments")) return j(200, { HasUniqueRoleAssignments: unique });
    if (url.endsWith("/ensureuser")) return j(200, { Id: 42 });
    if (url.includes("roledefinitions/getbytype(2)")) return j(200, { Id: 1073741826 });
    return j(200, {});
  };
  return { f, calls };
}
(async () => {
  let m = mockSp();
  await A.grantItemRead("tok", "7", "Neha@Encalm.com", m.f);
  const urls = m.calls.map((c) => `${c.method} ${c.url.replace("https://encalmit.sharepoint.com/_api/web", "")}`);
  ok("grant: breaks inheritance (copying IT's access) then adds Read", urls.some((u) => u === "POST /lists/getbytitle('IT Asset Register')/items(7)/breakroleinheritance(copyRoleAssignments=true,clearSubscopes=true)") && urls[urls.length - 1] === "POST /lists/getbytitle('IT Asset Register')/items(7)/roleassignments/addroleassignment(principalid=42,roledefid=1073741826)", JSON.stringify(urls));
  ok("grant: ensureuser with the Entra claim, bearer token", m.calls.some((c) => c.url.endsWith("/ensureuser") && JSON.parse(c.body).logonName === "i:0#.f|membership|neha@encalm.com") && m.calls.every((c) => c.auth === "Bearer tok"));
  m = mockSp({ unique: true });
  await A.grantItemRead("tok", 7, "n@x.com", m.f);
  ok("grant: no second breakroleinheritance", !m.calls.some((c) => c.url.includes("breakroleinheritance")));
  m = mockSp({ unique: true });
  await A.revokeItemRead("tok", 7, "n@x.com", m.f);
  ok("revoke: removeroleassignment", m.calls.some((c) => c.url.endsWith("removeroleassignment(principalid=42,roledefid=1073741826)")));
  m = mockSp({ unique: false });
  await A.revokeItemRead("tok", 7, "n@x.com", m.f);
  ok("revoke: inherited item is left alone", !m.calls.some((c) => c.method === "POST"));
  m = mockSp({ failOn: "addroleassignment" });
  let err = null; try { await A.grantItemRead("tok", 7, "n@x.com", m.f); } catch (e) { err = e; }
  ok("grant failure surfaces SharePoint's message", err && err.statusCode === 403 && /Access denied/.test(err.message));
  err = null; try { await A.grantItemRead("tok", "", "n@x.com", m.f); } catch (e) { err = e; }
  ok("grant without a SharePoint item id fails clearly", err && /no SharePoint item/.test(err.message));
  // the context never lets an access failure block the hand-over
  const ctx = fs.readFileSync(path.join(repo, "contexts/AssetContext.tsx"), "utf8");
  ok("context: access errors are caught and logged", /recordError\("access"/.test(ctx) && /return \{ ok: false, error \}/.test(ctx));
  ok("context: approvals need isApprover", (ctx.match(/if \(!user\?\.isApprover\)/g) || []).length === 2);
  ok("context: edit grant enforced and consumed", ctx.includes("throw new Error(EDIT_APPROVAL_MESSAGE)") && ctx.includes("consumedAt: new Date().toISOString()"));
  ok("approve page requires approver", fs.readFileSync(path.join(repo, "app/approve.tsx"), "utf8").includes("!isApprover"));

  // --- QR label ------------------------------------------------------------
  const html = Q.labelHtml({ id: "ENC-1", name: "DEL<NB>", serialNumber: "S/N 1", make: "Dell", model: "5420" }, "<svg></svg>");
  ok("label has QR, host, ID, serial, make/model, escaped", html.includes("<svg></svg>") && html.includes("DEL&lt;NB&gt;") && html.includes("Asset ID: ENC-1") && html.includes("S/N: S/N 1") && html.includes("Dell 5420") && html.includes("scan to view"));
  ok("label QR printed at 5 cm", html.includes("width:50mm;height:50mm"));
  ok("QR file name is safe", Q.qrFileName({ name: "DEL EATS/NB 005", id: "x" }) === "DEL-EATS-NB-005-QR.png");

  // --- report status overview ----------------------------------------------
  const ov = P.statusOverview([
    { id: "1", name: "n1", status: "available", approvalRequest: { action: "edit_access", status: "pending", requesterName: "Tech", requestedAt: "2026-10-18T00:00:00Z", reason: "fix" } },
    { id: "2", name: "n2", status: "new", approvalRequest: { action: "reassign", status: "pending", requesterName: "Tech", requestedAt: "2026-10-17T00:00:00Z", pendingChanges: { assignee: "Priya" } } },
    { id: "3", name: "n3", status: "in_use", assignmentHistory: [{ id: "h", assignee: "Neha", assigneeEmail: "neha@encalm.com", assignedAt: "2026-10-14T10:00:00Z" }] },
    { id: "4", name: "n4", status: "in_use", assignmentHistory: [{ id: "h", assignee: "Raj", assigneeEmail: "raj@encalm.com", assignedAt: "2026-10-01", confirmedAt: "2026-10-02" }] },
    { id: "5", name: "n5", status: "in_use", assignmentHistory: [{ id: "h", assignee: "Old", assigneeEmail: "old@encalm.com", assignedAt: "2026-01-01", imported: true }] },
  ], now);
  ok("pending approvals: oldest first, with kind/detail", JSON.stringify(ov.pending.map((p) => [p.assetId, p.kind, p.detail])) === '[["2","Hand-over","to Priya"],["1","Edit","fix"]]', JSON.stringify(ov.pending));
  ok("awaiting confirmation: unconfirmed, not imported, days waiting", ov.awaiting.length === 1 && ov.awaiting[0].assetId === "3" && ov.awaiting[0].days === 5, JSON.stringify(ov.awaiting));
  ok("edit events have labels", P.EVENT_LABELS.edit_requested && P.EVENT_LABELS.edit_approved && P.EVENT_LABELS.edit_rejected);

  // --- setup script ----------------------------------------------------------
  const ps = fs.readFileSync(path.join(repo, "scripts/setup-entra.ps1"), "utf8");
  ok("setup script: Approver role, group and SharePoint AllSites.Manage", ps.includes('Value = "Asset.Approver"') && ps.includes('"IT-Asset Approver"') && ps.includes('@($approverGroup, "Asset.Approver")') && ps.includes('$SharePointScopes = @("AllSites.Manage")'));
  process.exit(fail ? 1 : 0);
})();
