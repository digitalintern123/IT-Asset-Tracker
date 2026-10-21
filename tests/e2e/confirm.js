const { chromium } = require("playwright");
const { seedSession } = require("./seed");
const { mockBackend, signIn } = require("./mock");
const OUT = require("path").join(__dirname, "../../test-results");
const PROFILE = { email: "rahul@encalm.com", name: "Rahul Sharma", initials: "RS", role: "viewer" };
const check = (n, c, x = "") => console.log(`${c ? "PASS" : "FAIL"} ${n} ${x}`);
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
  // ---- 1+2: deep link survives sign-in, then confirm
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1000 } });
  const graph = [];
  await ctx.route("https://graph.microsoft.com/**", async (route) => {
    const req = route.request(); const url = req.url(); graph.push({ url, method: req.method(), body: req.postData() });
    const j = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.includes("/me/sendMail")) return route.fulfill({ status: 202, body: "" });
    if (url.includes("/lists?")) return j(200, { value: [{ id: "conf-list" }] });
    if (url.includes("/lists/conf-list/items") && req.method() === "POST") return j(201, { id: "99" });
    if (url.includes("/lists/conf-list/items")) return j(200, { value: [] });
    if (/\/sites\/[^/]+(:\/[^?]*)?$/.test(new URL(url).pathname) || url.includes("encalmit.sharepoint.com")) return j(200, { id: "site1" });
    return j(401, {});
  });
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => { if (!/jsdelivr/.test(e.message)) errors.push(e.message); });
  const link = "http://localhost:10000/confirm?asset=ENC-LAP-2026-0001&custody=hist_abc";
  await page.goto(link, { waitUntil: "networkidle" }); await page.waitForTimeout(1200);
  check("signed out: link redirects to login", new URL(page.url()).pathname === "/login");
  // simulate completed Microsoft sign-in: profile restored while on /login
  await seedSession(page, PROFILE);
  await page.reload({ waitUntil: "networkidle" }); await page.waitForTimeout(1800);
  const u = new URL(page.url());
  check("after sign-in: back on the confirm link", u.pathname === "/confirm" && u.search.includes("custody=hist_abc"), u.pathname + u.search);
  let txt = await page.locator("body").innerText();
  check("confirm page shows assignment + tag + button", txt.includes("Encalm IT has assigned this asset to you") && txt.includes("ENC-LAP-2026-0001") && txt.includes("Confirm receipt"));
  await page.screenshot({ path: OUT + "/confirm-page.png" });
  await page.getByText("Confirm receipt", { exact: true }).last().click(); await page.waitForTimeout(2000);
  txt = await page.locator("body").innerText();
  check("shows Thank you — confirmed", txt.includes("Thank you — confirmed"));
  const post = graph.find((g) => g.method === "POST" && g.url.includes("/lists/conf-list/items"));
  const f = post && JSON.parse(post.body).fields;
  check("posted to Asset Confirmations with asset + custody", !!f && f.Title === "ENC-LAP-2026-0001" && f.CustodyId === "hist_abc" && decodeURIComponent(graph.find((g) => g.url.includes("/lists?")).url).includes("Asset Confirmations"));
  const mail = graph.find((g) => g.url.includes("/me/sendMail"));
  const msg = mail && JSON.parse(mail.body).message;
  check("emailed encalmit@encalm.com", !!msg && msg.toRecipients[0].emailAddress.address === "encalmit@encalm.com" && msg.subject.includes("[Confirmed] Rahul Sharma"));
  await page.screenshot({ path: OUT + "/confirm-done.png" });
  console.log("page errors (1):", JSON.stringify(errors));
  await ctx.close();

  // ---- 3: asset page delete lock (admin; the user confirmed in SharePoint)
  const ctx2 = await browser.newContext({ viewport: { width: 900, height: 2200 } });
  await mockBackend(ctx2, [{
    id: "ENC-LAP-2026-0009", spItemId: "9", name: "ENC-DEL-LT-009", make: "Dell", model: "Latitude 5440", category: "Laptop", serialNumber: "SN9",
    status: "in_use", assignee: "Rahul Sharma", location: "DEL — T3", vertical: "ENCALM HOTEL", purchaseDate: "2026-01-01", purchasePrice: 1, warrantyExpiry: "2028-01-01", notes: "",
    assignmentHistory: [{ id: "h9", assignee: "Rahul Sharma", assigneeEmail: "rahul@encalm.com", assignedAt: "2026-01-02T00:00:00Z" }],
    events: [], createdAt: "", updatedAt: "" }], {
    confirmations: [{ id: "c1", fields: { Title: "ENC-LAP-2026-0009", CustodyId: "h9", ConfirmedAt: "2026-01-03T09:00:00Z" }, createdBy: { user: { email: "rahul@encalm.com", displayName: "Rahul Sharma" } } }],
  });
  const p2 = await ctx2.newPage(); const e2 = []; p2.on("pageerror", (e) => { if (!/jsdelivr/.test(e.message)) e2.push(e.message); });
  await signIn(p2, "admin", "/asset/ENC-LAP-2026-0009");
  txt = await p2.locator("body").innerText();
  check("asset page: confirmed shown in custody history", txt.includes("✓ Confirmed by Rahul Sharma"));
  check("asset page: Delete hidden + explanation shown", !/DELETE ASSET/i.test(txt) && txt.includes("deletion is disabled until"));
  check("asset page: Host name / Make / Model rows", txt.includes("Host name") && txt.includes("Latitude 5440"));
  await p2.screenshot({ path: OUT + "/asset-locked.png", fullPage: true });
  // form labels
  await p2.goto("http://localhost:10000/asset/new", { waitUntil: "networkidle" }); await p2.waitForTimeout(1200);
  txt = await p2.locator("body").innerText();
  check("form: Host Name / Make / Model fields", txt.includes("Host Name *") && txt.includes("Make *") && txt.includes("Model *") && !/^Name \*$/m.test(txt));
  await p2.getByText("CREATE ASSET").click(); await p2.waitForTimeout(400);
  check("form: Host Name required message", (await p2.locator("body").innerText()).includes("Host Name is required"));
  await p2.getByPlaceholder("e.g. ENC-DEL-LT-014").fill("ENC-DEL-LT-014");
  await p2.getByText("CREATE ASSET").click(); await p2.waitForTimeout(400);
  check("form: Make required message", (await p2.locator("body").innerText()).includes("Make is required"));
  await p2.getByPlaceholder("e.g. Dell").fill("Dell");
  await p2.getByText("CREATE ASSET").click(); await p2.waitForTimeout(400);
  check("form: Model required message", (await p2.locator("body").innerText()).includes("Model is required"));
  console.log("page errors (2):", JSON.stringify(e2));
  await browser.close();
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
