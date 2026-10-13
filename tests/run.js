/**
 * Runs every tests/*.test.js in its own Node process and fails if any test
 * prints FAIL or exits non-zero. Usage: npm test
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const files = fs.readdirSync(__dirname).filter((f) => f.endsWith(".test.js")).sort();
let failedSuites = 0;
let passed = 0;
for (const file of files) {
  const res = spawnSync(process.execPath, [path.join(__dirname, file)], {
    encoding: "utf8",
    // Report dates are filtered by local day; pin the office time zone.
    env: { ...process.env, TZ: "Asia/Kolkata" },
    timeout: 120000,
  });
  const out = `${res.stdout || ""}${res.stderr || ""}`;
  const fails = out.split("\n").filter((l) => l.startsWith("FAIL"));
  passed += out.split("\n").filter((l) => l.startsWith("PASS")).length;
  if (res.status !== 0 || fails.length) {
    failedSuites++;
    console.log(`✗ ${file}`);
    console.log((fails.length ? fails.join("\n") : out.trim().split("\n").slice(-15).join("\n")).replace(/^/gm, "    "));
  } else {
    console.log(`✓ ${file}`);
  }
}
console.log(`\n${passed} checks passed, ${failedSuites} suite(s) failed of ${files.length}.`);
process.exit(failedSuites ? 1 : 0);
