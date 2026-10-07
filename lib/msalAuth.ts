/**
 * Microsoft 365 Authorization Code + PKCE OAuth Engine.
 * Supports cross-platform PKCE generation, silent refresh, direct SPA exchange,
 * and backend proxy fallback (/api/auth/token).
 */

import * as AuthSession from "expo-auth-session";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";

import { MS_CONFIG, isMsConfigured } from "./msConfig";
import { setSecureTokens, getSecureTokens, StoredTokens } from "./secureStorage";

export interface MsTokens {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt: number;
}

const PKCE_VERIFIER_KEY = "@encalm/pkce_verifier";
const PKCE_STATE_KEY = "@encalm/pkce_state";

export function getRedirectUri(): string {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") {
      return window.location.origin + "/";
    }
    return "https://tracker.encalmhospitality.com/";
  }
  return AuthSession.makeRedirectUri({
    scheme: "asset-tracker",
    path: "auth/callback",
  });
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Generate a cryptographically random code_verifier (43-128 chars).
 */
export async function generateCodeVerifier(): Promise<string> {
  if (Platform.OS === "web" && typeof window !== "undefined" && window.crypto) {
    const randomBytes = new Uint8Array(64);
    window.crypto.getRandomValues(randomBytes);
    return base64UrlEncode(randomBytes);
  }
  const randomBytes = await Crypto.getRandomBytesAsync(64);
  return base64UrlEncode(randomBytes);
}

/**
 * Compute SHA-256 base64url code_challenge from code_verifier.
 */
export async function computeCodeChallenge(verifier: string): Promise<string> {
  if (Platform.OS === "web" && typeof window !== "undefined" && window.crypto && window.crypto.subtle) {
    const enc = new TextEncoder();
    const digest = await window.crypto.subtle.digest("SHA-256", enc.encode(verifier));
    return base64UrlEncode(new Uint8Array(digest));
  }
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
    { encoding: Crypto.CryptoEncoding.BASE64 }
  );
  return hash.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Generate a random state parameter for CSRF mitigation.
 */
export async function generateRandomState(): Promise<string> {
  if (Platform.OS === "web" && typeof window !== "undefined" && window.crypto) {
    const randomBytes = new Uint8Array(24);
    window.crypto.getRandomValues(randomBytes);
    return base64UrlEncode(randomBytes);
  }
  const randomBytes = await Crypto.getRandomBytesAsync(24);
  return base64UrlEncode(randomBytes);
}

/**
 * Save PKCE session in storage before redirecting.
 */
export function savePkceSession(verifier: string, state: string) {
  if (typeof window !== "undefined" && window.sessionStorage) {
    window.sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
    window.sessionStorage.setItem(PKCE_STATE_KEY, state);
  }
}

/**
 * Retrieve and clear PKCE session on callback.
 */
export function getAndClearPkceSession(): { verifier: string | null; state: string | null } {
  if (typeof window === "undefined" || !window.sessionStorage) {
    return { verifier: null, state: null };
  }
  const verifier = window.sessionStorage.getItem(PKCE_VERIFIER_KEY);
  const state = window.sessionStorage.getItem(PKCE_STATE_KEY);
  window.sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  window.sessionStorage.removeItem(PKCE_STATE_KEY);
  return { verifier, state };
}

/**
 * Build Microsoft OAuth 2.0 PKCE Authorization URL.
 */
export async function buildAuthorizeUrl(): Promise<string> {
  const verifier = await generateCodeVerifier();
  const challenge = await computeCodeChallenge(verifier);
  const state = await generateRandomState();
  const redirectUri = getRedirectUri();

  savePkceSession(verifier, state);

  const scopes = encodeURIComponent(MS_CONFIG.SCOPES.join(" "));
  return (
    `https://login.microsoftonline.com/${MS_CONFIG.TENANT_ID}/oauth2/v2.0/authorize` +
    `?client_id=${MS_CONFIG.CLIENT_ID}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${scopes}` +
    `&response_mode=query` +
    `&code_challenge=${challenge}` +
    `&code_challenge_method=S256` +
    `&state=${encodeURIComponent(state)}` +
    `&prompt=select_account`
  );
}

/**
 * Exchange Authorization Code for Access & Refresh Tokens.
 * Attempts direct Entra ID fetch first; falls back to backend proxy /api/auth/token.
 */
