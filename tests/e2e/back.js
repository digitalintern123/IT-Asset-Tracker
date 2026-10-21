const { chromium } = require("playwright");
const { mockBackend, signIn } = require("./mock");
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  await mockBackend(ctx);
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
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
  check("Asset page via the list has no extra back button (native arrow kept)", (await page.getByLabel("Back to Assets").count()) === 0 && path().startsWith("/asset/"));

  await page.goto("http://localhost:10000/reports", { waitUntil: "networkidle" }); await page.waitForTimeout(1500);
  const rb = page.getByLabel("Back to Assets");
  check("Report logs after refresh shows a back button", (await rb.count()) === 1);
  await rb.click(); await page.waitForTimeout(1200);
  check("...and it returns to Assets", path() === "/");
  check("no page errors", errors.filter((e) => !/jsdelivr/.test(e)).length === 0);
  await browser.close();
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
