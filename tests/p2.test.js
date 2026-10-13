const path = require("path"), fs = require("fs"), vm = require("vm"), Module = require("module");
const repo = path.join(__dirname, "..");
const ts = require(path.join(repo, "node_modules/typescript"));
let fail = 0; const ok = (name, cond, extra = "") => { if (!cond) fail++; console.log(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`); };

// ---- conflictResolver (transpile TS)
const src = ts.transpileModule(fs.readFileSync(path.join(repo, "lib/conflictResolver.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const m = { exports: {} }; new Function("module", "exports", "require", src)(m, m.exports, require);
const { resolveAssetConflict } = m.exports;
const base = { name: "Mac", location: "T1", notes: "", status: "available", etag: "e1" };
const local = { ...base, location: "T3" };                  // user edited location
const server = { ...base, notes: "serviced", etag: "e2" };  // someone else edited notes
let r = resolveAssetConflict(local, server, base);
ok("3-way: local edit kept", r.mergedAsset.location === "T3");
ok("3-way: server edit kept", r.mergedAsset.notes === "serviced");
ok("3-way: no false conflict", !r.hasConflict);
ok("3-way: takes server etag", r.mergedAsset.etag === "e2");
r = resolveAssetConflict(local, { ...base, location: "T2", etag: "e2" }, base);
ok("3-way: true conflict flagged + local kept", r.hasConflict && r.conflictingFields.includes("location") && r.mergedAsset.location === "T3");
r = resolveAssetConflict(local, server);
ok("no-base: local edit kept (was discarded before)", r.mergedAsset.location === "T3", JSON.stringify(r.conflictingFields));
// AssetContext fallback when server returns no record: server = existing (base)
r = resolveAssetConflict(local, base, base);
ok("no server record: local edit kept, no conflict", r.mergedAsset.location === "T3" && !r.hasConflict);

// ---- server: load sharepoint-api.js with stubbed https to reach private fns + 412 path
const https = require("https"); const { EventEmitter } = require("events");
const calls = [];
https.request = (opts, cb) => {
  const req = new EventEmitter(); let body = "";
  req.write = (d) => (body += d);
  req.end = () => {
    calls.push({ method: opts.method, path: opts.path, body, ifMatch: opts.headers && opts.headers["If-Match"] });
    let status = 200, data = {};
    if (opts.path.startsWith("/v1.0/sites/") && !opts.path.includes("/lists")) data = { id: "site1" };
    else if (opts.path.includes("/lists?")) data = { value: [{ id: "list1" }] };
    else if (opts.method === "PATCH") { status = 412; data = { error: "etag" }; }
    else if (opts.method === "GET" && opts.path.includes("/items/7")) data = { id: "7", eTag: "\"e9\"", fields: { Title: "Server Mac", Category: "Kiosk Tablet Stand", Status: "Available", AssetId: "ENC-X" } };
    const res = new EventEmitter(); res.statusCode = status; res.headers = {};
    cb(res); res.emit("data", JSON.stringify(data)); res.emit("end");
  };
  return req;
};
const file = path.join(repo, "server/sharepoint-api.js");
const code = fs.readFileSync(file, "utf8") + "\nmodule.exports.__t = { mapCategory, assetInputToSpFields };";
const mod = new Module(file); mod.filename = file; mod.paths = Module._nodeModulePaths(path.dirname(file)); mod._compile(code, file);
const api = mod.exports; const { mapCategory, assetInputToSpFields } = api.__t;
ok("mapCategory custom preserved", mapCategory("Kiosk Stand") === "Kiosk Stand");
ok("mapCategory standard still mapped", mapCategory("macbook air") === "Laptop");
ok("mapCategory empty -> Other", mapCategory("") === "Other");
let f = assetInputToSpFields({ name: "A", category: "Laptop", status: "available", purchaseDate: "", warrantyExpiry: null });
ok("empty dates sent as null", f.PurchaseDate === null && f.WarrantyExpiry === null);
f = assetInputToSpFields({ name: "A", category: "Laptop", status: "available", purchaseDate: "2024-01-01", warrantyExpiry: "2027-01-01" });
ok("real dates sent", f.PurchaseDate === "2024-01-01" && f.WarrantyExpiry === "2027-01-01");
(async () => {
  try { await api.updateAsset("user-token", "7", { name: "Mine", category: "Laptop", status: "available" }, "\"e1\""); ok("412 throws", false); }
  catch (e) {
    ok("412 statusCode", e.statusCode === 412);
    ok("412 carries current server record", e.serverAsset && e.serverAsset.name === "Server Mac", e.serverAsset && e.serverAsset.category);
    ok("If-Match sent", calls.some((c) => c.method === "PATCH" && c.ifMatch === "\"e1\""));
  }
  process.exit(fail ? 1 : 0);
})();
