// PO number and Invoice number: stored in SharePoint (client + server
// mappers identical), safe before the columns exist, imported, searchable,
// in the backup and merged on conflicts.
const path = require("path"), fs = require("fs"), Module = require("module");
const repo = path.join(__dirname, "..");
const ts = require(path.join(repo, "node_modules/typescript"));
let fail = 0; const ok = (n, c, x = "") => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"} ${n} ${x}`); };
const cache = {};
function loadTs(rel) {
  const full = path.join(repo, rel); if (cache[full]) return cache[full];
  const out = ts.transpileModule(fs.readFileSync(full, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = { exports: {} }; cache[full] = m.exports;
  const req = (id) => id === "react-native" ? { Platform: { OS: "ios" }, Linking: { openURL: async () => {} } } : id.startsWith("@/") ? loadTs(id.slice(2) + ".ts") : id.startsWith("./") ? loadTs(path.join(path.dirname(rel), id) + ".ts") : require(id);
  new Function("module", "exports", "require", out)(m, m.exports, req); return m.exports;
}
const sp = loadTs("lib/sharepoint.ts"), I = loadTs("lib/importSheet.ts"), R = loadTs("lib/reports.ts"), C = loadTs("lib/conflictResolver.ts"), SC = loadTs("lib/setupCheck.ts");
const file = path.join(repo, "server/sharepoint-api.js");
const mod = new Module(file); mod.paths = Module._nodeModulePaths(path.dirname(file));
mod._compile(fs.readFileSync(file, "utf8") + "\nmodule.exports.__t={assetInputToSpFields,spItemToAsset};", file);
const S = mod.exports.__t;
const base = { id: "ENC-LAP-2026-0001", name: "H1", category: "Laptop", serialNumber: "S1", status: "available", assignee: "", location: "DEL — T3", purchaseDate: "", purchasePrice: 0, warrantyExpiry: null, notes: "" };

// write
const withRefs = { ...base, poNumber: "PO/2026/0142", invoiceNumber: "INV-88231" };
const f = sp.toSpFields(withRefs);
ok("update writes PONumber + InvoiceNumber", f.PONumber === "PO/2026/0142" && f.InvoiceNumber === "INV-88231");
ok("create writes them too", sp.toSpFields(withRefs, "ENC-1").PONumber === "PO/2026/0142");
ok("not sent when never set (lists without the columns keep saving)", !("PONumber" in sp.toSpFields(base)) && !("InvoiceNumber" in sp.toSpFields(base)) && !("PONumber" in sp.toSpFields(base, "ENC-1")));
ok("clearing an existing value sends \"\"", sp.toSpFields({ ...withRefs, poNumber: "", invoiceNumber: "" }).PONumber === "" && sp.toSpFields({ ...withRefs, poNumber: "" }).InvoiceNumber === "INV-88231");
ok("server writes identically", JSON.stringify(S.assetInputToSpFields(withRefs)) === JSON.stringify(sp.toSpFields(withRefs)) && JSON.stringify(S.assetInputToSpFields(base, "ENC-1")) === JSON.stringify(sp.toSpFields(base, "ENC-1")));
// read
const item = { id: "7", fields: { Title: "H1", AssetId: "ENC-1", PONumber: "PO-1", InvoiceNumber: "INV-1" } };
ok("reads both columns (client + server)", sp.fromSpItem(item).poNumber === "PO-1" && sp.fromSpItem(item).invoiceNumber === "INV-1" && S.spItemToAsset(item).poNumber === "PO-1" && S.spItemToAsset(item).invoiceNumber === "INV-1");
const empty = { id: "8", fields: { Title: "H2", AssetId: "ENC-2" } };
ok("empty / missing column reads as unset, and re-saving sends nothing", sp.fromSpItem(empty).poNumber === undefined && !("PONumber" in sp.toSpFields({ ...base, ...sp.fromSpItem(empty) })) && S.spItemToAsset(empty).invoiceNumber === undefined);
// setup check
ok("setup check knows the columns (Fix automatically creates them as text)", sp.OPTIONAL_COLUMNS.includes("PONumber") && sp.OPTIONAL_COLUMNS.includes("InvoiceNumber") && SC.columnDefinition("PONumber").text && SC.columnDefinition("InvoiceNumber").text);
// import
const hdr = ["COMPUTER NAME / NUMBER", "DEVICE_SERIAL NUMBER (service tag)", "LOCATION", "PO No", "Invoice Number"];
const rows = I.parseInventorySheet([hdr, ["DEL-NB1", "S9", "Delhi", "PO/26/77", "INV 501"], ["DEL-NB2", "S10", "Delhi", "", ""]], [], { category: "Laptop", vertical: "ENCALM HOTEL" }).rows;
ok("import reads PO No / Invoice Number headers", rows[0].input.poNumber === "PO/26/77" && rows[0].input.invoiceNumber === "INV 501", JSON.stringify(rows[0].input).slice(0, 200));
ok("import leaves them unset when blank", rows[1].input.poNumber === undefined && rows[1].input.invoiceNumber === undefined);
const alt = I.mapHeaders(["Purchase Order", "Bill No"]);
ok("import aliases: Purchase Order, Bill No", alt.poNumber === 0 && alt.invoiceNumber === 1);
const tpl = I.mapHeaders(I.inventoryTemplateCsv().replace(/^﻿/, "").trim().split(","));
ok("template has both columns", tpl.poNumber !== undefined && tpl.invoiceNumber !== undefined);
// backup re-imports
const csv = R.registerCsv([withRefs]).replace(/^﻿/, "");
const [h, r1] = csv.split("\r\n").map((l) => l.split(","));
const map = I.mapHeaders(h);
ok("register backup has PO / Invoice columns that re-import", r1[map.poNumber] === "PO/2026/0142" && r1[map.invoiceNumber] === "INV-88231");
// report search
const rowsR = R.flattenEvents([{ ...withRefs, events: [{ id: "e", type: "created", at: "2026-01-01T00:00:00Z", by: "IT" }] }]);
ok("report logs search finds the PO number", R.filterRows(rowsR, { search: "po/2026/0142" }).length === 1 && R.filterRows(rowsR, { search: "inv-88231" }).length === 1);
// conflict merge
const merged = C.resolveAssetConflict({ ...withRefs, invoiceNumber: "INV-2" }, { ...withRefs, poNumber: "PO-SERVER" }, withRefs).mergedAsset;
ok("concurrent edits merge (mine: invoice, theirs: PO)", merged.invoiceNumber === "INV-2" && merged.poNumber === "PO-SERVER", JSON.stringify({ po: merged.poNumber, inv: merged.invoiceNumber }));
// UI wiring
const form = fs.readFileSync(path.join(repo, "components/AssetForm.tsx"), "utf8"), detail = fs.readFileSync(path.join(repo, "app/asset/[id].tsx"), "utf8"), list = fs.readFileSync(path.join(repo, "app/(tabs)/index.tsx"), "utf8");
ok("form, device page and asset search include both", /label="PO number"/.test(form) && /label="Invoice number"/.test(form) && detail.includes('label="PO number"') && detail.includes('label="Invoice number"') && list.includes("a.poNumber") && list.includes("a.invoiceNumber"));
console.log(fail ? `${fail} FAILED` : "ALL PASS"); process.exit(fail ? 1 : 0);
