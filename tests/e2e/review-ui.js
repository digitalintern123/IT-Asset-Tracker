const { chromium } = require("playwright");
const SAMPLE = require("path").join(__dirname, "../fixtures/inventory-sample.xlsx");
const check = (n, c, x = "") => console.log(`${c ? "PASS" : "FAIL"} ${n} ${x}`);
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
  const page = await browser.newPage({ viewport: { width: 900, height: 1800 } });
  const errors = []; page.on("pageerror", (e) => { if (!/jsdelivr/.test(e.message)) errors.push(e.message); });
  const dialogs = []; page.on("dialog", async (d) => { dialogs.push(d.message()); await d.accept(); });
  const body = () => page.locator("body").innerText();
  await page.goto("http://localhost:10000/login", { waitUntil: "networkidle" });
  await page.getByText("Explore in Demo Mode").click(); await page.waitForTimeout(1500);
  // 1. Reassign dialog validation
  await page.goto("http://localhost:10000/asset/ENC-LAP-2026-0001", { waitUntil: "networkidle" }); await page.waitForTimeout(1200);
  await page.getByText("Reassign", { exact: true }).first().click(); await page.waitForTimeout(500);
  await page.getByPlaceholder("Person or team").fill("Bob Test");
  await page.getByPlaceholder("name@encalm.com").fill("bob@");
  await page.getByText(/Confirm|Transfer|Reassign/).last().click(); await page.waitForTimeout(800);
  check("reassign rejects invalid email", dialogs.some((d) => d.includes("valid email")), JSON.stringify(dialogs.slice(-1)));
  check("nothing changed after rejected reassign", !(await body()).includes("Awaiting confirmation from bob@"));
  // 2. return device clears user
  await page.goto("http://localhost:10000/asset/ENC-LAP-2026-0001", { waitUntil: "networkidle" }); await page.waitForTimeout(1200);
  await page.getByText("Edit", { exact: true }).first().click(); await page.waitForTimeout(800);
  await page.getByText("In Use", { exact: true }).last().click(); await page.waitForTimeout(400);
  await page.getByText("Available", { exact: true }).last().click(); await page.waitForTimeout(300);
  await page.getByText("SAVE CHANGES").click(); await page.waitForTimeout(1800);
  let t = await body();
  const assignedLine = (t.match(/Assigned to\s*\n\s*([^\n]+)/) || [])[1];
  check("returned device has no current user", !assignedLine || !/Rahul/.test(assignedLine), String(assignedLine));
  // 3. technician (fresh demo session): pending request blocks a second one
  const p2 = await (await browser.newContext({ viewport: { width: 900, height: 1800 } })).newPage();
  p2.on("dialog", async (d) => { dialogs.push(d.message()); await d.accept(); });
  await p2.goto("http://localhost:10000/login", { waitUntil: "networkidle" });
  await p2.getByText("Explore in Demo Mode").click(); await p2.waitForTimeout(1500);
  await p2.goto("http://localhost:10000/settings", { waitUntil: "networkidle" }); await p2.waitForTimeout(800);
  await p2.getByText("technician", { exact: true }).click(); await p2.waitForTimeout(400);
  await p2.goto("http://localhost:10000/asset/ENC-LAP-2026-0001", { waitUntil: "networkidle" }); await p2.waitForTimeout(1200);
  { const page = p2; const body = () => p2.locator("body").innerText();
  t = await body();
  if (t.includes("In Use")) {
    await page.getByText("Reassign", { exact: true }).first().click(); await page.waitForTimeout(500);
    await page.getByPlaceholder("Person or team").fill("Carol New");
    await page.getByPlaceholder("name@encalm.com").fill("carol@encalm.com");
    await page.getByText(/Confirm|Transfer|Reassign/).last().click(); await page.waitForTimeout(1500);
    t = await body();
    check("pending request: banner shown", /APPROVAL PENDING/i.test(t));
    check("pending request: Reassign + Request Deletion hidden", !t.includes("Request Asset Deletion") && !/\bReassign\b(?! request)/.test(t.replace(/REASSIGN REQUEST/gi, "")), "");
  } else {
    check("demo asset 0001 is In Use (precondition)", false, t.slice(0, 200));
  }
  }
  // 4. import summary skipped count (admin)
  await page.goto("http://localhost:10000/settings", { waitUntil: "networkidle" }); await page.waitForTimeout(800);
  await page.getByText("admin", { exact: true }).click(); await page.waitForTimeout(400);
  await page.goto("http://localhost:10000/import", { waitUntil: "networkidle" }); await page.waitForTimeout(1000);
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByText("Choose .xlsx file").click()]);
  await chooser.setFiles(SAMPLE); await page.waitForTimeout(2000);
  await page.getByText("Import 3 assets").click(); await page.waitForTimeout(3000);
  t = await body();
  check("import summary: 3 imported, none skipped", /3 imported/.test(t) && !/skipped/.test(t.split("Import finished")[1] || ""), (t.match(/\d+ imported[^\n]*/) || [""])[0]);
  check("no page errors", errors.length === 0, errors.join(" | "));
  await browser.close();
})();
