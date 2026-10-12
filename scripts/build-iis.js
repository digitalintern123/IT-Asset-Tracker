/**
 * Prepares web-build/ for the IIS site (run after `expo export`):
 * favicons, icon fonts + font-path patch, and web.config. The result is the
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

// IIS: SPA fallback rewrite + MIME types.
fs.copyFileSync(path.join(root, "server/web.config"), path.join(out, "web.config"));

console.log("web-build/ is ready for IIS.");
