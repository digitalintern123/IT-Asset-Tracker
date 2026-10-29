// Android build: no crash on the missing page origin; EAS profile makes an APK.
const path = require("path"), fs = require("fs");
const repo = path.join(__dirname, "..");
const ts = require(path.join(repo, "node_modules/typescript"));
let fail = 0; const ok = (n, c, x = "") => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"} ${n} ${x}`); };
const load = (rel) => {
  const out = ts.transpileModule(fs.readFileSync(path.join(repo, rel), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = { exports: {} }; new Function("module", "exports", "require", out)(m, m.exports, require); return m.exports;
};
// React Native: `window` exists but has no `location`.
global.window = {};
const C = load("lib/msConfig.ts");
ok("native without EXPO_PUBLIC_API_URL: no crash, empty origin", C.backendOrigin() === "");
process.env.EXPO_PUBLIC_API_URL = "https://encalm-tracker.onrender.com/";
ok("native with EXPO_PUBLIC_API_URL: uses it (no trailing slash)", C.backendOrigin() === "https://encalm-tracker.onrender.com");
global.window = { location: { origin: "https://tracker.encalmhospitality.com" } };
ok("web: the site's own origin", C.backendOrigin() === "https://tracker.encalmhospitality.com");
const unsafe = ["lib/api.ts", "lib/msalAuth.ts"].filter((f) => /typeof window !== "undefined" \? window\.location\.origin/.test(fs.readFileSync(path.join(repo, f), "utf8")));
ok("no unguarded window.location.origin in api/msal", unsafe.length === 0, unsafe.join(", "));
const eas = JSON.parse(fs.readFileSync(path.join(repo, "eas.json"), "utf8"));
ok("eas.json: preview builds an APK, production an app bundle", eas.build.preview.android.buildType === "apk" && eas.build.production.android.buildType === "app-bundle");
const app = JSON.parse(fs.readFileSync(path.join(repo, "app.json"), "utf8")).expo;
ok("app.json: Android package + scheme for the Microsoft redirect", app.android.package === "com.encalm.assettracker" && app.scheme === "asset-tracker");
ok("native redirect URI matches the docs", fs.readFileSync(path.join(repo, "lib/msalAuth.ts"), "utf8").includes('path: "auth/callback"') && fs.readFileSync(path.join(repo, "docs/DEPLOY.md"), "utf8").includes("asset-tracker://auth/callback"));
const gi = fs.readFileSync(path.join(repo, ".gitignore"), "utf8");
ok(".env files are ignored", /^\.env$/m.test(gi));
console.log(fail ? `${fail} FAILED` : "ALL PASS"); process.exit(fail ? 1 : 0);
