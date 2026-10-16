// /api fallback: IIS (no backend) answers /api/assets with an HTML 404/405/406;
// the app must then read SharePoint directly. A JSON refusal from the real
// backend (Render) must NOT be retried against Graph.
const path = require("path"), fs = require("fs");
const repo = path.join(__dirname, "..");
const ts = require(path.join(repo, "node_modules/typescript"));
let fail = 0; const ok = (n, c, x = "") => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"} ${n} ${x}`); };
global.window = { location: { origin: "https://tracker.example" } };
const cache = {};
function loadTs(rel) {
  const full = path.join(repo, rel); if (cache[full]) return cache[full];
  const out = ts.transpileModule(fs.readFileSync(full, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = { exports: {} }; cache[full] = m.exports;
  const req = (id) => id === "react-native" ? { Platform: { OS: "ios" }, Linking: { openURL: async () => {} } }
    : id === "./secureStorage" || id === "@/lib/secureStorage" ? { getSecureTokens: async () => null }
    : id.startsWith("@/") ? loadTs(id.slice(2) + ".ts") : id.startsWith("./") ? loadTs(path.join(path.dirname(rel), id) + ".ts") : require(id);
  new Function("module", "exports", "require", out)(m, m.exports, req); return m.exports;
}
const api = loadTs("lib/api.ts");
const res = (status, body, type) => ({ ok: status < 300, status, statusText: "", headers: { get: (h) => (h.toLowerCase() === "content-type" ? type : null) }, json: async () => (typeof body === "string" ? JSON.parse(body) : body), text: async () => (typeof body === "string" ? body : JSON.stringify(body)) });
function mock(apiReply) {
  const calls = [];
  global.fetch = async (url) => {
    const u = decodeURIComponent(String(url)); calls.push(u);
    if (u.includes("/api/assets")) return apiReply();
    if (u.includes("sharepoint.com") && !u.includes("/lists")) return res(200, { id: "site1" }, "application/json");
    if (u.includes("/lists?$filter")) return res(200, { value: [{ id: "reg" }] }, "application/json");
    if (u.includes("/lists/reg/items")) return res(200, { value: [{ id: "1", fields: { Title: "H1", AssetId: "ENC-1" } }] }, "application/json");
    return res(404, {}, "application/json");
  };
  return calls;
}
(async () => {
  for (const [status, name] of [[406, "406"], [404, "404"], [405, "405"]]) {
    const calls = mock(() => res(status, "<html>IIS</html>", "text/html"));
    let out, err; try { out = await api.apiFetchAll("tok"); } catch (e) { err = e; }
    ok(`IIS HTML ${name} -> reads SharePoint directly`, !err && out && out.length === 1 && out[0].id === "ENC-1" && calls.some((c) => c.includes("graph.microsoft.com")), err && err.message);
  }
  let calls = mock(() => res(403, { error: "Forbidden: Viewer role cannot create assets." }, "application/json; charset=utf-8"));
  let err; try { await api.apiFetchAll("tok"); } catch (e) { err = e; }
  ok("backend JSON 403 is a real refusal (no Graph retry)", err && err.statusCode === 403 && /Viewer role/.test(err.message) && !calls.some((c) => c.includes("graph.microsoft.com")));
  calls = mock(() => res(200, { data: [{ id: "ENC-9", name: "B" }] }, "application/json"));
  const viaBackend = await api.apiFetchAll("tok");
  ok("backend 200 used as is", viaBackend.length === 1 && viaBackend[0].id === "ENC-9" && !calls.some((c) => c.includes("graph.microsoft.com")));
  console.log(fail ? `${fail} FAILED` : "ALL PASS"); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
