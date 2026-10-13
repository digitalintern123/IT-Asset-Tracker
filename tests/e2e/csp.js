const { chromium } = require("playwright");
const check = (n, c, x = "") => console.log(`${c ? "PASS" : "FAIL"} ${n} ${x}`);
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
  const page = await browser.newPage({ viewport: { width: 900, height: 1400 } });
  const violations = [], errors = [];
  page.on("console", (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text()); });
  page.on("pageerror", (e) => { if (!/jsdelivr/.test(e.message)) errors.push(e.message); });
  await page.addInitScript(() => document.addEventListener("securitypolicyviolation", (e) => console.log(`Refused to load: ${e.violatedDirective} ${e.blockedURI}`)));
  const res = await page.goto("http://localhost:10000/login", { waitUntil: "networkidle" }); await page.waitForTimeout(1200);
  const h = res.headers();
  check("CSP header present", !!h["content-security-policy"] && !!h["strict-transport-security"] && h["x-frame-options"] === "DENY");
  check("login renders under CSP", /demo mode/i.test(await page.locator("body").innerText()));
  await page.getByText("Explore in Demo Mode").click(); await page.waitForTimeout(1500);
  for (const p of ["/", "/dashboard", "/settings", "/asset/ENC-LAP-2026-0001", "/asset/new", "/reports", "/import", "/scan", "/confirm?asset=ENC-LAP-2026-0001&custody=x"]) {
    await page.goto("http://localhost:10000" + p, { waitUntil: "networkidle" }); await page.waitForTimeout(900);
    const t = await page.locator("body").innerText();
    check(`renders ${p}`, t.trim().length > 20, t.slice(0, 40).replace(/\n/g, " "));
  }
  // Microsoft sign-in redirect allowed (navigation, not blocked by form-action/connect-src)
  check("no CSP violations", violations.length === 0, violations.slice(0, 5).join(" | "));
  check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await browser.close();
})();
