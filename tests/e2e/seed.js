// Seeds a signed-in session exactly like the app stores it: profile (no
// tokens) in localStorage, tokens AES-GCM encrypted in sessionStorage.
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function fakeJwt(payload) { return "h." + b64(payload) + ".s"; }
async function seedSession(page, profile, { roles = [], scp = "Sites.ReadWrite.All User.ReadBasic.All Mail.Send Mail.Send.Shared User.Read" } = {}) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const tokens = {
    accessToken: fakeJwt({ scp, exp }),
    refreshToken: "fake-refresh-token",
    idToken: fakeJwt({ roles, email: profile.email, exp }),
    expiresAt: Date.now() + 3600e3,
  };
  await page.evaluate(async ({ profile, tokens }) => {
    const salt = "00112233445566778899aabbccddeeff";
    sessionStorage.setItem("@encalm/session_salt_v1", salt);
    const enc = new TextEncoder();
    const km = await crypto.subtle.importKey("raw", enc.encode(`encalm-vault-${salt}`), { name: "PBKDF2" }, false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: enc.encode(salt), iterations: 10000, hash: "SHA-256" }, km, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(tokens)));
    sessionStorage.setItem("@encalm/secure_tokens_v1", JSON.stringify({ iv: Array.from(iv), ct: Array.from(new Uint8Array(ct)) }));
    localStorage.setItem("@asset-tracker/user_profile_v3", JSON.stringify(profile));
  }, { profile, tokens });
  return tokens;
}
module.exports = { seedSession, fakeJwt };
