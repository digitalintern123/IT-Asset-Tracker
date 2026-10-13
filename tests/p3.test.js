const path = require("path"), fs = require("fs"), Module = require("module");
const repo = path.join(__dirname, "..");
const ts = require(path.join(repo, "node_modules/typescript"));
let fail = 0; const ok = (n, c, x = "") => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"} ${n} ${x}`); };
// load a TS file with stubbed imports
function loadTs(rel, stubs) {
  const out = ts.transpileModule(fs.readFileSync(path.join(repo, rel), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const m = { exports: {} };
  new Function("module", "exports", "require", out)(m, m.exports, (id) => { if (id in stubs) return stubs[id]; throw new Error("unstubbed " + id); });
  return m.exports;
}
// ---- mapStatus (server copy; client copy is identical text)
const file = path.join(repo, "server/sharepoint-api.js");
const mod = new Module(file); mod.paths = Module._nodeModulePaths(path.dirname(file));
mod._compile(fs.readFileSync(file, "utf8") + "\nmodule.exports.__t={mapStatus};", file);
const { mapStatus } = mod.exports.__t;
const expect = { in_use: "in_use", available: "available", maintenance: "maintenance", retired: "retired",
  "In Use": "in_use", "Issued": "in_use", "Assigned": "in_use", "Not in Use": "available", "Unused": "available",
  "Not Issued": "available", "Unassigned": "available", "Lost": "retired", "Stolen": "retired", "Written off": "retired",
  "Disposed": "retired", "Under Repair": "maintenance", "Spare": "available", "": "available" };
for (const [k, v] of Object.entries(expect)) ok(`mapStatus(${JSON.stringify(k)}) -> ${v}`, mapStatus(k) === v, `got ${mapStatus(k)}`);
const clientSrc = fs.readFileSync(path.join(repo, "lib/sharepoint.ts"), "utf8"), serverSrc = fs.readFileSync(file, "utf8");
const body = (s) => s.slice(s.indexOf("const s = (raw"), s.indexOf('return "available";\n}') );
ok("client mapStatus body identical to server", body(clientSrc) === body(serverSrc));

// ---- assetId
const { generateStableAssetId } = loadTs("lib/assetId.ts", {});
const y = new Date().getFullYear();
ok("first ID in empty category is 0001 (not count+1)", generateStableAssetId("Laptop", [{ id: "ENC-MON-" + y + "-0001" }, { id: "ENC-MON-" + y + "-0002" }]) === `ENC-LAP-${y}-0001`);
ok("next after max", generateStableAssetId("Laptop", [{ id: `ENC-LAP-${y}-0007` }]) === `ENC-LAP-${y}-0008`);

// ---- offlineQueue with in-memory AsyncStorage
const store = {};
const AsyncStorage = { getItem: async (k) => store[k] ?? null, setItem: async (k, v) => { store[k] = v; }, removeItem: async (k) => { delete store[k]; } };
const q = loadTs("lib/offlineQueue.ts", { "@react-native-async-storage/async-storage": { default: AsyncStorage, __esModule: true }, "react-native": { Platform: { OS: "ios" } } });
(async () => {
  const A = { id: "ENC-LAP-1" }, B = { id: "ENC-LAP-2" };
  await q.enqueueOfflineMutation("create", A);
  await q.enqueueOfflineMutation("update", { ...A, name: "edited" });
  let qs = await q.getQueuedMutations();
  ok("create+update stays a create with latest data", qs.length === 1 && qs[0].action === "create" && qs[0].asset.name === "edited");
  await q.enqueueOfflineMutation("delete", A);
  ok("create+delete leaves nothing", (await q.getQueuedMutations()).length === 0);
  await q.enqueueOfflineMutation("update", { id: "X", spItemId: "9" }, "e1");
  await q.enqueueOfflineMutation("update", B, "e2");
  for (let i = 1; i <= 4; i++) await q.drainOfflineQueue(async (m) => m.asset.id !== "X");
  qs = await q.getQueuedMutations();
  ok("retryCount persisted across drains", qs[0].asset.id === "X" && qs[0].retryCount === 4, `retry=${qs[0] && qs[0].retryCount}`);
  ok("FIFO kept while retrying (B still queued behind X)", qs.length === 2);
  const r = await q.drainOfflineQueue(async (m) => m.asset.id !== "X");
  ok("5th failure dead-letters X and B then drains", r.processed === 1 && r.remaining === 0, JSON.stringify(r));
  const dl = await q.getDeadLetterMutations();
  ok("dead letter recorded", dl.length === 1 && dl[0].asset.id === "X" && dl[0].retryCount === 5);
  process.exit(fail ? 1 : 0);
})();
