/**
 * Azure AD (Entra ID) people search for the "Assigned to" picker.
 * Needs the delegated User.ReadBasic.All scope.
 */

export interface DirectoryUser {
  id: string;
  name: string;
  email: string;
  jobTitle?: string;
  department?: string;
}

export type PickerMode = "directory" | "manual";

/** Directory search is used only when it can work; otherwise fall back to manual entry. */
export function pickerModeFor(opts: {
  isDemo?: boolean;
  hasToken: boolean;
  online: boolean;
  lastErrorStatus?: number | null;
  lastErrorWasNetwork?: boolean;
}): PickerMode {
  if (opts.isDemo || !opts.hasToken || !opts.online) return "manual";
  if (opts.lastErrorStatus === 401 || opts.lastErrorStatus === 403) return "manual";
  if (opts.lastErrorWasNetwork) return "manual";
  return "directory";
}

function escapeSearchTerm(q: string): string {
  return q.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export async function searchDirectoryUsers(
  token: string,
  query: string,
  signal?: AbortSignal,
): Promise<DirectoryUser[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const term = escapeSearchTerm(q);
  const params = [
    `$search=${encodeURIComponent(`"displayName:${term}" OR "mail:${term}"`)}`,
    `$select=${encodeURIComponent("id,displayName,mail,userPrincipalName,jobTitle,department")}`,
    "$top=8",
  ].join("&");

  const res = await fetch(`https://graph.microsoft.com/v1.0/users?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      // Required by Graph for $search on directory objects.
      ConsistencyLevel: "eventual",
    },
    signal,
  });

  if (!res.ok) {
    const err: any = new Error(`Directory search failed (HTTP ${res.status})`);
    err.statusCode = res.status;
    throw err;
  }

  const data: any = await res.json();
  const users: DirectoryUser[] = [];
  for (const u of data?.value || []) {
    const email = String(u.mail || u.userPrincipalName || "").trim();
    if (!email || !email.includes("@")) continue;
    users.push({
      id: String(u.id),
      name: String(u.displayName || email),
      email,
      jobTitle: u.jobTitle || undefined,
      department: u.department || undefined,
    });
  }
  return users;
}
