/**
 * Per-device SharePoint access: a member of staff can read only the register
 * item of the device issued to them. On an approved hand-over the item gets
 * its own permissions (copied from the list) plus Read for the new user; on a
 * return or reassignment the previous user's Read is removed.
 *
 * Uses the SharePoint REST API with a delegated token for
 * `<site>/AllSites.Manage`. The signed-in user also needs Manage Permissions
 * on the list (Full Control for the IT-Asset Approver group), so this runs in
 * the approver's session. A failure never blocks the hand-over: the caller
 * logs it and an approver can repeat it from Settings → Sync device access.
 */

import { MS_CONFIG } from "@/lib/msConfig";

export const ITEM_ACCESS_SCOPE = `${MS_CONFIG.SHAREPOINT_SITE_URL}/AllSites.Manage`;
/** SharePoint "Read" permission level (SP.RoleType.Reader). */
const READER_ROLE_TYPE = 2;

type Fetch = typeof fetch;

function listItemUrl(itemId: string | number): string {
  const title = MS_CONFIG.LIST_NAME.replace(/'/g, "''");
  return `${MS_CONFIG.SHAREPOINT_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(title)}')/items(${Number(itemId)})`;
}

async function spRequest(token: string, url: string, method: "GET" | "POST", body?: unknown, f: Fetch = fetch): Promise<any> {
  const res = await f(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json;odata=nometadata",
      ...(body !== undefined ? { "Content-Type": "application/json;odata=nometadata" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      detail = j?.["odata.error"]?.message?.value || j?.error?.message || "";
    } catch {
      // keep the status only
    }
    const err: any = new Error(`SharePoint ${res.status}${detail ? `: ${detail}` : ""}`);
    err.statusCode = res.status;
    throw err;
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

function validItem(itemId?: string | number | null): boolean {
  return Number.isInteger(Number(itemId)) && Number(itemId) > 0;
}

/** SharePoint user id for an Entra user (adds them to the site's user list if needed). */
async function principalId(token: string, email: string, f?: Fetch): Promise<number> {
  const r = await spRequest(
    token,
    `${MS_CONFIG.SHAREPOINT_SITE_URL}/_api/web/ensureuser`,
    "POST",
    { logonName: `i:0#.f|membership|${email.trim().toLowerCase()}` },
    f,
  );
  if (typeof r?.Id !== "number") throw new Error(`SharePoint did not return a user for ${email}`);
  return r.Id;
}

async function readerRoleId(token: string, f?: Fetch): Promise<number> {
  const r = await spRequest(
    token,
    `${MS_CONFIG.SHAREPOINT_SITE_URL}/_api/web/roledefinitions/getbytype(${READER_ROLE_TYPE})`,
    "GET",
    undefined,
    f,
  );
  return r.Id;
}

/** Give `email` Read on one register item (breaks inheritance once, keeping IT's access). */
export async function grantItemRead(token: string, itemId: string | number, email: string, f?: Fetch): Promise<void> {
  if (!validItem(itemId)) throw new Error("The device has no SharePoint item yet.");
  const item = listItemUrl(itemId);
  const state = await spRequest(token, `${item}?$select=HasUniqueRoleAssignments`, "GET", undefined, f);
  if (!state?.HasUniqueRoleAssignments) {
    await spRequest(token, `${item}/breakroleinheritance(copyRoleAssignments=true,clearSubscopes=true)`, "POST", undefined, f);
  }
  const [pid, rid] = [await principalId(token, email, f), await readerRoleId(token, f)];
  await spRequest(token, `${item}/roleassignments/addroleassignment(principalid=${pid},roledefid=${rid})`, "POST", undefined, f);
}

/** Remove `email`'s Read on one register item (no-op if the item still inherits). */
export async function revokeItemRead(token: string, itemId: string | number, email: string, f?: Fetch): Promise<void> {
  if (!validItem(itemId)) return;
  const item = listItemUrl(itemId);
  const state = await spRequest(token, `${item}?$select=HasUniqueRoleAssignments`, "GET", undefined, f);
  if (!state?.HasUniqueRoleAssignments) return;
  const [pid, rid] = [await principalId(token, email, f), await readerRoleId(token, f)];
  try {
    await spRequest(token, `${item}/roleassignments/removeroleassignment(principalid=${pid},roledefid=${rid})`, "POST", undefined, f);
  } catch (err: any) {
    // Nothing to remove (already gone) is fine.
    if (err?.statusCode !== 404) throw err;
  }
}

/**
 * Who should and shouldn't have per-device Read on an item: the current
 * holder (open custody record) and every earlier holder that isn't them.
 */
export function accessPlan(history: { assigneeEmail?: string; returnedAt?: string | null }[] = []): {
  grant?: string;
  revoke: string[];
} {
  const norm = (e?: string) => (e || "").trim().toLowerCase();
  const open = [...history].reverse().find((r) => !r.returnedAt);
  const grant = open && /@/.test(norm(open.assigneeEmail)) ? norm(open.assigneeEmail) : undefined;
  const revoke = Array.from(
    new Set(history.filter((r) => r.returnedAt).map((r) => norm(r.assigneeEmail)).filter((e) => /@/.test(e) && e !== grant)),
  );
  return { grant, revoke };
}
