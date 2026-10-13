const { chromium } = require("playwright");
const { seedSession } = require("./seed");
const OUT = require("path").join(__dirname, "../../test-results");
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const accessToken = "h." + b64({ scp: "Sites.ReadWrite.All User.ReadBasic.All Mail.Send User.Read" }) + ".s";
const check = (n, c, x = "") => console.log(`${c ? "PASS" : "FAIL"} ${n} ${x}`);
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
  // ---- demo
  let page = await browser.newPage({ viewport: { width: 900, height: 1800 } });
  const errors = []; page.on("pageerror", (e) => { if (!/jsdelivr/.test(e.message)) errors.push(e.message); });
  const dialogs = []; page.on("dialog", async (d) => { dialogs.push(d.message()); await d.accept(); });
  await page.goto("http://localhost:10000/login", { waitUntil: "networkidle" });
  await page.getByText("Explore in Demo Mode").click(); await page.waitForTimeout(1500);
  await page.goto("http://localhost:10000/settings", { waitUntil: "networkidle" }); await page.waitForTimeout(1200);
  let t = await page.locator("body").innerText();
  check("demo: Simulated + IT Administrator + source", t.includes("Simulated") && t.includes("IT Administrator") && t.includes("From: Demo role switcher"));
  await page.getByText("technician", { exact: true }).click(); await page.waitForTimeout(400);
  t = await page.locator("body").innerText();
  check("demo switcher -> IT Technician, Import link hidden", t.includes("IT Technician") && !t.includes("Import from Excel"));
  await page.getByText("admin", { exact: true }).click(); await page.waitForTimeout(400);
  await page.getByText("Run Test").click(); await page.waitForTimeout(500);
  t = await page.locator("body").innerText();
  check("demo Run Test -> Passed", t.includes("Passed") && t.includes("All 1 checks passed"));
  await page.getByText("Microsoft SharePoint Online", { exact: true }).click(); await page.waitForTimeout(300);
  check("SharePoint row tap shows notice on web", dialogs.some((d) => d.includes("Demo Sandbox")), JSON.stringify(dialogs));
  await page.screenshot({ path: OUT + "/settings-demo.png", fullPage: true });
  await page.close();
  // ---- tampered real profile: says admin, no signed role
  const ctx = await browser.newContext({ viewport: { width: 900, height: 2000 } });
  await ctx.route("https://graph.microsoft.com/**", async (route) => {
    const url = decodeURIComponent(route.request().url());
    const j = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.includes("/lists?$filter")) return j(200, { value: url.includes("Asset Confirmations") ? [] : [{ id: "reg" }] });
    if (/\/lists$/.test(url)) return j(200, { value: [{ id: "reg", displayName: "IT Asset Register" }] });
    if (url.includes("/lists/reg/columns")) return j(200, { value: ["AssetId","Category","SerialNumber","Status","Assignee","Location","PurchaseDate","PurchasePrice","WarrantyExpiry","Notes","Vertical","Make","Model"].map((name) => ({ name })) });
    if (url.includes("/lists/reg/items")) return j(200, { value: [] });
    if (url.includes("sharepoint.com")) return j(200, { id: "site1" });
    return j(401, {});
  });
  page = await ctx.newPage(); page.on("pageerror", (e) => { if (!/jsdelivr/.test(e.message)) errors.push(e.message); });
  page.on("dialog", (d) => d.accept());
  await page.goto("http://localhost:10000/login", { waitUntil: "networkidle" });
  await seedSession(page, { email: "someone@encalm.com", name: "Some One", initials: "SO", role: "admin" }, { scp: "Sites.ReadWrite.All User.ReadBasic.All Mail.Send User.Read" });
  await page.goto("http://localhost:10000/settings", { waitUntil: "networkidle" }); await page.waitForTimeout(2000);
  t = await page.locator("body").innerText();
  check("tampered 'admin' profile -> shown as Auditor / Viewer", t.includes("Auditor / Viewer") && !t.includes("IT Administrator"), (t.match(/Auditor \/ Viewer|IT Administrator|IT Technician/) || [""])[0]);
  check("role source: Default — no app role", t.includes("From: Default — no app role assigned"));
  check("Import + Report logs hidden for viewer", !t.includes("Import from Excel") && !t.includes("Report logs"));
  await page.getByText("Run Test").click(); await page.waitForTimeout(2500);
  t = await page.locator("body").innerText();
  check("Run Test: issues badge", /\d+ issues/.test(t), (t.match(/\d+ issues?[^\n]*/) || [""])[0]);
  check("checklist names missing columns", t.includes("Missing: Department, Custodianship, Criticality, OperationalStatus, AssetClass, Accessories"));
  check("checklist flags Confirmations list + Mail.Send.Shared", t.includes('List "Asset Confirmations"') && t.includes("Permission Mail.Send.Shared"));
  await page.screenshot({ path: OUT + "/settings-check.png", fullPage: true });
  // closed-tab / kiosk: profile left in localStorage but no session tokens
  const kiosk = await browser.newPage();
  await kiosk.goto("http://localhost:10000/login", { waitUntil: "networkidle" });
  await kiosk.evaluate(() => localStorage.setItem("@asset-tracker/user_profile_v3", JSON.stringify({ email: "a@encalm.com", name: "A", initials: "A", role: "admin", accessToken: "leftover", expiresAt: Date.now() + 3600e3 })));
  await kiosk.goto("http://localhost:10000/settings", { waitUntil: "networkidle" }); await kiosk.waitForTimeout(1500);
  check("profile without session tokens -> signed out (kiosk)", new URL(kiosk.url()).pathname === "/login" && (await kiosk.evaluate(() => localStorage.getItem("@asset-tracker/user_profile_v3"))) === null, kiosk.url());
  // Admin: "Fix automatically" creates the missing columns + list (mocked Graph)
  const actx = await browser.newContext({ viewport: { width: 900, height: 2200 } });
  const state = { regCols: ["AssetId","Category","SerialNumber","Status","Assignee","Location","PurchaseDate","PurchasePrice","WarrantyExpiry","Notes","Vertical","Make","Model"], conf: false, tokenScopes: [] };
  await actx.route("https://login.microsoftonline.com/**", async (route) => {
    const body = new URLSearchParams(route.request().postData() || "");
    state.tokenScopes.push(body.get("scope"));
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access_token: "manage-token", refresh_token: "r2", expires_in: 3600 }) });
  });
  await actx.route("https://graph.microsoft.com/**", async (route) => {
    const req = route.request(); const url = decodeURIComponent(req.url());
    const j = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (req.method() === "POST" && /\/lists$/.test(url)) { state.conf = true; return j(201, { id: "conf" }); }
    if (req.method() === "POST" && url.includes("/lists/reg/columns")) { state.regCols.push(JSON.parse(req.postData()).name); return j(201, {}); }
    if (url.includes("/lists?$filter")) return j(200, { value: url.includes("Asset Confirmations") ? (state.conf ? [{ id: "conf" }] : []) : [{ id: "reg" }] });
    if (/\/lists$/.test(url)) return j(200, { value: [{ id: "reg", displayName: "IT Asset Register" }].concat(state.conf ? [{ id: "conf", displayName: "Asset Confirmations" }] : []) });
    if (url.includes("/lists/reg/columns")) return j(200, { value: state.regCols.map((name) => ({ name })) });
    if (url.includes("/lists/conf/columns")) return j(200, { value: ["CustodyId", "AssetName", "ConfirmedAt"].map((name) => ({ name })) });
    if (url.includes("/lists/reg/items")) return j(200, { value: [] });
    if (url.includes("sharepoint.com")) return j(200, { id: "site1" });
    return j(401, {});
  });
  const ap = await actx.newPage();
  ap.on("pageerror", (e) => { if (!/jsdelivr/.test(e.message)) errors.push(e.message); });
  const adialogs = []; ap.on("dialog", async (d) => { adialogs.push(d.message()); await d.accept(); });
  await ap.goto("http://localhost:10000/login", { waitUntil: "networkidle" });
  await seedSession(ap, { email: "it.admin@encalm.com", name: "IT Admin", initials: "IA" }, { roles: ["Asset.Admin"] });
  await ap.goto("http://localhost:10000/settings", { waitUntil: "networkidle" }); await ap.waitForTimeout(1800);
  let at = await ap.locator("body").innerText();
  check("signed app role -> IT Administrator", at.includes("IT Administrator") && at.includes("From: Entra app role Asset.Admin"));
  check("admin sees Diagnostics", at.includes("Error log on this device"));
  await ap.getByText("Run Test").click(); await ap.waitForTimeout(2000);
  check("Fix automatically offered for missing columns/list", (await ap.getByRole("button", { name: "Fix automatically" }).count()) === 1);
  await ap.getByRole("button", { name: "Fix automatically" }).click(); await ap.waitForTimeout(3000);
  check("token requested with Sites.Manage.All only for this action", state.tokenScopes.some((s) => s && s.includes("Sites.Manage.All")));
  check("fix reports created columns + list", adialogs.some((d) => d.includes("Created:") && d.includes("column Department") && d.includes('List "Asset Confirmations"')), JSON.stringify(adialogs).slice(0, 300));
  at = await ap.locator("body").innerText();
  check("check re-run: columns and list now ✓", !at.includes("Missing: Department") && !at.includes("Fix automatically"));
  await ap.screenshot({ path: OUT + "/settings-fixed.png", fullPage: true });
  check("viewer never sees Fix automatically", (await page.getByRole("button", { name: "Fix automatically" }).count()) === 0);
  check("no page errors", errors.length === 0, errors.join(" | "));
  await browser.close();
})();
