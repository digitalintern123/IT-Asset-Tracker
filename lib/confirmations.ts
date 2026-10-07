/**
 * Assignment confirmations: when IT assigns a device, the user confirms receipt
 * from the emailed link. Each confirmation is one item in the SharePoint list
 * MS_CONFIG.CONFIRMATIONS_LIST_NAME, which staff may add to without having edit
 * rights on the IT Asset Register itself.
 *
 * A confirmation only counts when SharePoint's own "created by" email (which
 * the user cannot set) matches the email on that custody record.
 */

import { MS_CONFIG } from "@/lib/msConfig";
import { resolveListIdByName, resolveSiteId } from "@/lib/sharepoint";
import type { Asset, AssetEvent } from "@/types/asset";

const GRAPH = "https://graph.microsoft.com/v1.0";

export interface Confirmation {
  id: string;
  assetId: string;
  custodyId: string;
  confirmedAt: string;
  createdByEmail: string;
  createdByName: string;
}

function missingListError(): Error {
  const err: any = new Error(
    `The SharePoint list "${MS_CONFIG.CONFIRMATIONS_LIST_NAME}" doesn't exist yet. ` +
      `Ask IT to create it (see docs/DEPLOY.md).`,
  );
  err.statusCode = 404;
  return err;
}

async function confirmationsBase(token: string): Promise<string> {
  const siteId = await resolveSiteId(token);
  try {
    const listId = await resolveListIdByName(token, siteId, MS_CONFIG.CONFIRMATIONS_LIST_NAME);
    return `${GRAPH}/sites/${siteId}/lists/${listId}/items`;
  } catch (err: any) {
    if (err?.statusCode === 404) throw missingListError();
    throw err;
  }
}

export async function submitConfirmation(
  token: string,
  data: { assetId: string; custodyId: string; assetName: string },
): Promise<void> {
  const base = await confirmationsBase(token);
  const res = await fetch(base, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: {
        Title: data.assetId,
        CustodyId: data.custodyId,
        AssetName: data.assetName,
        ConfirmedAt: new Date().toISOString(),
      },
    }),
  });
  if (res.status === 403 || res.status === 401) {
    const err: any = new Error(
      "You don't have permission to record confirmations. Ask IT to give staff Contribute access to the Asset Confirmations list.",
    );
    err.statusCode = res.status;
    throw err;
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err: any = new Error(`Could not record your confirmation (HTTP ${res.status}). ${body}`.trim());
    err.statusCode = res.status;
    throw err;
  }
}

function toConfirmation(item: any): Confirmation | null {
  const f = item?.fields || {};
  const assetId = String(f.Title || "").trim();
  const custodyId = String(f.CustodyId || "").trim();
  if (!assetId || !custodyId) return null;
  const user = item?.createdBy?.user || {};
  return {
    id: String(item.id),
    assetId,
    custodyId,
    confirmedAt: String(f.ConfirmedAt || item.createdDateTime || ""),
    createdByEmail: String(user.email || user.userPrincipalName || "").trim(),
    createdByName: String(user.displayName || "").trim(),
  };
}

/** All confirmations. A missing list simply means none yet. */
export async function fetchConfirmations(token: string): Promise<Confirmation[]> {
  let base: string;
  try {
    base = await confirmationsBase(token);
  } catch (err: any) {
    if (err?.statusCode === 404) return [];
    throw err;
  }
  const out: Confirmation[] = [];
  let next: string | null = `${base}?expand=fields&$top=500`;
  let pages = 0;
  while (next && pages < 20) {
    pages++;
    const res: Response = await fetch(next, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Could not load confirmations (HTTP ${res.status})`);
    const data: any = await res.json();
    for (const item of data.value || []) {
      const c = toConfirmation(item);
      if (c) out.push(c);
    }
    next = data["@odata.nextLink"] || null;
  }
  return out;
}

const sameEmail = (a?: string, b?: string) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Mark custody records as confirmed. Only a confirmation created by the
 * custody record's own user counts; the earliest valid one wins. Adds a
 * "confirmed" event (derived, not stored) so it shows in the report logs.
 */
export function applyConfirmations(assets: Asset[], confirmations: Confirmation[]): Asset[] {
  if (confirmations.length === 0) return assets;
  const byKey = new Map<string, Confirmation[]>();
  for (const c of confirmations) {
    const key = `${c.assetId.toLowerCase()}|${c.custodyId}`;
    byKey.set(key, [...(byKey.get(key) || []), c]);
  }

  return assets.map((asset) => {
    let changed = false;
    const derived: AssetEvent[] = [];
    const history = (asset.assignmentHistory || []).map((rec) => {
      if (rec.confirmedAt) return rec;
      const candidates = (byKey.get(`${asset.id.toLowerCase()}|${rec.id}`) || [])
        .filter((c) => sameEmail(c.createdByEmail, rec.assigneeEmail))
        .sort((a, b) => a.confirmedAt.localeCompare(b.confirmedAt));
      const match = candidates[0];
      if (!match) return rec;
      changed = true;
      const confirmedBy = match.createdByName || match.createdByEmail;
      derived.push({
        id: `cnf_${match.id}`,
        type: "confirmed",
        at: match.confirmedAt,
        by: confirmedBy,
        assignee: rec.assignee,
        assigneeEmail: rec.assigneeEmail,
      });
      return { ...rec, confirmedAt: match.confirmedAt, confirmedBy };
    });
    if (!changed) return asset;
    const existingIds = new Set((asset.events || []).map((e) => e.id));
    return {
      ...asset,
      assignmentHistory: history,
      events: [...(asset.events || []), ...derived.filter((e) => !existingIds.has(e.id))],
    };
  });
}

/** Link the user opens from the assignment email. */
export function confirmLink(origin: string, assetId: string, custodyId: string): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}/confirm?asset=${encodeURIComponent(assetId)}&custody=${encodeURIComponent(custodyId)}`;
}
