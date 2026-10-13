// Stubs https.request so the JWKS fetch returns our test key.
const crypto = require("crypto");
const https = require("https");
const { EventEmitter } = require("events");
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1" };
let jwksCalls = 0;
https.request = (opts, cb) => {
  jwksCalls++;
  const res = new EventEmitter(); res.statusCode = 200; res.headers = {};
  const req = new EventEmitter(); req.write = () => {}; req.end = () => { cb(res); res.emit("data", JSON.stringify({ keys: [jwk] })); res.emit("end"); };
  return req;
};
const api = require(require("path").join(__dirname, "../server/sharepoint-api.js"));
const TENANT = "cee20abc-e97b-434e-a89b-e8c8ca3d3d75", AUD = "96823f1a-bdb9-49c5-8461-d181438c74e3";
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const good = { iss: `https://login.microsoftonline.com/${TENANT}/v2.0`, aud: AUD, exp: now + 3600, nbf: now - 10, email: "a@b.c", roles: ["Technician"] };
function sign(payload, header = { alg: "RS256", kid: "k1" }, key = privateKey) {
  const h = b64u(header), p = b64u(payload);
  return `${h}.${p}.${crypto.sign("RSA-SHA256", Buffer.from(`${h}.${p}`), key).toString("base64url")}`;
}
const other = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
const t = sign(good);
const [h, , s] = t.split(".");
const cases = {
  valid: [t, true],
  tamperedPayload: [`${h}.${b64u({ ...good, roles: ["Admin"] })}.${s}`, false],
  wrongKey: [sign(good, undefined, other), false],
  wrongAud: [sign({ ...good, aud: "00000003-0000-0000-c000-000000000000" }), false],
  wrongIss: [sign({ ...good, iss: "https://evil/v2.0" }), false],
  expired: [sign({ ...good, exp: now - 400 }), false],
  notYetValid: [sign({ ...good, nbf: now + 400 }), false],
  algNone: [`${b64u({ alg: "none", kid: "k1" })}.${b64u(good)}.`, false],
  unknownKid: [sign(good, { alg: "RS256", kid: "nope" }), false],
  missing: [undefined, false],
  garbage: ["a.b", false],
};
(async () => {
  let fail = 0;
  for (const [name, [tok, expectOk]] of Object.entries(cases)) {
    let ok, msg = "";
    try { await api.verifyIdToken(tok); ok = true; } catch (e) { ok = false; msg = e.message; }
    const pass = ok === expectOk; if (!pass) fail++;
    console.log(`${pass ? "PASS" : "FAIL"} ${name}${msg ? " (" + msg + ")" : ""}`);
  }
  console.log(`jwks fetches: ${jwksCalls} (unknown kid refetch is throttled)`);
  process.exit(fail ? 1 : 0);
})();
