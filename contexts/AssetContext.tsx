import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import { useAuth } from "@/contexts/AuthContext";
import {
  apiCreateAsset,
  apiDeleteAsset,
  apiFetchAll,
  apiUpdateAsset,
} from "@/lib/api";
import { generateStableAssetId, matchesAsset } from "@/lib/assetId";
import {
  eventsForCreate,
  eventsForUpdate,
  isDeleteLocked,
  makeEvent,
  needsAssignmentApproval,
  newCustodyRecords,
  openCustodyRecord,
  toAssetInput,
} from "@/lib/assetWorkflow";
import { applyConfirmations, confirmLink, fetchConfirmations } from "@/lib/confirmations";
import { resolveAssetConflict } from "@/lib/conflictResolver";
import { activeEditGrant, needsEditApproval, visibleAssets } from "@/lib/editAccess";
import { recordError } from "@/lib/errorLog";
import { ITEM_ACCESS_SCOPE, accessPlan, grantItemRead, revokeItemRead } from "@/lib/itemAccess";
import {
  MailMessage,
  buildAssignmentConfirmMail,
  buildMaintenanceMail,
  buildReassignDecisionMail,
  buildReassignRequestMail,
  buildImportApprovalMail,
  buildEditDecisionMail,
  buildEditRequestMail,
  deliverMail,
} from "@/lib/mail";
import { MS_CONFIG, isMsConfigured } from "@/lib/msConfig";
import {
  drainOfflineQueue,
  enqueueOfflineMutation,
  isNetworkOnline,
} from "@/lib/offlineQueue";
import {
  SharePointService,
  createSharePointService,
} from "@/lib/sharepoint";
import { validateStatusTransition } from "@/lib/statusModel";
import type {
  ApprovalRequest,
  Asset,
  AssetEvent,
  AssetInput,
} from "@/types/asset";

function appOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return "https://tracker.encalmhospitality.com";
}

/** "Please confirm" emails for custody records opened by this change. */
function assignmentMails(
  asset: Asset,
  before: Asset["assignmentHistory"],
  after: Asset["assignmentHistory"],
  by: string
): MailMessage[] {
  return newCustodyRecords(before, after)
    .filter((rec) => !!rec.assigneeEmail)
    .map((rec) =>
      buildAssignmentConfirmMail(asset, rec, by, confirmLink(appOrigin(), asset.id, rec.id))
    );
}

