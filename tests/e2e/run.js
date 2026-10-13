/**
 * Browser tests (Chromium via Playwright) against the built site.
 * Usage: npm run build:iis && npm run test:e2e
 * Starts server/serve-web.js on port 10000 (it sends the same security
 * headers as IIS), runs every *.js here except helpers, then stops it.
 * Set PW_CHROMIUM to use a preinstalled Chromium binary.
 */
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const root = path.join(__dirname, "../..");
const HELPERS = new Set(["run.js", "seed.js"]);
const suites = fs.readdirSync(__dirname).filter((f) => f.endsWith(".js") && !HELPERS.has(f)).sort();

if (!fs.existsSync(path.join(root, "web-build/index.html"))) {
  console.error("web-build/ is missing — run `npm run build:iis` first.");
  process.exit(1);
}
fs.mkdirSync(path.join(root, "test-results"), { recursive: true });

const server = spawn(process.execPath, ["server/serve-web.js"], {
  cwd: root,
  env: { ...process.env, PORT: "10000", STATIC_DIR: "web-build" },
  stdio: "ignore",
});

const waitForServer = async () => {
  for (let i = 0; i < 50; i++) {
    const up = await new Promise((resolve) =>
      http.get("http://localhost:10000/health", (res) => resolve(res.statusCode === 200)).on("error", () => resolve(false)),
    );
    if (up) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("server did not start");
};

(async () => {
  let failedSuites = 0;
  let passed = 0;
  try {
    await waitForServer();
    for (const file of suites) {
      const res = spawnSync(process.execPath, [path.join(__dirname, file)], {
        cwd: root,
        encoding: "utf8",
        timeout: 240000,
        env: { ...process.env, TZ: "Asia/Kolkata" },
      });
      const out = `${res.stdout || ""}${res.stderr || ""}`;
      const lines = out.split("\n");
      const fails = lines.filter((l) => l.startsWith("FAIL") || /^\s*(\w+)?Error:/.test(l));
      passed += lines.filter((l) => l.startsWith("PASS")).length;
      if (res.status !== 0 || fails.length) {
        failedSuites++;
        console.log(`✗ ${file}`);
        console.log((fails.length ? fails.join("\n") : lines.slice(-15).join("\n")).replace(/^/gm, "    "));
      } else {
        console.log(`✓ ${file}`);
      }
    }
  } finally {
    server.kill();
  }
  console.log(`\n${passed} browser checks passed, ${failedSuites} suite(s) failed of ${suites.length}.`);
  process.exit(failedSuites ? 1 : 0);
})().catch((err) => {
  server.kill();
  console.error(err);
  process.exit(1);
});
