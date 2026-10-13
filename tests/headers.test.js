// The IIS web.config must send the same security headers as the Node server.
const path = require("path"), fs = require("fs");
const { SECURITY_HEADERS } = require("../server/security-headers.js");
let fail = 0; const ok = (n, c, x = "") => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"} ${n} ${x}`); };
const xml = fs.readFileSync(path.join(__dirname, "../server/web.config"), "utf8");
const unesc = (v) => v.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&amp;/g, "&");
const block = xml.slice(xml.indexOf("<httpProtocol>"), xml.indexOf("</httpProtocol>"));
const fromConfig = Object.fromEntries([...block.matchAll(/<add name="([^"]+)" value="([^"]*)" \/>/g)].map((m) => [m[1], unesc(m[2])]));
for (const [k, v] of Object.entries(SECURITY_HEADERS)) ok(`web.config sends ${k}`, fromConfig[k] === v, fromConfig[k] ? "(value differs)" : "(missing)");
ok("no wildcard CORS on the static site", !("Access-Control-Allow-Origin" in fromConfig));
ok("CSP blocks framing and plugins", /frame-ancestors 'none'/.test(SECURITY_HEADERS["Content-Security-Policy"]) && /object-src 'none'/.test(SECURITY_HEADERS["Content-Security-Policy"]));
ok("CSP has no unsafe-eval / unsafe-inline scripts", !/script-src[^;]*'unsafe-(eval|inline)'/.test(SECURITY_HEADERS["Content-Security-Policy"]));
console.log(fail ? `${fail} FAILED` : "ALL PASS"); process.exit(fail ? 1 : 0);