/** A pending hand-over request for the approval matrix (IT Asset Admins). */
function newAssignmentRequest(
  requester: { name: string; email?: string },
  pending: NonNullable<ApprovalRequest["pendingChanges"]>,
  reason: string,
  batchId?: string
): ApprovalRequest {
  return {
    id: `appr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    action: "reassign",
    status: "pending",
    requesterName: requester.name,
    requesterEmail: requester.email || "",
    requestedAt: new Date().toISOString(),
    reason,
    pendingChanges: pending,
    ...(batchId ? { batchId } : {}),
  };
}

const PENDING_REQUEST_MESSAGE =
  "This device already has a request waiting for approval. Wait for it to be approved or rejected first.";

const NOT_APPROVER_MESSAGE = "Only members of IT-Asset Approver can approve or reject requests.";

const EDIT_APPROVAL_MESSAGE =
  "Editing this device needs approval. Press Edit, give the reason and send it for approval; once approved you can save one change within 24 hours.";

const CONFIRMATIONS_UNKNOWN_MESSAGE =
  "Couldn't check whether this device's user has confirmed receipt. Please refresh and try again.";

const DELETE_LOCKED_MESSAGE =
  "This device's user has confirmed receipt, so it can't be deleted until it is returned (Available) or marked Out of Order.";

export interface UpdateAssetOptions {
  /** Internal: approval flows apply changes on someone else's behalf. */
  skipPermissionCheck?: boolean;
  /** Set when an IT Admin approved this change (recorded in custody + logs). */
  approvedBy?: string;
  /** Email of the new user, kept in the custody record for notices. */
  assigneeEmail?: string;
  reason?: string;
  extraEvents?: AssetEvent[];
  extraMails?: MailMessage[];
  /** Approved import batch: mark new custody as imported, send no user email. */
  imported?: boolean;
  /** Reassign button: only the custody fields change (always goes for hand-over approval). */
  handOverOnly?: boolean;
}

/** Outcome of setting per-device SharePoint access. */
export interface AccessResult {
  ok: boolean;
  error?: string;
}

// v4: Demo Mode was removed; older caches may hold demo records.
const CACHE_KEY = "@encalm/asset_cache_v4";

/**
 * True only for failures that offline queueing can actually recover from.
 * An HTTP 4xx is a real rejection by SharePoint (bad scope, bad column,
 * bad payload) and must surface to the user instead of being queued.
 */
function isRecoverableNetworkError(err: any): boolean {
  const status = Number(err?.statusCode ?? err?.status ?? 0);
  if (status >= 400 && status < 500) return false;
  if (!isNetworkOnline()) return true;
  return err?.name === "TypeError" || err?.name === "NetworkError";
}

interface CachePayload {
  lastFetched: number;
  items: Asset[];
}

interface AssetContextValue {
  assets: Asset[];
  loaded: boolean;
  syncing: boolean;
  syncError: string | null;
  lastSyncedAt: number | null;
  isOffline: boolean;
  getAsset: (id: string) => Asset | undefined;
  addAsset: (input: AssetInput, opts?: { assigneeEmail?: string }) => Promise<Asset>;
  updateAsset: (
    id: string,
    input: AssetInput,
    opts?: UpdateAssetOptions
  ) => Promise<Asset | undefined>;
  deleteAsset: (id: string, opts?: { skipPermissionCheck?: boolean }) => Promise<void>;
  reassignAsset: (
    id: string,
    data: {
      newAssignee: string;
      assigneeEmail?: string;
      location?: string;
      reason?: string;
    }
  ) => Promise<Asset | undefined>;
  requestApproval: (
    id: string,
    request: Omit<import("@/types/asset").ApprovalRequest, "id" | "requestedAt" | "status">
  ) => Promise<Asset | undefined>;
  resolveApproval: (
    id: string,
    approved: boolean,
    decisionNotes?: string,
    opts?: { skipAccess?: boolean }
  ) => Promise<AccessResult | void>;
  /** Technician: ask an IT-Asset Approver for permission to edit a device. */
  requestEditAccess: (id: string, reason: string) => Promise<Asset | undefined>;
  /** Give/remove per-device SharePoint Read so staff see only their own devices. */
  syncDeviceAccess: (
    ids?: string[],
    onProgress?: (done: number, total: number) => void
  ) => Promise<{ done: number; failed: { id: string; error: string }[] }>;
  /** Approve/reject all pending hand-overs of one import batch at once. */
  resolveApprovalBatch: (
    batchId: string,
    approved: boolean,
    decisionNotes?: string,
    onProgress?: (done: number, total: number) => void
  ) => Promise<{ done: number; failed: { id: string; error: string }[]; access?: { failed: number } }>;
  refresh: () => Promise<void>;
  /** One-time inventory import: creates assets in order, no emails. */
  importAssets: (
    rows: { input: AssetInput; assigneeEmail?: string }[],
    onProgress?: (done: number) => void
  ) => Promise<{ ok: boolean; id?: string; error?: string; pending?: boolean }[]>;
  /** Email the current user the hand-over confirmation request again. */
  sendConfirmationRequest: (id: string) => Promise<"sent" | "draft" | "failed">;
}

const AssetContext = createContext<AssetContextValue | undefined>(undefined);

export function AssetProvider({ children }: { children: React.ReactNode }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  // Latest asset list for async mutations: callbacks created before an
  // earlier save finished must not write back a stale copy of the list.
  const assetsRef = useRef<Asset[]>([]);
  assetsRef.current = assets;
  // False when the Asset Confirmations list couldn't be read on the last
  // load: the delete lock then can't be known, so deletes are refused.
  const confirmationsLoadedRef = useRef(true);
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  // Keep sync/save problems in the on-device log (Settings → Diagnostics).
  useEffect(() => {
    if (syncError) recordError("sync", syncError);
  }, [syncError]);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [isOffline, setIsOffline] = useState(!isNetworkOnline());
  const { user, getValidAccessToken, getTokenForScopes } = useAuth();
  // SharePoint token for per-device permissions (requested once, ~1 hour).
  const accessTokenRef = useRef<{ token: string; at: number } | null>(null);

  const spServiceRef = useRef<SharePointService | null>(null);

  // Helper: write read cache to AsyncStorage
  const updateCache = useCallback(async (items: Asset[]) => {
    try {
      const payload: CachePayload = {
        lastFetched: Date.now(),
        items,
      };
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    } catch {
      // Ephemeral cache write failure is non-fatal
    }
  }, []);

  /** Apply a change to the latest list, then persist it. */
  const commitAssets = useCallback(
    async (change: (list: Asset[]) => Asset[]) => {
      const next = change(assetsRef.current);
      assetsRef.current = next;
      setAssets(next);
      await updateCache(next);
    },
    [updateCache]
  );

  // 1. Initial hydration from cache
  useEffect(() => {
    (async () => {
      // Drop the old cache, which could hold Demo Mode sample devices.
      AsyncStorage.removeItem("@encalm/asset_cache_v3").catch(() => {});
      try {
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        if (raw) {
          const payload = JSON.parse(raw) as CachePayload;
          setAssets(payload.items || []);
          setLastSyncedAt(payload.lastFetched || null);
        } else {
          setAssets([]);
        }
      } catch {
        setAssets([]);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // 2. Fetch authoritative asset data from SharePoint
  const refresh = useCallback(async () => {
    const token = (await getValidAccessToken()) || user?.accessToken;
    if (!token && !isMsConfigured()) {
      return;
    }

    if (!isNetworkOnline()) {
      setIsOffline(true);
      return;
    }

    setSyncing(true);
    setSyncError(null);

    try {
      const serverItems = await apiFetchAll(token || undefined);
      // Mark custody records the users have confirmed (non-fatal if unavailable).
      let items = serverItems;
      if (token) {
        try {
          items = applyConfirmations(serverItems, await fetchConfirmations(token));
          confirmationsLoadedRef.current = true;
        } catch (confirmErr) {
          console.warn("Could not load assignment confirmations:", confirmErr);
          confirmationsLoadedRef.current = false;
        }
      }
      setAssets(items);
      const now = Date.now();
      setLastSyncedAt(now);
      setIsOffline(false);
      await updateCache(items);
    } catch (err: any) {
      const msg = err?.message || "Failed to load assets from SharePoint";
      console.warn("SharePoint load error:", msg);
      setSyncError(msg);
      if (err?.name === "NetworkError" || !isNetworkOnline()) {
        setIsOffline(true);
      }
    } finally {
      setSyncing(false);
    }
  }, [user?.accessToken, getValidAccessToken, updateCache]);

  // 3. Online/offline network listener and queue drainer
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;

    const handleOnline = async () => {
      setIsOffline(false);
      console.log("Device reconnected online. Replaying pending offline mutations...");
      const token = (await getValidAccessToken()) || user?.accessToken;

      const result = await drainOfflineQueue(async (mutation) => {
        const targetId = mutation.asset.spItemId || mutation.asset.id;
        try {
          if (mutation.action === "create") {
            await apiCreateAsset(mutation.asset, token || undefined);
          } else if (mutation.action === "update") {
            try {
              await apiUpdateAsset(targetId, mutation.asset, token || undefined, mutation.etag);
            } catch (err: any) {
              // Someone else changed the device while this edit was offline:
              // merge (offline values win where both changed) and save again.
              if (err?.statusCode !== 412 || !err?.serverAsset) throw err;
              const merged = resolveAssetConflict(mutation.asset, err.serverAsset as Asset).mergedAsset;
              await apiUpdateAsset(targetId, merged, token || undefined, (err.serverAsset as Asset).etag ?? undefined);
            }
          } else if (mutation.action === "delete") {
            await apiDeleteAsset(targetId, token || undefined);
          }
          return true;
        } catch (err: any) {
          if (isRecoverableNetworkError(err)) return false;
          const status = Number(err?.statusCode) || 0;
          // 4xx (bad data, missing column, permission) won't fix itself.
          return status >= 400 && status < 500 && status !== 408 && status !== 429 ? "permanent" : false;
        }
      });
      if (result.failed > 0) {
        setSyncError(
          `${result.failed} change${result.failed === 1 ? "" : "s"} made while offline couldn't be saved to SharePoint. Please check the device${result.failed === 1 ? "" : "s"} and make the change again.`
        );
      }

      refresh();
    };

    const handleOffline = () => {
      setIsOffline(true);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [user?.accessToken, getValidAccessToken, refresh]);

  // Revalidate when user state changes
  useEffect(() => {
    if (user?.accessToken) {
      refresh();
    } else if (!user) {
      // Signed out: show nothing.
      setAssets([]);
    }
  }, [user?.accessToken, refresh]);

  // Multi-key asset lookup
  // Staff without an app role see only their own devices (SharePoint item
  // permissions trim the same on the server side).
  const shownAssets = useMemo(
    () => visibleAssets(assets, user),
    [assets, user?.seesAll, user?.email]
  );
  const getAsset = useCallback(
    (query: string) => shownAssets.find((a) => matchesAsset(a, query)),
    [shownAssets]
  );

  // 4. Create asset (Strict status + Stable ID + Assignment History + Offline queue)
  const addAsset = useCallback(
    async (input: AssetInput, opts?: { assigneeEmail?: string }): Promise<Asset> => {
      // 1. RBAC check
      if (user?.permissions && !user.permissions.canCreateAsset) {
        throw new Error("Unauthorized: Your role does not allow creating new assets.");
      }

      // 2. Strict Status Lifecycle validation (a new entry starts as "New Device")
      const statusCheck = validateStatusTransition("new", input.status, {
        assignee: input.assignee,
        notes: input.notes,
        isAdmin: user?.role === "admin",
      });
      if (!statusCheck.valid) {
        throw new Error(statusCheck.error);
      }

      // 3. Stable Asset ID generation
      const stableId = generateStableAssetId(input.category, assets);

      // 4. Approval matrix: issuing the new device to someone waits for an
      //    IT Asset Admin. It is registered as a New Device with the request.
      const requester = { name: user?.name || "IT Staff", email: user?.email };
      let createInput = input;
      let approvalRequest: ApprovalRequest | undefined;
      const requestEvents: AssetEvent[] = [];
      if (needsAssignmentApproval(null, input)) {
        approvalRequest = newAssignmentRequest(
          requester,
          {
            status: "in_use",
            assignee: input.assignee.trim(),
            assigneeEmail: opts?.assigneeEmail,
            location: input.location,
          },
          input.notes || "New device hand-over"
        );
        createInput = { ...input, status: "new", assignee: "", approvalRequest };
        requestEvents.push(
          makeEvent("reassign_requested", {
            by: requester.name,
            assignee: input.assignee.trim(),
            assigneeEmail: opts?.assigneeEmail,
            notes: approvalRequest.reason,
          })
        );
      }

      // 5. Initial custody history + audit trail
      const { history: initialHistory, events: initialEvents } = eventsForCreate(createInput, {
        by: user?.name || "IT Staff",
        assigneeEmail: opts?.assigneeEmail,
      });

      const newAsset: Asset = {
        ...createInput,
        id: stableId,
        spItemId: undefined,
        assignmentHistory: initialHistory,
        events: [...initialEvents, ...requestEvents],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        _syncStatus: isNetworkOnline() ? "synced" : "pending_create",
      };

      const token = (await getValidAccessToken()) || user?.accessToken;
      if (!token && !isMsConfigured()) {
        throw new Error(
          "Please sign in with your Encalm Microsoft 365 account to create assets."
        );
      }

      // Offline mode handling
      const sendCreateMails = (saved: Asset) => {
        for (const mail of assignmentMails(saved, [], initialHistory, user?.name || "Encalm IT")) {
          void deliverMail(token, mail);
        }
        if (approvalRequest) void deliverMail(token, buildReassignRequestMail(saved, approvalRequest, appOrigin()));
      };

      if (!isNetworkOnline()) {
        await enqueueOfflineMutation("create", newAsset);
        await commitAssets((list) => [newAsset, ...list]);
        sendCreateMails(newAsset);
        return newAsset;
      }

      setSyncing(true);
      setSyncError(null);

      try {
        const createdAsset = await apiCreateAsset(newAsset, token || undefined);
        const confirmed: Asset = {
          ...newAsset,
          ...createdAsset,
          // SharePoint may have moved to the next free number if another
          // device took this ID meanwhile.
          id: createdAsset?.id || stableId,
          assignmentHistory: initialHistory,
          _syncStatus: "synced",
        };
        await commitAssets((list) => [confirmed, ...list]);
        sendCreateMails(confirmed);
        return confirmed;
      } catch (err: any) {
        if (!isRecoverableNetworkError(err)) {
          console.error("API create rejected by SharePoint:", err);
          setSyncError(err?.message || "SharePoint rejected this asset.");
          throw err;
        }
        console.warn("API create failed (offline), queueing:", err);
        newAsset._syncStatus = "pending_create";
        await enqueueOfflineMutation("create", newAsset);
        await commitAssets((list) => [newAsset, ...list]);
        return newAsset;
      } finally {
        setSyncing(false);
      }
    },
    [user?.accessToken, user?.permissions, user?.role, user?.name, assets, getValidAccessToken, updateCache]
  );

  // 5. Update asset (FSM transitions + History trail + Concurrency handling + Offline queue)
  const updateAsset = useCallback(
    async (
      id: string,
      requestedInput: AssetInput,
      opts?: UpdateAssetOptions
    ): Promise<Asset | undefined> => {
      let input = requestedInput;
      // 1. RBAC check
      if (!opts?.skipPermissionCheck && user?.permissions && !user.permissions.canEditAsset) {
        throw new Error("Unauthorized: Your role does not allow editing assets.");
      }

      const existing = assetsRef.current.find((a) => matchesAsset(a, id));
      if (!existing) {
        throw new Error(`Asset with ID "${id}" not found.`);
      }

      // 2. Strict Status Lifecycle validation
      const statusCheck = validateStatusTransition(existing.status, input.status, {
        assignee: input.assignee,
        notes: input.notes,
        isAdmin: user?.role === "admin",
      });
      if (!statusCheck.valid) {
        throw new Error(statusCheck.error);
      }

      const by = user?.name || "IT Staff";
      const extraEvents: AssetEvent[] = [...(opts?.extraEvents || [])];
      const mails: MailMessage[] = [...(opts?.extraMails || [])];

      // Technicians edit only with an approved edit request (one save within
      // 24 hours). The Reassign button needs none: the hand-over itself
      // always goes for approval.
      const grantRequired = !opts?.skipPermissionCheck && !opts?.approvedBy && needsEditApproval(user);
      const editGrant = grantRequired ? activeEditGrant(existing, user?.email) : null;
      if (grantRequired && !editGrant && !(opts?.handOverOnly && needsAssignmentApproval(existing, input))) {
        throw new Error(EDIT_APPROVAL_MESSAGE);
      }
      if (editGrant) {
        // Used up by this save (a hand-over request below replaces it anyway).
        input = { ...input, approvalRequest: { ...editGrant, consumedAt: new Date().toISOString() } };
      }

      // 3. Approval matrix: handing the device to a person (issue or
      //    reassign) waits for an IT Asset Admin, whoever asks. Nothing changes
      //    yet: the device stays as it is and a pending request is recorded.
      let handOverPending = false;
      if (!opts?.approvedBy && needsAssignmentApproval(existing, input)) {
        handOverPending = true;
        if (existing.approvalRequest?.status === "pending") {
          throw new Error(PENDING_REQUEST_MESSAGE);
        }
        const request = newAssignmentRequest(
          { name: by, email: user?.email },
          {
            status: input.status === "maintenance" ? "maintenance" : "in_use",
            assignee: input.assignee.trim(),
            assigneeEmail: opts?.assigneeEmail,
            location: input.location,
            notes: input.notes,
          },
          opts?.reason || input.notes || "Hand-over requested"
        );
        // Keep the technician's other edits; only the handover waits for approval.
        input = {
          ...input,
          status: existing.status,
          assignee: existing.assignee,
          location: existing.location,
          approvalRequest: request,
        };
        extraEvents.push(
          makeEvent("reassign_requested", {
            by,
            assignee: request.pendingChanges!.assignee,
            assigneeEmail: opts?.assigneeEmail,
            notes: request.reason,
          })
        );
        mails.push(buildReassignRequestMail(existing, request, appOrigin()));
      }

      // 4. Custody history + audit trail (report logs).
      const updated = eventsForUpdate(existing, input, {
        by,
        approvedBy: opts?.approvedBy,
        // The email belongs to the requested new user; while the hand-over
        // waits for approval it must not touch the current holder's record.
        assigneeEmail: handOverPending ? undefined : opts?.assigneeEmail,
        reason: opts?.reason,
      });
      // Approved import batch: recorded as existing (imported) hand-overs,
      // so no confirmation email goes to the user.
      const history = opts?.imported
        ? updated.history.map((r) =>
            (existing.assignmentHistory || []).some((old) => old.id === r.id)
              ? r
              : { ...r, imported: true, notes: "Imported from inventory sheet" }
          )
        : updated.history;
      const changeEvents = updated.events;
      const events = [...(existing.events || []), ...changeEvents, ...extraEvents];

      const updatedAsset: Asset = {
        ...existing,
        ...input,
        assignmentHistory: history,
        events,
        updatedAt: new Date().toISOString(),
        _syncStatus: isNetworkOnline() ? "synced" : "pending_update",
      };

      if (input.status === "maintenance" && existing.status !== "maintenance") {
        mails.push(buildMaintenanceMail(updatedAsset, input.notes, by));
      }
      if (!opts?.imported) {
        mails.push(...assignmentMails(updatedAsset, existing.assignmentHistory, history, by));
      }

      const token = (await getValidAccessToken()) || user?.accessToken;
      if (!token && !isMsConfigured()) {
        throw new Error(
          "Please sign in with your Encalm Microsoft 365 account to update assets."
        );
      }

      // Emails go out once the change is saved (or queued offline).
      const sendMails = () => {
        for (const mail of mails) {
          void deliverMail(token, mail).then((outcome) => {
            if (outcome === "failed") {
              setSyncError(`Could not send "${mail.subject}". Please email it manually.`);
            }
          });
        }
      };

      // Offline mode handling
      if (!isNetworkOnline()) {
        await enqueueOfflineMutation("update", updatedAsset, existing.etag);
        await commitAssets((list) => list.map((a) => (matchesAsset(a, id) ? updatedAsset : a)));
        sendMails();
        return updatedAsset;
      }

      setSyncing(true);
      setSyncError(null);

      try {
        const targetId = existing.spItemId || existing.id;
        const confirmedUpdated = await apiUpdateAsset(
          targetId,
          updatedAsset,
          token || undefined,
          existing.etag
        );

        const merged = {
          ...updatedAsset,
          ...confirmedUpdated,
          assignmentHistory: history,
          events,
          _syncStatus: "synced" as const,
        };

        await commitAssets((list) => list.map((a) => (matchesAsset(a, id) ? merged : a)));
        sendMails();
        return merged;
      } catch (err: any) {
        // Concurrency conflict detection (412 or Conflict)
        if (err?.statusCode === 412 || err?.message?.includes("Conflict")) {
          console.warn("Optimistic concurrency conflict detected. Reconciling...");
          // `existing` is the pre-edit snapshot -> use it as the merge BASE.
          // The server record comes back on the 412; if absent, fall back to
          // the pre-edit copy and keep local edits (conflictResolver else-branch).
          const serverAsset = (err?.serverAsset as Asset) || existing;
          const conflict = resolveAssetConflict(updatedAsset, serverAsset, existing);
          setSyncError(
            conflict.hasConflict
              ? `Conflict on: ${conflict.conflictingFields.join(", ")}. Your values were kept — please review.`
              : "Changes merged with cloud modifications."
          );
          // Save the merged result against the server's current version;
          // emails go out only once SharePoint has the change.
          const mergedAsset = { ...conflict.mergedAsset, _syncStatus: "synced" as const };
          let saved: Asset;
          try {
            const retried = await apiUpdateAsset(
              existing.spItemId || existing.id,
              mergedAsset,
              token || undefined,
              serverAsset.etag
            );
            saved = {
              ...mergedAsset,
              ...retried,
              assignmentHistory: mergedAsset.assignmentHistory,
              events: mergedAsset.events,
              _syncStatus: "synced",
            };
          } catch (retryErr: any) {
            setSyncError(
              "Someone else changed this device at the same time and your edit could not be saved. Please refresh and try again."
            );
            throw retryErr;
          }
          await commitAssets((list) => list.map((a) => (matchesAsset(a, id) ? saved : a)));
          sendMails();
          return saved;
        }

        // Network error fallback
        if (!isRecoverableNetworkError(err)) {
          console.error("API update rejected by SharePoint:", err);
          setSyncError(err?.message || "SharePoint rejected this update.");
          throw err;
        }
        updatedAsset._syncStatus = "pending_update";
        await enqueueOfflineMutation("update", updatedAsset, existing.etag);
        await commitAssets((list) => list.map((a) => (matchesAsset(a, id) ? updatedAsset : a)));
        sendMails();
        return updatedAsset;
      } finally {
        setSyncing(false);
      }
    },
    [user?.accessToken, user?.permissions, user?.role, user?.name, user?.email, user?.isApprover, assets, getValidAccessToken, updateCache]
  );

  /**
   * Per-device SharePoint Read for the current holder; earlier holders lose
   * theirs. Never throws: failures are logged (Settings → Diagnostics).
   */
  const applyDeviceAccess = useCallback(
    async (asset: Asset | undefined): Promise<AccessResult> => {
      if (!asset) return { ok: true };
      const plan = accessPlan(asset.assignmentHistory);
      if (!plan.grant && plan.revoke.length === 0) return { ok: true };
      try {
        let cached = accessTokenRef.current;
        if (!cached || Date.now() - cached.at > 45 * 60 * 1000) {
          cached = { token: await getTokenForScopes([ITEM_ACCESS_SCOPE]), at: Date.now() };
          accessTokenRef.current = cached;
        }
        const itemId = asset.spItemId || "";
        for (const email of plan.revoke) await revokeItemRead(cached.token, itemId, email);
        if (plan.grant) await grantItemRead(cached.token, itemId, plan.grant);
        return { ok: true };
      } catch (err: any) {
        const error = err?.message || "Could not set SharePoint access";
        recordError("access", `${asset.id}: ${error}`);
        return { ok: false, error };
      }
    },
    [getTokenForScopes]
  );

  // 6. Delete asset
  const deleteAsset = useCallback(
    async (id: string, opts?: { skipPermissionCheck?: boolean }): Promise<void> => {
      if (!opts?.skipPermissionCheck && user?.permissions && !user.permissions.canDeleteAsset) {
        throw new Error("Unauthorized: Only IT Administrators can permanently delete assets.");
      }

      const existing = assetsRef.current.find((a) => matchesAsset(a, id));
      if (!existing) return;
      if (isDeleteLocked(existing)) {
        throw new Error(DELETE_LOCKED_MESSAGE);
      }
      if (!confirmationsLoadedRef.current && openCustodyRecord(existing)?.assigneeEmail) {
        throw new Error(CONFIRMATIONS_UNKNOWN_MESSAGE);
      }

      const token = (await getValidAccessToken()) || user?.accessToken;
      if (!token && !isMsConfigured()) {
        throw new Error(
          "Please sign in with your Encalm Microsoft 365 account to delete assets."
        );
      }

      // Offline mode handling
      if (!isNetworkOnline()) {
        await enqueueOfflineMutation("delete", existing, existing.etag);
        await commitAssets((list) => list.filter((a) => !matchesAsset(a, id)));
        return;
      }

      setSyncing(true);
      setSyncError(null);

      try {
        const targetId = existing.spItemId || existing.id;
        await apiDeleteAsset(targetId, token || undefined);
        await commitAssets((list) => list.filter((a) => !matchesAsset(a, id)));
      } catch (err: any) {
        if (!isRecoverableNetworkError(err)) {
          // Re-throw without touching local state, so the list does not show
          // a deletion that did not happen.
          console.error("API delete rejected by SharePoint:", err);
          setSyncError(err?.message || "SharePoint rejected this deletion.");
          throw err;
        }
        console.warn("Delete API failed (offline), enqueuing offline delete:", err);
        await enqueueOfflineMutation("delete", existing, existing.etag);
        await commitAssets((list) => list.filter((a) => !matchesAsset(a, id)));
      } finally {
        setSyncing(false);
      }
    },
    [user?.accessToken, user?.permissions, assets, getValidAccessToken, updateCache]
  );

  // 6. Reassign Asset
  const reassignAsset = useCallback(
    async (
      id: string,
      data: {
        newAssignee: string;
        assigneeEmail?: string;
        location?: string;
        reason?: string;
      }
    ): Promise<Asset | undefined> => {
      const existing = assetsRef.current.find((a) => matchesAsset(a, id));
      if (!existing) {
        throw new Error(`Asset ${id} not found.`);
      }

      // updateAsset closes the old custody record, opens the new one and
      // logs it once (or files an approval request for non-admins).
      return await updateAsset(
        id,
        {
          ...toAssetInput(existing),
          status: "in_use",
          assignee: data.newAssignee,
          location: data.location || existing.location,
        },
        { assigneeEmail: data.assigneeEmail, reason: data.reason, handOverOnly: true }
      );
    },
    [assets, updateAsset]
  );

  // Technician's edit request: the approvers get an Approve / Reject email.
  const requestEditAccess = useCallback(
    async (id: string, reason: string): Promise<Asset | undefined> => {
      if (user?.permissions && !user.permissions.canRequestApproval) {
        throw new Error("Unauthorized: Your role does not allow requesting changes.");
      }
      const existing = assetsRef.current.find((a) => matchesAsset(a, id));
      if (!existing) throw new Error(`Asset ${id} not found.`);
      if (!reason.trim()) throw new Error("Please give the reason for the edit.");
      if (existing.approvalRequest?.status === "pending") throw new Error(PENDING_REQUEST_MESSAGE);
      const by = user?.name || "IT Staff";
      const request: ApprovalRequest = {
        id: `appr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        action: "edit_access",
        status: "pending",
        requesterName: by,
        requesterEmail: user?.email || "",
        requestedAt: new Date().toISOString(),
        reason: reason.trim(),
      };
      return await updateAsset(
        id,
        { ...toAssetInput(existing), approvalRequest: request },
        {
          skipPermissionCheck: true,
          extraEvents: [makeEvent("edit_requested", { by, notes: request.reason })],
          extraMails: [buildEditRequestMail(existing, request, appOrigin())],
        }
      );
    },
    [user?.permissions, user?.name, user?.email, updateAsset]
  );

  // 7. Request Action Approval (Delete, Edit, Reassign)
  const requestApproval = useCallback(
    async (
      id: string,
      request: Omit<import("@/types/asset").ApprovalRequest, "id" | "requestedAt" | "status">
    ): Promise<Asset | undefined> => {
      if (user?.permissions && !user.permissions.canRequestApproval) {
        throw new Error("Unauthorized: Your role does not allow requesting changes.");
      }

      const existing = assetsRef.current.find((a) => matchesAsset(a, id));
      if (!existing) {
        throw new Error(`Asset ${id} not found.`);
      }
      if (existing.approvalRequest?.status === "pending") {
        throw new Error(PENDING_REQUEST_MESSAGE);
      }
      if (
        request.action === "delete" &&
        !confirmationsLoadedRef.current &&
        openCustodyRecord(existing)?.assigneeEmail
      ) {
        throw new Error(CONFIRMATIONS_UNKNOWN_MESSAGE);
      }
      if (request.action === "delete" && isDeleteLocked(existing)) {
        throw new Error(DELETE_LOCKED_MESSAGE);
      }

      const fullRequest: import("@/types/asset").ApprovalRequest = {
        ...request,
        id: `appr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        status: "pending",
        requestedAt: new Date().toISOString(),
      };

      const updatedInput: AssetInput = {
        name: existing.name,
        category: existing.category,
        serialNumber: existing.serialNumber,
        status: existing.status,
        assignee: existing.assignee,
        location: existing.location,
        purchaseDate: existing.purchaseDate,
        purchasePrice: existing.purchasePrice,
        warrantyExpiry: existing.warrantyExpiry,
        notes: existing.notes,
        assignmentHistory: existing.assignmentHistory,
        approvalRequest: fullRequest,
      };

      return await updateAsset(id, updatedInput, { skipPermissionCheck: true });
    },
    [assets, updateAsset, user?.permissions]
  );

  // 8. Resolve Action Approval (Approve / Reject)
  const resolveApproval = useCallback(
    async (
      id: string,
      approved: boolean,
      decisionNotes?: string,
      opts?: { skipAccess?: boolean }
    ): Promise<AccessResult | void> => {
      // Only members of IT-Asset Approver decide (the approval matrix). The
      // SharePoint list permissions enforce the same on the server side.
      if (!user?.isApprover) {
        throw new Error(NOT_APPROVER_MESSAGE);
      }
      const existing = assetsRef.current.find((a) => matchesAsset(a, id));
      if (!existing || !existing.approvalRequest) {
        return;
      }

      const req = existing.approvalRequest;
      if (req.status !== "pending") {
        throw new Error(`This request was already ${req.status}${req.approverName ? ` by ${req.approverName}` : ""}.`);
      }
      const approver = user?.name || "IT Administrator";
      const decided: ApprovalRequest = {
        ...req,
        status: approved ? "approved" : "rejected",
        approverName: approver,
        approverEmail: user?.email,
        decidedAt: new Date().toISOString(),
        decisionNotes,
      };
      // A batch (import) is decided in one go: no email per device.
      const decisionMail =
        req.action === "reassign" && !req.batchId
          ? [buildReassignDecisionMail(existing, decided, approved, approver)]
          : req.action === "edit_access"
          ? [buildEditDecisionMail(existing, decided, approved, approver, appOrigin())]
          : [];

      // Edit request: the decision itself is the grant (approved = one save
      // within 24 hours by the requester).
      if (req.action === "edit_access") {
        await updateAsset(
          id,
          { ...toAssetInput(existing), approvalRequest: decided },
          {
            skipPermissionCheck: true,
            extraEvents: [
              makeEvent(approved ? "edit_approved" : "edit_rejected", {
                by: approver,
                approvedBy: approved ? approver : undefined,
                notes: `Requested by ${req.requesterName}${decisionNotes ? `: ${decisionNotes}` : ""}`,
              }),
            ],
            extraMails: decisionMail,
          }
        );
        return;
      }

      if (!approved) {
        // Rejected: nothing changes except the recorded decision.
        await updateAsset(
          id,
          { ...toAssetInput(existing), approvalRequest: decided },
          {
            skipPermissionCheck: true,
            extraEvents:
              req.action === "reassign"
                ? [
                    makeEvent("reassign_rejected", {
                      by: approver,
                      assignee: req.pendingChanges?.assignee,
                      notes: decisionNotes,
                    }),
                  ]
                : [],
            extraMails: decisionMail,
          }
        );
        return;
      }

      // Approved: Execute the requested action
      if (req.action === "delete") {
        await deleteAsset(id, { skipPermissionCheck: true });
      } else if (req.action === "reassign" && req.pendingChanges) {
        const saved = await updateAsset(
          id,
          {
            ...toAssetInput(existing),
            status: req.pendingChanges.status || "in_use",
            assignee: req.pendingChanges.assignee || existing.assignee,
            location: req.pendingChanges.location || existing.location,
            approvalRequest: undefined,
          },
          {
            skipPermissionCheck: true,
            approvedBy: approver,
            assigneeEmail: req.pendingChanges.assigneeEmail,
            reason: req.reason,
            imported: !!req.pendingChanges.imported,
            extraEvents: [
              makeEvent("reassign_approved", {
                by: approver,
                approvedBy: approver,
                assignee: req.pendingChanges.assignee,
                notes: `Requested by ${req.requesterName}${decisionNotes ? `: ${decisionNotes}` : ""}`,
              }),
            ],
            extraMails: decisionMail,
          }
        );
        // The new user can now read this device in SharePoint; the previous one can't.
        if (!opts?.skipAccess) return await applyDeviceAccess(saved);
      } else if (req.action === "edit" && req.pendingChanges) {
        await updateAsset(
          id,
          {
            ...toAssetInput(existing),
            ...req.pendingChanges,
            approvalRequest: undefined,
          },
          { approvedBy: approver, skipPermissionCheck: true }
        );
      }
    },
    [assets, user?.name, user?.email, user?.isApprover, updateAsset, deleteAsset, applyDeviceAccess]
  );

  /** Re-apply per-device access (all devices, or the given ones). */
  const syncDeviceAccess = useCallback(
    async (
      ids?: string[],
      onProgress?: (done: number, total: number) => void
    ): Promise<{ done: number; failed: { id: string; error: string }[] }> => {
      if (!user?.isApprover && user?.role !== "admin") {
        throw new Error("Only IT-Asset Approver members or IT Administrators can set device access.");
      }
      const targets = assetsRef.current.filter(
        (a) => (!ids || ids.some((id) => matchesAsset(a, id))) && (a.assignmentHistory || []).some((r) => r.assigneeEmail)
      );
      const failed: { id: string; error: string }[] = [];
      let done = 0;
      for (const asset of targets) {
        const r = await applyDeviceAccess(asset);
        if (r.ok) done++;
        else failed.push({ id: asset.id, error: r.error || "Failed" });
        onProgress?.(done + failed.length, targets.length);
        // The first failure is usually a missing permission: stop early.
        if (failed.length === 1 && done === 0) break;
      }
      return { done, failed };
    },
    [user?.isApprover, user?.role, applyDeviceAccess]
  );

  /** Approve or reject every pending request of one import batch. */
  const resolveApprovalBatch = useCallback(
    async (
      batchId: string,
      approved: boolean,
      decisionNotes?: string,
      onProgress?: (done: number, total: number) => void
    ): Promise<{ done: number; failed: { id: string; error: string }[]; access?: { failed: number } }> => {
      if (!user?.isApprover) {
        throw new Error(NOT_APPROVER_MESSAGE);
      }
      const ids = assetsRef.current
        .filter((a) => a.approvalRequest?.batchId === batchId && a.approvalRequest.status === "pending")
        .map((a) => a.id);
      const failed: { id: string; error: string }[] = [];
      let done = 0;
      const handedOver: string[] = [];
      for (const id of ids) {
        try {
          await resolveApproval(id, approved, decisionNotes, { skipAccess: true });
          done++;
          handedOver.push(id);
        } catch (err: any) {
          failed.push({ id, error: err?.message || "Failed" });
        }
        onProgress?.(done + failed.length, ids.length);
      }
      if (!approved || handedOver.length === 0) return { done, failed };
      // Then give each user access to their device (one pass).
      const access = await syncDeviceAccess(handedOver);
      return { done, failed, access: { failed: handedOver.length - access.done } };
    },
    [user?.isApprover, resolveApproval, syncDeviceAccess]
  );

  const importAssets = useCallback(
    async (
      rows: { input: AssetInput; assigneeEmail?: string }[],
      onProgress?: (done: number) => void
    ): Promise<{ ok: boolean; id?: string; error?: string; pending?: boolean }[]> => {
      if (user?.permissions && !user.permissions.canCreateAsset) {
        throw new Error("Unauthorized: Your role does not allow creating new assets.");
      }
      if (!isNetworkOnline()) {
        throw new Error("The import needs an internet connection.");
      }
      const token = (await getValidAccessToken()) || user?.accessToken;
      const by = user?.name || "IT Staff";
      // Work from a running list so each new ID sees the ones created before it.
      let working = [...assetsRef.current];
      const importedAssets: Asset[] = [];
      const results: { ok: boolean; id?: string; error?: string; pending?: boolean }[] = [];
      // Approval matrix: the whole import's hand-overs are approved once.
      const batchId = `imp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const requester = { name: by, email: user?.email };

      setSyncing(true);
      setSyncError(null);
      try {
        for (let i = 0; i < rows.length; i++) {
          const { input: rowInput, assigneeEmail } = rows[i];
          try {
            const id = generateStableAssetId(rowInput.category, working);
            // A row with a user is registered in stock with a pending hand-over
            // in this batch; it becomes In Use once the batch is approved.
            const handOver = needsAssignmentApproval(null, rowInput);
            const input: AssetInput = handOver
              ? {
                  ...rowInput,
                  status: "available",
                  assignee: "",
                  approvalRequest: newAssignmentRequest(
                    requester,
                    {
                      status: "in_use",
                      assignee: rowInput.assignee.trim(),
                      assigneeEmail,
                      location: rowInput.location,
                      imported: true,
                    },
                    "Existing hand-over from the inventory sheet",
                    batchId
                  ),
                }
              : rowInput;
            const created = eventsForCreate(input, { by, assigneeEmail, reason: "Imported from inventory sheet" });
            if (handOver) {
              created.events.push(
                makeEvent("reassign_requested", {
                  by,
                  assignee: rowInput.assignee.trim(),
                  assigneeEmail,
                  notes: "Inventory import — awaiting one-time approval",
                })
              );
            }
            // Legacy hand-overs: never emailed, shown as "Imported — not confirmed".
            const history = created.history.map((rec) => ({
              ...rec,
              imported: true,
              notes: "Imported from inventory sheet",
            }));
            const now = new Date().toISOString();
            let asset: Asset = {
              ...input,
              id,
              spItemId: undefined,
              assignmentHistory: history,
              events: created.events,
              createdAt: now,
              updatedAt: now,
              _syncStatus: "synced",
            };
            const saved = await apiCreateAsset(asset, token || undefined);
            asset = { ...asset, ...saved, id: saved?.id || id, assignmentHistory: history, events: created.events, _syncStatus: "synced" };
            working = [asset, ...working];
            importedAssets.unshift(asset);
            results.push({ ok: true, id: asset.id, pending: handOver });
          } catch (err: any) {
            results.push({ ok: false, error: err?.message || "Failed to save" });
          }
          onProgress?.(i + 1);
        }
      } finally {
        await commitAssets((list) => [...importedAssets, ...list]);
        setSyncing(false);
      }
      // One approval email for every hand-over in this import.
      const pendingDevices = importedAssets
        .filter((a) => a.approvalRequest?.batchId === batchId)
        .reverse()
        .map((a) => ({ name: a.name, id: a.id, assignee: a.approvalRequest?.pendingChanges?.assignee || "" }));
      if (pendingDevices.length) {
        void deliverMail(token, buildImportApprovalMail(batchId, pendingDevices, requester, appOrigin()));
      }
      return results;
    },
    [user?.permissions, user?.accessToken, user?.name, getValidAccessToken, commitAssets]
  );

  const sendConfirmationRequest = useCallback(
    async (id: string): Promise<"sent" | "draft" | "failed"> => {
      const existing = assetsRef.current.find((a) => matchesAsset(a, id));
      const rec = existing ? openCustodyRecord(existing) : undefined;
      if (!existing || !rec?.assigneeEmail) {
        throw new Error("This device has no current user with an email to confirm.");
      }
      if (rec.confirmedAt) throw new Error("The user has already confirmed this device.");
      const token = (await getValidAccessToken()) || user?.accessToken;
      const mail = buildAssignmentConfirmMail(
        existing,
        rec,
        user?.name || "Encalm IT",
        confirmLink(appOrigin(), existing.id, rec.id)
      );
      return deliverMail(token, mail);
    },
    [assets, user?.accessToken, user?.name, getValidAccessToken]
  );

  const value = useMemo<AssetContextValue>(
    () => ({
      assets: shownAssets,
      loaded,
      syncing,
      syncError,
      lastSyncedAt,
      isOffline,
      getAsset,
      addAsset,
      updateAsset,
      deleteAsset,
      reassignAsset,
      requestApproval,
      requestEditAccess,
      resolveApproval,
      resolveApprovalBatch,
      syncDeviceAccess,
      refresh,
      importAssets,
      sendConfirmationRequest,
    }),
    [
      shownAssets,
      loaded,
      syncing,
      syncError,
      lastSyncedAt,
      isOffline,
      getAsset,
      addAsset,
      updateAsset,
      deleteAsset,
      reassignAsset,
      requestApproval,
      requestEditAccess,
      resolveApproval,
      resolveApprovalBatch,
      syncDeviceAccess,
      refresh,
      importAssets,
      sendConfirmationRequest,
    ]
  );

  return <AssetContext.Provider value={value}>{children}</AssetContext.Provider>;
}

export function useAssets(): AssetContextValue {
  const ctx = useContext(AssetContext);
  if (!ctx) throw new Error("useAssets must be used within AssetProvider");
  return ctx;
}
