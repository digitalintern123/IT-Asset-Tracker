// Back buttons: every web stack screen uses the app's own (SVG) back button,
// and the IIS build serves no file from an assets/node_modules/ path.
const path = require("path"), fs = require("fs");
const repo = path.join(__dirname, "..");
let fail = 0; const ok = (n, c, x = "") => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"} ${n} ${x}`); };
const read = (rel) => fs.readFileSync(path.join(repo, rel), "utf8");
const layout = read("app/_layout.tsx");
ok("root stack: HeaderBackButton is the default headerLeft on web", /Platform\.OS === "web" \? \{ headerLeft: \(\) => <HeaderBackButton \/> \}/.test(layout));
const screens = ["app/reports.tsx", "app/import.tsx", "app/confirm.tsx", "app/approve.tsx", "app/asset/[id].tsx"];
ok("no screen falls back to the stack's image arrow", screens.every((f) => !/headerLeft: router\.canGoBack\(\) \? undefined/.test(read(f))), screens.filter((f) => /headerLeft: router\.canGoBack\(\) \? undefined/.test(read(f))).join(", "));
const allApp = (dir) => fs.readdirSync(path.join(repo, dir), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? allApp(path.join(dir, e.name)) : [path.join(dir, e.name)]);
const undefinedLeft = allApp("app").filter((f) => /headerLeft:\s*undefined/.test(read(f)));
ok("no screen sets headerLeft to undefined", undefinedLeft.length === 0, undefinedLeft.join(", "));
const btn = read("components/HeaderBackButton.tsx");
ok("back button: 'Back' with history, 'Assets' without", btn.includes('router.canGoBack() ? "Back" : "Assets"') && btn.includes("ChevronLeft"));
const build = read("scripts/build-iis.js");
ok("IIS build moves assets/node_modules to assets/vendor and fails on leftovers", build.includes('const VENDOR = "assets/vendor/"') && build.includes("fail(`file still under node_modules") && build.includes("fail(`unrewritten"));
console.log(fail ? `${fail} FAILED` : "ALL PASS"); process.exit(fail ? 1 : 0);
