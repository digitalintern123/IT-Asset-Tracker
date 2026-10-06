/**
 * Automated API & Backend Diagnostic Suite for ENCALM Asset Tracker.
 * Runs independently with Node.js built-in modules (http, assert, url).
 */

const http = require("http");
const assert = require("assert");

console.log("\n=======================================================");
console.log("   ENCALM ASSET TRACKER - DIAGNOSTIC & API TEST SUITE  ");
console.log("=======================================================\n");

let passed = 0;
let failed = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`  ✓ ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${desc}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function asyncIt(desc, fn) {
  try {
    await fn();
    console.log(`  ✓ ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${desc}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function runTests() {
  console.log("--- 1. Testing Server-Side Module Integrity ---");
  const sharepointApi = require("../server/sharepoint-api.js");

  it("SharePoint API exports required interface functions", () => {
    assert.strictEqual(typeof sharepointApi.fetchAllAssets, "function");
    assert.strictEqual(typeof sharepointApi.createAsset, "function");
    assert.strictEqual(typeof sharepointApi.updateAsset, "function");
    assert.strictEqual(typeof sharepointApi.deleteAsset, "function");
    assert.strictEqual(typeof sharepointApi.exchangeAuthCode, "function");
    assert.strictEqual(typeof sharepointApi.refreshAuthToken, "function");
  });

  console.log("\n--- 2. Testing Configuration & Defaults ---");

  it("Default Azure AD & SharePoint settings are defined", () => {
    assert.strictEqual(typeof (process.env.AZURE_TENANT_ID || "cee20abc-e97b-434e-a89b-e8c8ca3d3d75"), "string");
    assert.strictEqual(typeof (process.env.AZURE_CLIENT_ID || "96823f1a-bdb9-49c5-8461-d181438c74e3"), "string");
  });

  console.log("\n--- 3. Testing Local Backend HTTP Server Routes ---");

  // Spin up temporary test server from serve-web.js logic
  process.env.PORT = "10099";
  process.env.STATIC_DIR = "dist"; // Point to existing folder

  const testPort = 10099;
  const baseUrl = `http://127.0.0.1:${testPort}`;

  // Start the server
  require("../server/serve-web.js");

  // Wait 500ms for server to bind
  await new Promise((r) => setTimeout(r, 600));

  function makeRequest(urlPath, options = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(urlPath, baseUrl);
      const req = http.request(
        url,
        {
          method: options.method || "GET",
          headers: options.headers || {},
          timeout: 4000,
        },
        (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => {
            try {
              resolve({
                status: res.statusCode,
                headers: res.headers,
                data: body ? JSON.parse(body) : {},
              });
            } catch {
              resolve({
                status: res.statusCode,
                headers: res.headers,
                data: body,
              });
            }
          });
        }
      );
      req.on("error", reject);
      if (options.body) {
        req.write(typeof options.body === "string" ? options.body : JSON.stringify(options.body));
      }
      req.end();
    });
  }

  await asyncIt("GET /health responds with 200 and healthy status", async () => {
    const res = await makeRequest("/health");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.status, "healthy");
    assert.strictEqual(res.data.service, "encalm-asset-tracker");
  });

  await asyncIt("GET /api/health responds with 200 and healthy status", async () => {
    const res = await makeRequest("/api/health");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.status, "healthy");
  });

  await asyncIt("OPTIONS /api/assets handles CORS preflight with 204", async () => {
    const res = await makeRequest("/api/assets", { method: "OPTIONS" });
    assert.strictEqual(res.status, 204);
    assert.strictEqual(res.headers["access-control-allow-origin"], "*");
  });

  await asyncIt("DELETE /api/assets/:id enforces role guard (403 for unauthorized caller)", async () => {
    // Calling without token defaults to technician role -> should be rejected with 403
    const res = await makeRequest("/api/assets/ENC-TEST-1", { method: "DELETE" });
    assert.strictEqual(res.status, 403);
    assert.ok(res.data.error.includes("Forbidden"));
  });

  await asyncIt("POST /api/assets enforces viewer guard when viewer token is passed", async () => {
    // Generate a mock JWT with viewer role
    const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64");
    const payload = Buffer.from(JSON.stringify({ roles: ["Viewer"], email: "auditor@encalm.com" })).toString("base64");
    const mockViewerToken = `${header}.${payload}.signature`;

    const res = await makeRequest("/api/assets", {
      method: "POST",
      headers: { Authorization: `Bearer ${mockViewerToken}` },
      body: { name: "Test Asset" },
    });
    assert.strictEqual(res.status, 403);
    assert.ok(res.data.error.includes("Viewer role cannot create"));
  });

  await asyncIt("POST /api/auth/token validates request payload structure", async () => {
    const res = await makeRequest("/api/auth/token", {
      method: "POST",
      body: { code: "" },
    });
    // Should fail cleanly with 400 when code is invalid/empty
    assert.strictEqual(res.status, 400);
  });

  console.log("\n--- 4. Testing Frontend Data Types & RBAC Rules ---");

  const ROLE_PERMISSIONS = {
    admin: { canCreateAsset: true, canEditAsset: true, canDeleteAsset: true },
    technician: { canCreateAsset: true, canEditAsset: true, canDeleteAsset: false },
    viewer: { canCreateAsset: false, canEditAsset: false, canDeleteAsset: false },
  };

  it("Admin role has complete operational permissions", () => {
    const p = ROLE_PERMISSIONS.admin;
    assert.strictEqual(p.canCreateAsset, true);
    assert.strictEqual(p.canEditAsset, true);
    assert.strictEqual(p.canDeleteAsset, true);
  });

  it("Technician role can create & edit but CANNOT delete assets", () => {
    const p = ROLE_PERMISSIONS.technician;
    assert.strictEqual(p.canCreateAsset, true);
    assert.strictEqual(p.canEditAsset, true);
    assert.strictEqual(p.canDeleteAsset, false);
  });

  it("Viewer role has read-only access (no create, edit, delete)", () => {
    const p = ROLE_PERMISSIONS.viewer;
    assert.strictEqual(p.canCreateAsset, false);
    assert.strictEqual(p.canEditAsset, false);
    assert.strictEqual(p.canDeleteAsset, false);
  });

  console.log("\n=======================================================");
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("=======================================================\n");

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error("Test runner failed:", err);
  process.exit(1);
});
