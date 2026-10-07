/**
 * Frontend Client for the Integrated ENCALM Backend API (/api/assets).
 * Communicates with the Node.js backend on Render / IIS with seamless fallback.
 */

import { getSecureTokens } from "./secureStorage";
import { createSharePointService } from "./sharepoint";
import type { Asset, AssetInput } from "@/types/asset";

const API_BASE = typeof window !== "undefined" ? window.location.origin : "";

function getHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

// The backend verifies the id_token to establish role and email; the Graph
// access token in Authorization cannot be verified by a third party.
async function getAuthHeaders(token?: string): Promise<Record<string, string>> {
  const headers = getHeaders(token);
  if (token) {
    const stored = await getSecureTokens();
    if (stored?.idToken) {
      headers["X-ID-Token"] = stored.idToken;
    }
  }
  return headers;
}

/**
 * Build an Error for a non-OK backend response, tagged with its status code
 * (and the current server record on a 409/412 conflict).
 */
async function toHttpError(res: Response, fallbackMessage: string): Promise<Error> {
  const errBody = await res.json().catch(() => ({} as any));
  const httpErr: any = new Error(errBody.error || fallbackMessage);
  httpErr.statusCode = res.status;
  if (res.status === 412 || res.status === 409) {
    httpErr.statusCode = 412;
    httpErr.serverAsset = errBody.data ?? null;
  }
  return httpErr;
}

/**
 * True when the backend answered and refused the request (auth, role,
 * validation, conflict). Those must surface to the user: retrying them
 * directly against Graph would bypass the backend's role gate.
 * 404/405 mean the endpoint is not there (e.g. IIS serves static files only),
 * so the direct-Graph fallback still applies.
 */
function isBackendRejection(err: any): boolean {
  const status = Number(err?.statusCode ?? 0);
  return status >= 400 && status < 500 && status !== 404 && status !== 405;
}

export async function apiFetchAll(token?: string): Promise<Asset[]> {
  try {
    const res = await fetch(`${API_BASE}/api/assets`, {
      method: "GET",
      headers: await getAuthHeaders(token),
    });

    if (res.ok) {
      const data = await res.json();
      return data.data || [];
    }

    throw await toHttpError(res, `Server returned HTTP ${res.status}`);
  } catch (err: any) {
    // Backend missing or unavailable: fall back to direct Graph API.
    if (token && !isBackendRejection(err)) {
      const sp = await createSharePointService(token);
      return await sp.fetchAll();
    }
    throw err;
  }
}

export async function apiCreateAsset(input: AssetInput, token?: string): Promise<Asset> {
  try {
    const res = await fetch(`${API_BASE}/api/assets`, {
      method: "POST",
      headers: await getAuthHeaders(token),
      body: JSON.stringify(input),
    });

    if (res.ok) {
      const data = await res.json();
      return data.data;
    }

    throw await toHttpError(res, `Failed to create asset (HTTP ${res.status})`);
  } catch (err: any) {
    if (token && !isBackendRejection(err)) {
      const sp = await createSharePointService(token);
      return await sp.create(input);
    }
    throw err;
  }
}

export async function apiUpdateAsset(
  id: string,
  input: AssetInput,
  token?: string,
  ifMatchEtag?: string
): Promise<Asset> {
  try {
    const headers = await getAuthHeaders(token);
    if (ifMatchEtag) {
      headers["If-Match"] = ifMatchEtag;
    }

    const res = await fetch(`${API_BASE}/api/assets/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(input),
    });

    if (res.ok) {
      const data = await res.json();
      return data.data;
    }

    throw await toHttpError(res, `Failed to update asset (HTTP ${res.status})`);
  } catch (err: any) {
    if (token && !isBackendRejection(err)) {
      const sp = await createSharePointService(token);
      return await sp.update(id, input, ifMatchEtag);
    }
    throw err;
  }
}

export async function apiDeleteAsset(id: string, token?: string): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/api/assets/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: await getAuthHeaders(token),
    });

    if (res.ok) {
      // Parse the JSON reply: an HTML 200 (IIS SPA rewrite) means the backend
      // is not there and the delete did not happen.
      await res.json();
      return;
    }

    throw await toHttpError(res, `Failed to delete asset (HTTP ${res.status})`);
  } catch (err: any) {
    if (token && !isBackendRejection(err)) {
      const sp = await createSharePointService(token);
      await sp.remove(id);
      return;
    }
    throw err;
  }
}
