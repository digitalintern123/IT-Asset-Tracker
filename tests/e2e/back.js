const { chromium } = require("playwright");
const { mockBackend, signIn } = require("./mock");
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  await mockBackend(ctx);
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  // IIS refuses URLs containing node_modules: the build must not request any.
  const nm = []; page.on("request", (r) => { if (r.url().includes("node_modules")) nm.push(r.url()); });
  const bad = []; page.on("response", (r) => { if (r.url().startsWith("http://localhost:10000/assets/") && r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
  const path = () => new URL(page.url()).pathname;
  const check = (name, cond) => console.log(`${cond ? "PASS" : "FAIL"} ${name} (now ${path()})`);
  await signIn(page, "admin");

  await page.goto("http://localhost:10000/asset/new", { waitUntil: "networkidle" }); await page.waitForTimeout(1200);
  await page.getByText("Cancel", { exact: true }).first().click(); await page.waitForTimeout(1200);
  check("New asset opened directly -> Cancel -> Assets", path() === "/");

  await page.locator('[role="button"],[tabindex="0"]').nth(1).click(); await page.waitForTimeout(1200);
  const opened = path() === "/asset/new";
  await page.getByText("Cancel", { exact: true }).first().click(); await page.waitForTimeout(1200);
  check("+ -> Cancel still returns to Assets", opened && path() === "/");

  await page.goto("http://localhost:10000/scan", { waitUntil: "networkidle" }); await page.waitForTimeout(1500);
  const cancels = await page.getByText("Cancel", { exact: true }).count();
  if (cancels) { await page.getByText("Cancel", { exact: true }).first().click(); await page.waitForTimeout(1200); }
  check(`Scan opened directly -> Cancel -> Assets (cancel buttons: ${cancels})`, cancels > 0 && path() === "/");

  await page.goto("http://localhost:10000/asset/ENC-LAP-2026-0001", { waitUntil: "networkidle" }); await page.waitForTimeout(1500);
  const backBtn = page.getByLabel("Back to Assets");
  check("Asset page after refresh shows a back button", (await backBtn.count()) === 1);
  await backBtn.click(); await page.waitForTimeout(1200);
  check("...and it returns to Assets", path() === "/");

  await page.getByText("ENC-DEL-LT-001", { exact: true }).first().click(); await page.waitForTimeout(1200);
  const vb = page.getByRole("button", { name: "Back", exact: true });
  check("Asset page via the list: one visible Back button, no image arrow", path().startsWith("/asset/") && (await vb.count()) === 1 && (await vb.isVisible()) && (await page.locator('img[src*="back-icon"]').count()) === 0);
  await vb.click(); await page.waitForTimeout(1200);
  check("...Back returns to the list", path() === "/");

  // Settings -> Report logs -> Back returns to Settings
  await page.goto("http://localhost:10000/settings", { waitUntil: "networkidle" }); await page.waitForTimeout(1200);
  await page.getByText("Report logs", { exact: true }).click(); await page.waitForTimeout(1500);
  const rbv = page.getByRole("button", { name: "Back", exact: true });
  check("Report logs from Settings: Back visible", path() === "/reports" && (await rbv.count()) === 1 && (await rbv.isVisible()));
  await rbv.click(); await page.waitForTimeout(1200);
  check("...Back returns to Settings", path() === "/settings");

  // Every stack page opened directly (refresh / emailed link) has a visible back button
  for (const p of ["/import", "/approve?asset=ENC-LAP-2026-0001&request=x", "/confirm?asset=ENC-LAP-2026-0001&custody=x", "/asset/ENC-MON-2026-0002", "/reports"]) {
    await page.goto("http://localhost:10000" + p, { waitUntil: "networkidle" }); await page.waitForTimeout(1300);
    const b = page.getByLabel("Back to Assets");
    check(`${p.split("?")[0]} opened directly: back button visible`, (await b.count()) === 1 && (await b.isVisible()));
  }

  await page.goto("http://localhost:10000/reports", { waitUntil: "networkidle" }); await page.waitForTimeout(1500);
  const rb = page.getByLabel("Back to Assets");
  check("Report logs after refresh shows a back button", (await rb.count()) === 1);
  await rb.click(); await page.waitForTimeout(1200);
  check("...and it returns to Assets", path() === "/");
  check("no file requested from a node_modules path", nm.length === 0, nm.slice(0, 3).join(" | "));
  check("every asset file (fonts, icons) loaded", bad.length === 0, bad.slice(0, 3).join(" | "));
  check("no page errors", errors.filter((e) => !/jsdelivr/.test(e)).length === 0);
  await browser.close();
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
