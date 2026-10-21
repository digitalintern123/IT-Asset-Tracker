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
const R = loadTs("lib/roles.ts"), S = loadTs("lib/setupCheck.ts");
const r = (roles, email = "someone@encalm.com") => R.resolveUserRole(email, roles);
ok("Asset.Admin -> admin", r(["Asset.Admin"]) === "admin");
ok("Admin (short, any case) -> admin", r(["ADMIN"]) === "admin");
ok("Asset.Technician -> technician", r(["Asset.Technician"]) === "technician");
ok("Technician -> technician", r(["technician"]) === "technician");
ok("Asset.Viewer -> viewer", r(["Asset.Viewer"]) === "viewer");
ok("no roles -> viewer", r([]) === "viewer" && r(undefined) === "viewer");
ok("substring no longer grants: NotAdmin", r(["NotAdmin"]) === "viewer");
ok("substring no longer grants: StaffReadOnly / SystemAdministrator", r(["StaffReadOnly"]) === "viewer" && r(["SystemAdministrator"]) === "viewer");
ok("highest wins regardless of order", r(["Asset.Viewer", "Asset.Technician", "Asset.Admin"]) === "admin" && r(["Asset.Technician", "Asset.Viewer"]) === "technician");
ok("ADMIN_EMAILS fallback -> admin", r([], "EncalmIT@encalm.com") === "admin");
// Demo Mode is gone: no sign-in path, sample data or role switcher left.
const repoSrc = (rel) => fs.readFileSync(path.join(repo, rel), "utf8");
ok("no demo sign-in or role switcher", !/signInDemo|setDemoRole|Explore in Demo Mode|DEMO ROLE SWITCHER/.test(repoSrc("contexts/AuthContext.tsx") + repoSrc("app/login.tsx") + repoSrc("app/(tabs)/settings.tsx")));
ok("no demo sample assets", !/DEMO_SAMPLE_ASSETS/.test(repoSrc("contexts/AssetContext.tsx")));
ok("old demo session is signed out on load", /if \(profile\.isDemo\) \{\s*\/\/ Demo Mode was removed[^\n]*\n\s*await AsyncStorage\.removeItem\(PROFILE_STORAGE_KEY\)/.test(repoSrc("contexts/AuthContext.tsx")));
ok("old asset cache (may hold demo devices) is dropped", repoSrc("contexts/AssetContext.tsx").includes('AsyncStorage.removeItem("@encalm/asset_cache_v3")'));
ok("roleSource: app role", R.roleSource("x@encalm.com", ["Asset.Technician"]) === "Entra app role Asset.Technician");
ok("roleSource: admin email", R.roleSource("encalmit@encalm.com", []).startsWith("Admin email list"));
ok("roleSource: default", R.roleSource("x@encalm.com", []).startsWith("Default"));
// server parity
const file = path.join(repo, "server/serve-web.js");
const src = fs.readFileSync(file, "utf8");
const fnSrc = src.slice(src.indexOf("const ROLE_CLAIMS"), src.indexOf("\n}\n", src.indexOf("function roleForClaims")) + 3);
const ADMIN = ["encalmit@encalm.com"];
const roleForClaims = new Function("ADMIN_EMAILS", fnSrc + "\nreturn roleForClaims;")(ADMIN);
const cases = [[["Asset.Admin"], "a@x"], [["admin"], "a@x"], [["NotAdmin"], "a@x"], [["StaffReadOnly"], "a@x"], [["Asset.Technician", "Asset.Viewer"], "a@x"], [[], "encalmit@encalm.com"], [[], "a@x"], [null, "a@x"], [["Viewer", "Technician"], "a@x"]];
ok("server mapping matches client for all cases", cases.every(([roles, email]) => roleForClaims(roles, email) === R.resolveUserRole(email, roles || [])), JSON.stringify(cases.map(([ro, e]) => [roleForClaims(ro, e), R.resolveUserRole(e, ro || [])])));
ok("server: no substring matching left", !/includes\("admin"\)|includes\("staff"\)/.test(src));
ok("client ROLE_CLAIMS identical to server", JSON.stringify(R.ROLE_CLAIMS) === JSON.stringify(new Function(fnSrc.slice(0, fnSrc.indexOf("const ROLE_RANK")) + "return ROLE_CLAIMS;")()));
// scopes
const jwt = (payload) => "h." + Buffer.from(JSON.stringify(payload)).toString("base64url") + ".s";
global.atob = (b) => Buffer.from(b, "base64").toString("binary");
const ALL = "Sites.ReadWrite.All User.ReadBasic.All Mail.Send Mail.Send.Shared User.Read openid";
ok("all scopes present -> ok", S.scopeItems(jwt({ scp: ALL })).every((i) => i.ok));
const noShared = S.scopeItems(jwt({ scp: "Sites.ReadWrite.All User.ReadBasic.All Mail.Send" }));
ok("missing Mail.Send.Shared flagged with fix", noShared.some((i) => !i.ok && i.label.includes("Mail.Send.Shared") && i.detail.includes("admin consent")));
ok("Sites.Selected counts for SharePoint", S.scopeItems(jwt({ scp: "Sites.Selected User.ReadBasic.All Mail.Send Mail.Send.Shared" })).every((i) => i.ok));
ok("opaque token -> unknown, not failed", S.scopeItems("opaque").every((i) => i.unknown && i.ok));
// checkSetup with mocked Graph
const CORE = [...S.CORE_COLUMNS, "Vertical", "Make", "Model", "Department", "Custodianship", "Criticality", "OperationalStatus", "AssetClass", "Accessories"];
function mockGraph({ cols = CORE, confExists = true, confCols = S.CONFIRMATION_COLUMNS } = {}) {
  global.fetch = async (url) => {
    const u = decodeURIComponent(url); const j = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
    if (/\/sites\/[^/]+$/.test(new URL(url).pathname) || u.includes("sharepoint.com:")) return j(200, { id: "site1" });
    if (u.includes("/lists?$filter")) return u.includes("Asset Confirmations") ? j(200, { value: confExists ? [{ id: "conf" }] : [] }) : j(200, { value: [{ id: "reg" }] });
    if (u.endsWith("/lists")) return j(200, { value: [{ id: "reg", displayName: "IT Asset Register" }].concat(confExists ? [{ id: "conf", displayName: "Asset Confirmations" }] : []) });
    if (u.includes("/lists/reg/columns")) return j(200, { value: cols.map((name) => ({ name })) });
    if (u.includes("/lists/conf/columns")) return j(200, { value: confCols.map((name) => ({ name })) });
    if (u.includes("/lists/reg/items")) return j(200, { value: [] });
    return j(404, {});
  };
}
(async () => {
  const token = jwt({ scp: ALL });
  // (list ids are cached per session, so the "missing list" case runs first)
  mockGraph({ confExists: false });
  let rep = await S.checkSetup(token);
  ok("no Confirmations list -> ✗ with fix", rep.items.some((i) => !i.ok && i.label.includes("Asset Confirmations") && i.fixable && /create it/i.test(i.detail)));
  mockGraph();
  rep = await S.checkSetup(token);
  ok("all good -> ok, every item ✓", rep.ok && rep.items.every((i) => i.ok && !i.unknown), JSON.stringify(rep.items.filter((i) => !i.ok)));
  mockGraph({ cols: CORE.filter((c) => c !== "Department" && c !== "Accessories") });
  rep = await S.checkSetup(token);
  const colItem = rep.items.find((i) => i.label === "Asset register columns");
  ok("missing columns named", !rep.ok && !colItem.ok && colItem.detail.includes("Department, Accessories"), colItem.detail);
  mockGraph({ confCols: ["CustodyId"] });
  rep = await S.checkSetup(token);
  ok("confirmations columns missing -> named", rep.items.some((i) => !i.ok && i.detail === "Missing: AssetName, ConfirmedAt."));
  console.log(fail ? `${fail} FAILED` : "ALL PASS"); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
