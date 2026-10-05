/**
 * Frontend Client for the Integrated ENCALM Backend API (/api/assets).
 * Communicates with the Node.js backend on Render / IIS with seamless fallback.
 */

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

export async function apiFetchAll(token?: string): Promise<Asset[]> {
  try {
    const res = await fetch(`${API_BASE}/api/assets`, {
      method: "GET",
      headers: getHeaders(token),
    });

    if (res.ok) {
      const data = await res.json();
      return data.data || [];
    }

    // If backend returns 500/404, fall back to direct Graph API if token is present
    if (token) {
      const sp = await createSharePointService(token);
      return await sp.fetchAll();
    }

    throw new Error(`Server returned HTTP ${res.status}`);
  } catch (err: any) {
    if (token) {
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
      headers: getHeaders(token),
      body: JSON.stringify(input),
    });

    if (res.ok) {
      const data = await res.json();
      return data.data;
    }

    if (token) {
      const sp = await createSharePointService(token);
      return await sp.create(input);
    }

    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to create asset (HTTP ${res.status})`);
  } catch (err: any) {
    if (token) {
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
    const headers = getHeaders(token);
    if (ifMatchEtag) {
      headers["If-Match"] = ifMatchEtag;
    }

    const res = await fetch(`${API_BASE}/api/assets/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(input),
    });

    if (res.status === 412 || res.status === 409) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || "Conflict: Asset was updated by another user.");
    }

    if (res.ok) {
      const data = await res.json();
      return data.data;
    }

    if (token) {
      const sp = await createSharePointService(token);
      return await sp.update(id, input);
    }

    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to update asset (HTTP ${res.status})`);
  } catch (err: any) {
    if (token && !err.message?.includes("Conflict")) {
      const sp = await createSharePointService(token);
      return await sp.update(id, input);
    }
    throw err;
  }
}

export async function apiDeleteAsset(id: string, token?: string): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/api/assets/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: getHeaders(token),
    });

    if (res.ok) {
      return;
    }

    if (token) {
      const sp = await createSharePointService(token);
      await sp.remove(id);
      return;
    }

    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to delete asset (HTTP ${res.status})`);
  } catch (err: any) {
    if (token) {
      const sp = await createSharePointService(token);
      await sp.remove(id);
      return;
    }
    throw err;
  }
}
