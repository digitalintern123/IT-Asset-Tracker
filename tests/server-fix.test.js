const path = require("path"), fs = require("fs"), Module = require("module"), https = require("https"), http = require("http");
const { EventEmitter } = require("events");
const repo = path.join(__dirname, "..");
let fail = 0; const ok = (n, c, x = "") => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"} ${n} ${x}`); };
const realRequest = https.request;
const paths = [];
// Fake Graph that validates paths like Node does and splits UTF-8 mid-character.
https.request = (opts, cb) => {
  if (/\s/.test(opts.path)) { const e = new TypeError("Request path contains unescaped characters"); e.code = "ERR_UNESCAPED_CHARACTERS"; throw e; }
  paths.push(opts.path);
  const req = new EventEmitter(); req.write = () => {}; req.end = () => {
    let data = {};
    if (!opts.path.includes("/lists")) data = { id: "site1" };
    else if (opts.path.includes("/lists?")) data = { value: [{ id: "list1" }] };
    else if (opts.path.includes("/items")) data = { value: [{ id: "7", eTag: "e", fields: { Title: "DEL-NB1", Location: "DEL — T3", PurchasePrice: 0, Notes: "₹ price" } }] };
    const buf = Buffer.from(JSON.stringify(data), "utf8");
    const res = new EventEmitter(); res.statusCode = 200; res.headers = {}; cb(res);
    // emit one byte at a time so every multi-byte char is split
    for (let i = 0; i < buf.length; i++) res.emit("data", buf.subarray(i, i + 1));
    res.emit("end");
  }; return req; };
const file = path.join(repo, "server/sharepoint-api.js");
const mod = new Module(file); mod.paths = Module._nodeModulePaths(path.dirname(file));
mod._compile(fs.readFileSync(file, "utf8"), file);
const S = mod.exports;
(async () => {
  let assets, err;
  try { assets = await S.fetchAllAssets("tok"); } catch (e) { err = e; }
  ok("list lookup works (filter path encoded)", !err && Array.isArray(assets), err && err.message);
  ok("filter path has no raw spaces", paths.some((p) => p.includes("/lists?$filter=displayName%20eq%20'IT%20Asset%20Register'")), paths.find((p) => p.includes("filter")));
  ok("multi-byte chars survive chunk splits", assets && assets[0].location === "DEL — T3" && /₹/.test(JSON.stringify(assets[0])), assets && assets[0].location);
  // serve-web: body parser + error scrubbing + guest admin email
  const src = fs.readFileSync(path.join(repo, "server/serve-web.js"), "utf8");
  ok("server body decoded once (Buffer.concat)", /Buffer\.concat\(chunks\)\.toString\("utf8"\)/.test(src));
  ok("500 errors scrubbed", src.includes("SharePoint request failed. Please try again or contact IT."));
  ok("guest accounts skip ADMIN_EMAILS", src.includes("const isGuest = !!payload.idp"));
  console.log(fail ? `${fail} FAILED` : "ALL PASS"); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
