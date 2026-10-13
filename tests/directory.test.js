const path = require("path"), fs = require("fs");
const repo = path.join(__dirname, "..");
const ts = require(path.join(repo, "node_modules/typescript"));
let fail = 0; const ok = (n, c, x = "") => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"} ${n} ${x}`); };
const out = ts.transpileModule(fs.readFileSync(path.join(repo, "lib/directory.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const m = { exports: {} }; new Function("module", "exports", "require", out)(m, m.exports, require);
const d = m.exports;
let calls = [], reply = { status: 200, body: { value: [] } };
global.fetch = async (url, opts) => { calls.push({ url, opts }); return { ok: reply.status < 300, status: reply.status, json: async () => reply.body }; };
(async () => {
  ok("empty query: no request", (await d.searchDirectoryUsers("t", "")).length === 0 && calls.length === 0);
  ok("1 char: no request", (await d.searchDirectoryUsers("t", " r ")).length === 0 && calls.length === 0);
  reply = { status: 200, body: { value: [
    { id: "1", displayName: "Rahul Sharma", mail: "rahul@encalm.com", jobTitle: "Duty Manager", department: "Lounge" },
    { id: "2", displayName: "Priya Nair", mail: null, userPrincipalName: "priya@encalmhospitality.com" },
    { id: "3", displayName: "Room 12 Printer", mail: null, userPrincipalName: null },
  ] } };
  const res = await d.searchDirectoryUsers("tok", 'Ra"h\\ul');
  const u = new URL(calls[0].url);
  ok("Graph /users endpoint", u.origin + u.pathname === "https://graph.microsoft.com/v1.0/users");
  ok("$search on name OR email, quotes escaped", u.searchParams.get("$search") === '"displayName:Ra\\"h\\\\ul" OR "mail:Ra\\"h\\\\ul"', u.searchParams.get("$search"));
  ok("$select minimal fields", u.searchParams.get("$select") === "id,displayName,mail,userPrincipalName,jobTitle,department");
  ok("$top=8", u.searchParams.get("$top") === "8");
  ok("ConsistencyLevel eventual + bearer", calls[0].opts.headers.ConsistencyLevel === "eventual" && calls[0].opts.headers.Authorization === "Bearer tok");
  ok("maps mail, falls back to UPN, drops no-email", res.length === 2 && res[0].email === "rahul@encalm.com" && res[0].jobTitle === "Duty Manager" && res[1].email === "priya@encalmhospitality.com", JSON.stringify(res.map((r) => r.email)));
  reply = { status: 403, body: {} };
  let err; try { await d.searchDirectoryUsers("tok", "rahul"); } catch (e) { err = e; }
  ok("403 throws with statusCode", err && err.statusCode === 403);
  const M = d.pickerModeFor;
  ok("signed in + online -> directory", M({ hasToken: true, online: true }) === "directory");
  ok("demo -> manual", M({ isDemo: true, hasToken: true, online: true }) === "manual");
  ok("no token -> manual", M({ hasToken: false, online: true }) === "manual");
  ok("offline -> manual", M({ hasToken: true, online: false }) === "manual");
  ok("403 (no consent) -> manual", M({ hasToken: true, online: true, lastErrorStatus: 403 }) === "manual");
  ok("401 -> manual", M({ hasToken: true, online: true, lastErrorStatus: 401 }) === "manual");
  ok("network error -> manual", M({ hasToken: true, online: true, lastErrorWasNetwork: true }) === "manual");
  ok("500 blip stays directory", M({ hasToken: true, online: true, lastErrorStatus: 500 }) === "directory");
  process.exit(fail ? 1 : 0);
})();
