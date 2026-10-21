// Technician edit approval, approver-only decisions, QR print/share,
// technician report logs, and staff seeing only their own devices.
const { chromium } = require("playwright");
const { seedSession } = require("./seed");
const { mockBackend, signIn } = require("./mock");
const BASE = "http://localhost:10000";
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1500 }, acceptDownloads: true });
  const backend = await mockBackend(ctx);
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => { if (!/jsdelivr/.test(e.message)) errors.push(e.message); });
  const dialogs = []; page.on("dialog", async (d) => { dialogs.push(d.message()); await d.accept(); });
  const check = (n, c, x = "") => console.log(`${c ? "PASS" : "FAIL"} ${n} ${x}`);
  const body = () => page.locator("body").innerText();
  const role = (r) => signIn(page, r, "/settings");
  const DEV = "ENC-MON-2026-0002";
  const open = async () => { await page.goto(`${BASE}/asset/${DEV}`, { waitUntil: "networkidle" }); await page.waitForTimeout(1200); };

  // 1. Technician: Edit asks for a reason and sends it for approval
  await role("technician");
  await open();
  await page.getByRole("button", { name: "Edit (needs approval)" }).click(); await page.waitForTimeout(500);
  let t = await body();
  check("edit popup asks for the reason", t.includes("Request to edit") && t.includes("REASON FOR EDIT"));
  await page.getByRole("button", { name: "Send for approval" }).click(); await page.waitForTimeout(400);
  check("reason is required", dialogs.some((d) => d.includes("give the reason")));
  await page.getByPlaceholder("e.g. Correct the serial number, update accessories").fill("Serial number typo");
  await page.getByRole("button", { name: "Send for approval" }).click(); await page.waitForTimeout(1200);
  check("sent for approval", dialogs.some((d) => d.includes("edit request has been sent to the IT-Asset Approver")), JSON.stringify(dialogs));
  t = await body();
  check("approval email to the IT Head names the reason", backend.mails.some((m) => m.subject.startsWith("[Approval required] Edit ENC-HYD-MN-002") && m.toRecipients[0].emailAddress.address === "prasenjit.baidya@encalm.com" && m.body.content.includes("Serial number typo")), JSON.stringify(backend.mails.map((m) => m.subject)));
  check("pending banner + Edit pending", /APPROVAL PENDING:\s*EDIT REQUEST/i.test(t) && t.includes("Serial number typo") && t.includes("Edit pending"));
  await page.getByRole("button", { name: "Edit" }).click(); await page.waitForTimeout(400);
  check("pending edit doesn't open the form", (await page.getByText("Save changes").count()) === 0 && dialogs.some((d) => d.includes("waiting for approval")));
  const reqId = await page.evaluate((id) => JSON.parse(localStorage.getItem("@encalm/asset_cache_v4")).items.find((a) => a.id === id).approvalRequest.id, DEV);

  // 2. Only approvers decide
  await page.goto(`${BASE}/approve?asset=${DEV}&request=${reqId}`, { waitUntil: "networkidle" }); await page.waitForTimeout(1000);
  check("technician can't approve", (await body()).includes("Only IT-Asset Approver members can approve") && (await page.getByRole("button", { name: "Approve", exact: true }).count()) === 0);
  await role("admin");
  await page.goto(`${BASE}/approve?asset=${DEV}&request=${reqId}&decision=approve`, { waitUntil: "networkidle" }); await page.waitForTimeout(1200);
  t = await body();
  check("approve page shows the edit request", t.includes("Allow this edit?") && t.includes("Serial number typo") && t.includes("one change within 24 hours"));
  await page.getByRole("button", { name: "Approve", exact: true }).click(); await page.waitForTimeout(1500);
  t = await body();
  check("decision recorded; technician emailed", t.includes("Decision recorded") && t.includes("can save one change within 24 hours") && backend.mails.some((m) => m.subject.startsWith("[Approved] Edit ENC-HYD-MN-002") && m.toRecipients[0].emailAddress.address === "tech.one@encalm.com"));

  // 3. Technician edits once
  await role("technician");
  await open();
  t = await body();
  check("approved banner with expiry", t.includes("EDIT APPROVED") && t.includes("You can save one change until"));
  await page.getByRole("button", { name: "Edit", exact: true }).click(); await page.waitForTimeout(800);
  check("approved edit opens the form", (await page.getByText("Save changes").count()) === 1 && (await body()).includes("Approved edit — one save"));
  await page.getByPlaceholder("e.g. C02G1234MD6R").fill("CN0987654322");
  await page.getByText("Save changes").click(); await page.waitForTimeout(1500);
  t = await body();
  check("saved", t.includes("CN0987654322") && (await page.getByText("Save changes").count()) === 0 && backend.store.get("2").serialNumber === "CN0987654322");
  check("grant used up: Edit needs a new request", !t.includes("EDIT APPROVED") && (await page.getByRole("button", { name: "Edit (needs approval)" }).count()) === 1);
  const events = await page.evaluate((id) => JSON.parse(localStorage.getItem("@encalm/asset_cache_v4")).items.find((a) => a.id === id).events.map((e) => e.type), DEV);
  check("events logged: requested, approved", events.includes("edit_requested") && events.includes("edit_approved"), JSON.stringify(events));

  // 4. QR print and share
  const [popup] = await Promise.all([ctx.waitForEvent("page"), page.getByRole("button", { name: "Print label" }).click()]);
  await popup.waitForLoadState(); const label = await popup.content();
  check("print label: QR svg + host + ID + serial", label.includes("<svg") && label.includes("ENC-HYD-MN-002") && label.includes(`Asset ID: ${DEV}`) && label.includes("CN0987654322"));
  await popup.close();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Share QR" }).click()]);
  check("share QR falls back to a PNG download", dl.suggestedFilename() === "ENC-HYD-MN-002-QR.png", dl.suggestedFilename());

  // 5. Technician report logs: status panels, no exports
  await page.goto(`${BASE}/reports`, { waitUntil: "networkidle" }); await page.waitForTimeout(1200);
  t = await body();
  check("technician sees report logs with status panels", t.includes("Pending approvals (") && t.includes("Awaiting user confirmation (") && t.includes("Edit requested"));
  check("exports stay admin-only", !t.includes("Full backup (JSON)") && !t.includes("Download CSV"));
  check("no page errors", errors.length === 0, errors.join(" | "));

  // 6. Staff see only their own devices; auditors see all
  const mine = { id: "ENC-LAP-2026-0101", spItemId: "11", name: "DEL-STAFF-01", category: "Laptop", serialNumber: "S1", status: "in_use", assignee: "Neha Verma", location: "DEL", purchaseDate: "", purchasePrice: 0, warrantyExpiry: null, notes: "", createdAt: "2026-01-01", updatedAt: "2026-01-01",
    assignmentHistory: [{ id: "h1", assignee: "Neha Verma", assigneeEmail: "neha.verma@encalm.com", assignedAt: "2026-01-02" }] };
  const other = { ...mine, id: "ENC-LAP-2026-0102", spItemId: "12", name: "DEL-OTHER-02", assignee: "Raj", assignmentHistory: [{ id: "h2", assignee: "Raj", assigneeEmail: "raj@encalm.com", assignedAt: "2026-01-02" }] };
  const session = async (email, roles) => {
    const c = await browser.newContext({ viewport: { width: 900, height: 1400 } });
    await c.route("https://graph.microsoft.com/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ value: [] }) }));
    await c.route("**/api/assets", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [mine, other] }) }));
    const p = await c.newPage();
    await p.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await seedSession(p, { email, name: email.split("@")[0], initials: "XX" }, { roles });
    await p.goto(`${BASE}/`, { waitUntil: "networkidle" }); await p.waitForTimeout(2000);
    return { c, p };
  };
  let s = await session("neha.verma@encalm.com", []);
  t = await s.p.locator("body").innerText();
  check("staff sees only their own device", t.includes("DEL-STAFF-01") && !t.includes("DEL-OTHER-02"), t.slice(0, 300).replace(/\n/g, " | "));
  await s.p.goto(`${BASE}/asset/${other.id}`, { waitUntil: "networkidle" }); await s.p.waitForTimeout(1200);
  check("staff opening another device by URL is told it isn't theirs", (await s.p.locator("body").innerText()).includes("This device isn't issued to you"));
  await s.c.close();
  s = await session("auditor@encalm.com", ["Asset.Viewer"]);
  t = await s.p.locator("body").innerText();
  check("auditor sees every device", t.includes("DEL-STAFF-01") && t.includes("DEL-OTHER-02"));
  await s.c.close();
  await browser.close();
})();
