/**
 * Prepares web-build/ for the IIS site (run after `expo export`):
 * favicons, icon fonts + font-path patch, library assets moved out of
 * assets/node_modules/, and web.config. The result is the
 * complete site to publish (see .github/workflows/deploy-iis.yml).
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const out = path.join(root, "web-build");
const fail = (msg) => {
  console.error(`build-iis: ${msg}`);
  process.exit(1);
};

if (!fs.existsSync(path.join(out, "index.html"))) fail("web-build/index.html is missing — run `npm run build` first.");

// Favicons and brand icons at the site root.
const copies = [
  ["favicon.ico", "favicon.ico"],
  ["assets/brand/encalm-favicon.png", "favicon.png"],
  ["assets/brand/favicon-32.png", "favicon-32.png"],
  ["assets/brand/apple-touch-icon.png", "apple-touch-icon.png"],
];
for (const [from, to] of copies) {
  const src = path.join(root, from);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(out, to));
}

// Icon fonts (only referenced if @expo/vector-icons is used again).
const fontsOut = path.join(out, "fonts");
fs.mkdirSync(fontsOut, { recursive: true });
for (const f of fs.readdirSync(path.join(root, "fonts")).filter((f) => f.endsWith(".ttf"))) {
  fs.copyFileSync(path.join(root, "fonts", f), path.join(fontsOut, f));
}

// Rewrite icon-font URLs to /fonts/, which IIS serves reliably.
const jsDir = path.join(out, "_expo/static/js/web");
const FONTS = {
  Feather: "fonts/Feather.ca4b48e04dc1ce10bfbddb262c8b835f.ttf",
  MaterialIcons: "fonts/MaterialIcons.4e85bc9ebe07e0340c9c4fc2f6c38908.ttf",
  Ionicons: "fonts/Ionicons.b4eb097d35f44ed943676fd56f6bdc51.ttf",
  FontAwesome: "fonts/FontAwesome.b06871f281fee6b241d60582ae9369b9.ttf",
};
let patched = 0;
if (fs.existsSync(jsDir)) {
  for (const file of fs.readdirSync(jsDir).filter((f) => f.endsWith(".js"))) {
    const p = path.join(jsDir, file);
    let c = fs.readFileSync(p, "utf8");
    const before = c;
    for (const [name, target] of Object.entries(FONTS)) {
      c = c.replace(new RegExp(`assets\\/[^"]*${name}\\.[^"]*\\.ttf`, "g"), target);
    }
    if (/"(?!fonts\/)[^"]*(Feather|MaterialIcons|Ionicons|FontAwesome)\.[0-9a-f]+\.ttf"/.test(c)) {
      fail(`unpatched icon font paths in ${file}`);
    }
    if (c !== before) {
      fs.writeFileSync(p, c);
      patched++;
    }
  }
}
console.log(patched ? `Patched font paths in ${patched} file(s).` : "No vector-icon font paths in bundle; nothing to patch.");

// IIS (Plesk with iisnode) refuses any URL containing "node_modules", and
// Expo emits library assets under assets/node_modules/: the header back
// arrow, the Inter font files and other icons would then fail to load.
// Move them to assets/vendor/ and rewrite every reference.
const NM = "assets/node_modules/";
const VENDOR = "assets/vendor/";
const nmDir = path.join(out, "assets", "node_modules");
if (fs.existsSync(nmDir)) {
  fs.cpSync(nmDir, path.join(out, "assets", "vendor"), { recursive: true });
  fs.rmSync(nmDir, { recursive: true, force: true });
}
const allFiles = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? allFiles(path.join(dir, e.name)) : [path.join(dir, e.name)],
  );
let moved = 0;
for (const file of allFiles(out).filter((f) => /\.(js|html|css|json|map)$/.test(f))) {
  const c = fs.readFileSync(file, "utf8");
  if (!c.includes(NM)) continue;
  fs.writeFileSync(file, c.split(NM).join(VENDOR));
  moved++;
}
for (const file of allFiles(out)) {
  if (path.relative(out, file).split(path.sep).includes("node_modules")) fail(`file still under node_modules: ${path.relative(out, file)}`);
}
for (const file of allFiles(out).filter((f) => /\.(js|html|css)$/.test(f))) {
  if (fs.readFileSync(file, "utf8").includes(NM)) fail(`unrewritten ${NM} reference in ${path.relative(out, file)}`);
}
console.log(`Moved library assets to ${VENDOR} (${moved} file(s) rewritten).`);

// Every inline script must be allowed by the Content-Security-Policy hash
// list, or browsers would block it and the app would not start.
const crypto = require("crypto");
const { INLINE_SCRIPT_HASHES } = require(path.join(root, "server/security-headers.js"));
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
  );
for (const page of walk(out).filter((f) => f.endsWith(".html"))) {
  const html = fs.readFileSync(page, "utf8");
  for (const m of html.matchAll(/<script(?: type="module")?>([\s\S]*?)<\/script>/g)) {
    const hash = `'sha256-${crypto.createHash("sha256").update(m[1]).digest("base64")}'`;
    if (!INLINE_SCRIPT_HASHES.includes(hash)) {
      fail(`${path.relative(out, page)} has an inline script not allowed by the CSP: add ${hash} to server/security-headers.js`);
    }
  }
}

// IIS: SPA fallback rewrite, MIME types and security headers.
fs.copyFileSync(path.join(root, "server/web.config"), path.join(out, "web.config"));

console.log("web-build/ is ready for IIS.");