export async function exchangeCodeForTokens(
  code: string,
  verifier: string,
  redirectUri: string
): Promise<MsTokens> {
  const bodyParams = new URLSearchParams({
    client_id: MS_CONFIG.CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });

  // 1. Direct browser fetch
  try {
    const res = await fetch(
      `https://login.microsoftonline.com/${MS_CONFIG.TENANT_ID}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: bodyParams.toString(),
      }
    );

    if (res.ok) {
      const data = await res.json();
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        idToken: data.id_token,
        expiresAt: Date.now() + (parseInt(data.expires_in, 10) || 3600) * 1000,
      };
    }
  } catch (directErr) {
    console.warn("Direct code exchange encountered network/CORS issue, falling back to backend:", directErr);
  }

  // 2. Fallback to integrated backend proxy
  const backendBase = typeof window !== "undefined" ? window.location.origin : "";
  const backendRes = await fetch(`${backendBase}/api/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      codeVerifier: verifier,
      redirectUri,
    }),
  });

  if (!backendRes.ok) {
    const errText = await backendRes.text();
    throw new Error(`Token exchange failed: ${errText}`);
  }

  const backendData = await backendRes.json();
  return {
    accessToken: backendData.access_token,
    refreshToken: backendData.refresh_token,
    idToken: backendData.id_token,
    expiresAt: Date.now() + (parseInt(backendData.expires_in, 10) || 3600) * 1000,
  };
}

/**
 * Silently refresh tokens using OAuth refresh_token grant.
 */
export async function silentRefreshToken(refreshToken: string): Promise<MsTokens> {
  const bodyParams = new URLSearchParams({
    client_id: MS_CONFIG.CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: MS_CONFIG.SCOPES.join(" "),
  });

  // 1. Direct browser fetch
  try {
    const res = await fetch(
      `https://login.microsoftonline.com/${MS_CONFIG.TENANT_ID}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: bodyParams.toString(),
      }
    );

    if (res.ok) {
      const data = await res.json();
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken,
        idToken: data.id_token,
        expiresAt: Date.now() + (parseInt(data.expires_in, 10) || 3600) * 1000,
      };
    }
  } catch (err) {
    console.warn("Direct refresh failed, trying backend fallback:", err);
  }

  // 2. Backend proxy fallback
  const backendBase = typeof window !== "undefined" ? window.location.origin : "";
  const backendRes = await fetch(`${backendBase}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!backendRes.ok) {
    throw new Error(`Token refresh failed: ${backendRes.status}`);
  }

  const backendData = await backendRes.json();
  return {
    accessToken: backendData.access_token,
    refreshToken: backendData.refresh_token || refreshToken,
    idToken: backendData.id_token,
    expiresAt: Date.now() + (parseInt(backendData.expires_in, 10) || 3600) * 1000,
  };
}

/**
 * Fetch authenticated user profile from Microsoft Graph.
 */
export async function fetchGraphUserProfile(accessToken: string): Promise<{
  displayName: string;
  email: string;
}> {
  const res = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Graph profile fetch failed: HTTP ${res.status}`);
  }

  const profile = await res.json();
  const displayName = profile.displayName || profile.userPrincipalName || "";
  const email = profile.mail || profile.userPrincipalName || "";
  return { displayName, email };
}

/**
 * Native mobile sign in via expo-auth-session with PKCE.
 */
export async function signInWithMicrosoftNative(): Promise<{
  tokens: MsTokens;
  email: string;
  name: string;
} | null> {
  if (!isMsConfigured()) return null;

  const discovery = await AuthSession.fetchDiscoveryAsync(
    `https://login.microsoftonline.com/${MS_CONFIG.TENANT_ID}/v2.0`
  );

  const request = new AuthSession.AuthRequest({
    clientId: MS_CONFIG.CLIENT_ID,
    redirectUri: getRedirectUri(),
    scopes: [...MS_CONFIG.SCOPES],
    usePKCE: true,
    extraParams: { prompt: "select_account" },
  });

  const result = await request.promptAsync(discovery);
  if (result.type !== "success" || !result.params.code) return null;

  const tokenResult = await AuthSession.exchangeCodeAsync(
    {
      clientId: MS_CONFIG.CLIENT_ID,
      code: result.params.code,
      redirectUri: getRedirectUri(),
      extraParams: { code_verifier: request.codeVerifier ?? "" },
    },
    discovery
  );

  const tokens: MsTokens = {
    accessToken: tokenResult.accessToken,
    refreshToken: tokenResult.refreshToken,
    idToken: tokenResult.idToken ?? "",
    expiresAt: Date.now() + (tokenResult.expiresIn ?? 3600) * 1000,
  };

  const { displayName, email } = await fetchGraphUserProfile(tokens.accessToken);
  return { tokens, email, name: displayName };
}
