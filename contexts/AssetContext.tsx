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
  makeEvent,
  needsReassignApproval,
  toAssetInput,
} from "@/lib/assetWorkflow";
import { resolveAssetConflict } from "@/lib/conflictResolver";
import {
  MailMessage,
  buildMaintenanceMail,
  buildReassignDecisionMail,
  buildReassignRequestMail,
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
}

const CACHE_KEY = "@encalm/asset_cache_v3";

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

export const DEMO_SAMPLE_ASSETS: Asset[] = [
  {
    id: "ENC-LAP-2026-0001",
    spItemId: "demo-1",
    name: "MacBook Pro 16\" M3",
    category: "Laptop",
    serialNumber: "C02G1234MD6R",
    status: "in_use",
    assignee: "Rahul Sharma",
    location: "T3 Terminal Lounge - Reception",
    purchaseDate: "2024-03-15",
    purchasePrice: 249900,
    warrantyExpiry: "2027-03-15",
    notes: "Assigned to Lounge Duty Manager. Dual external displays.",
    assignmentHistory: [
      {
        id: "hist_1",
        assignee: "Rahul Sharma",
        assignedBy: "IT Administrator",
        assignedAt: "2024-03-16T10:00:00Z",
        location: "T3 Terminal Lounge - Reception",
        notes: "Initial hardware issuance",
      },
    ],
    createdAt: "2024-03-15T00:00:00.000Z",
    updatedAt: "2024-03-16T00:00:00.000Z",
    _syncStatus: "synced",
  },
  {
    id: "ENC-MON-2026-0002",
    spItemId: "demo-2",
    name: "Dell UltraSharp 27\" 4K",
    category: "Monitor",
    serialNumber: "CN0987654321",
    status: "available",
    assignee: "",
    location: "IT Storage - Terminal 3 Basement",
    purchaseDate: "2024-01-10",
    purchasePrice: 48500,
    warrantyExpiry: "2027-01-10",
    notes: "Spares inventory for VIP lounge check-in desks.",
    assignmentHistory: [],
    createdAt: "2024-01-10T00:00:00.000Z",
    updatedAt: "2024-01-10T00:00:00.000Z",
    _syncStatus: "synced",
  },
  {
    id: "ENC-PHN-2026-0003",
    spItemId: "demo-3",
    name: "iPhone 15 Pro",
    category: "Phone",
    serialNumber: "F2LZ7890N6T1",
    status: "maintenance",
    assignee: "Priya Nair",
    location: "Encalm Operations Desk T1",
    purchaseDate: "2023-11-20",
    purchasePrice: 134900,
    warrantyExpiry: "2025-11-20",
    notes: "Battery replacement requested via Apple Authorized Service.",
    assignmentHistory: [
      {
        id: "hist_2",
        assignee: "Priya Nair",
        assignedBy: "IT Lead",
        assignedAt: "2023-11-21T09:30:00Z",
        location: "Encalm Operations Desk T1",
        notes: "Airport Duty Manager device",
      },
    ],
    createdAt: "2023-11-20T00:00:00.000Z",
    updatedAt: "2024-02-01T00:00:00.000Z",
    _syncStatus: "synced",
  },
];

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
  deleteAsset: (id: string) => Promise<void>;
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
    decisionNotes?: string
  ) => Promise<void>;
  refresh: () => Promise<void>;
}

const AssetContext = createContext<AssetContextValue | undefined>(undefined);

export function AssetProvider({ children }: { children: React.ReactNode }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [isOffline, setIsOffline] = useState(!isNetworkOnline());
  const { user, getValidAccessToken } = useAuth();

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

  // 1. Initial hydration from cache
  useEffect(() => {
    (async () => {
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

  // 2. Fetch authoritative asset data from SharePoint or refresh demo sandbox
  const refresh = useCallback(async () => {
    if (user?.isDemo) {
      setSyncing(true);
      setSyncError(null);
      setTimeout(() => {
        setLastSyncedAt(Date.now());
        setSyncing(false);
      }, 300);
      return;
    }

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
      setAssets(serverItems);
      const now = Date.now();
      setLastSyncedAt(now);
      setIsOffline(false);
      await updateCache(serverItems);
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
  }, [user?.accessToken, user?.isDemo, getValidAccessToken, updateCache]);

  // 3. Online/offline network listener and queue drainer
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;

    const handleOnline = async () => {
      setIsOffline(false);
      console.log("Device reconnected online. Replaying pending offline mutations...");
      const token = (await getValidAccessToken()) || user?.accessToken;

      await drainOfflineQueue(async (mutation) => {
        try {
          if (mutation.action === "create") {
            await apiCreateAsset(mutation.asset, token || undefined);
          } else if (mutation.action === "update") {
            const targetId = mutation.asset.spItemId || mutation.asset.id;
            await apiUpdateAsset(targetId, mutation.asset, token || undefined, mutation.etag);
          } else if (mutation.action === "delete") {
            const targetId = mutation.asset.spItemId || mutation.asset.id;
            await apiDeleteAsset(targetId, token || undefined);
          }
          return true;
        } catch {
          return false;
        }
      });

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
    if (user?.accessToken && !user?.isDemo) {
      refresh();
    } else if (user?.isDemo) {
      setLastSyncedAt(Date.now());
      setAssets((prev) => (prev.length > 0 ? prev : DEMO_SAMPLE_ASSETS));
    } else if (!user) {
      // Signed out: show nothing. Demo records must never stand in for
      // corporate data, because they carry real spItemId values (1, 2, 3)
      // and an edit would PATCH those SharePoint list items.
      setAssets([]);
    }
  }, [user?.accessToken, user?.isDemo, refresh]);

  // Multi-key asset lookup
  const getAsset = useCallback(
    (query: string) => assets.find((a) => matchesAsset(a, query)),
    [assets]
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

      // 4. Initial custody history + audit trail
      const { history: initialHistory, events: initialEvents } = eventsForCreate(input, {
        by: user?.name || "IT Staff",
        assigneeEmail: opts?.assigneeEmail,
      });

      const newAsset: Asset = {
        ...input,
        id: stableId,
        spItemId: user?.isDemo ? String(assets.length + 1) : undefined,
        assignmentHistory: initialHistory,
        events: initialEvents,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        _syncStatus: user?.isDemo ? "synced" : isNetworkOnline() ? "synced" : "pending_create",
      };

      // Demo Mode
      if (user?.isDemo) {
        const next = [newAsset, ...assets];
        setAssets(next);
        await updateCache(next);
        return newAsset;
      }

      const token = (await getValidAccessToken()) || user?.accessToken;
      if (!token && !isMsConfigured()) {
        throw new Error(
          "Must be signed in to corporate Microsoft 365 or Demo Mode to create assets."
        );
      }

      // Offline mode handling
      if (!isNetworkOnline()) {
        await enqueueOfflineMutation("create", newAsset);
        const next = [newAsset, ...assets];
        setAssets(next);
        await updateCache(next);
        return newAsset;
      }

      setSyncing(true);
      setSyncError(null);

      try {
        const createdAsset = await apiCreateAsset(newAsset, token || undefined);
        const confirmed: Asset = {
          ...newAsset,
          ...createdAsset,
          id: stableId, // Ensure stable ID is preserved
          assignmentHistory: initialHistory,
          _syncStatus: "synced",
        };
        const next = [confirmed, ...assets];
        setAssets(next);
        await updateCache(next);
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
        const next = [newAsset, ...assets];
        setAssets(next);
        await updateCache(next);
        return newAsset;
      } finally {
        setSyncing(false);
      }
    },
    [user?.accessToken, user?.isDemo, user?.permissions, user?.role, user?.name, assets, getValidAccessToken, updateCache]
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

      const existing = assets.find((a) => matchesAsset(a, id));
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

      // 3. Moving an In Use device to another user needs IT Admin approval.
      //    Nothing changes yet: the device stays with its current user and a
      //    pending reassignment request is recorded instead.
      if (!opts?.approvedBy && needsReassignApproval(existing, input, user?.role === "admin")) {
        const request: ApprovalRequest = {
          id: `appr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          action: "reassign",
          status: "pending",
          requesterName: by,
          requesterEmail: user?.email || "",
          requestedAt: new Date().toISOString(),
          reason: opts?.reason || input.notes || "Reassignment requested",
          pendingChanges: {
            status: "in_use",
            assignee: input.assignee.trim(),
            assigneeEmail: opts?.assigneeEmail,
            location: input.location,
            notes: input.notes,
          },
        };
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
        mails.push(buildReassignRequestMail(existing, request));
      }

      // 4. Custody history + audit trail (report logs). An admin reassigning
      //    an In Use device approves their own change.
      const selfApproved =
        user?.role === "admin" && needsReassignApproval(existing, input, false) ? by : undefined;
      const { history, events: changeEvents } = eventsForUpdate(existing, input, {
        by,
        approvedBy: opts?.approvedBy || selfApproved,
        assigneeEmail: opts?.assigneeEmail,
        reason: opts?.reason,
      });
      const events = [...(existing.events || []), ...changeEvents, ...extraEvents];

      const updatedAsset: Asset = {
        ...existing,
        ...input,
        assignmentHistory: history,
        events,
        updatedAt: new Date().toISOString(),
        _syncStatus: user?.isDemo ? "synced" : isNetworkOnline() ? "synced" : "pending_update",
      };

      if (input.status === "maintenance" && existing.status !== "maintenance") {
        mails.push(buildMaintenanceMail(updatedAsset, input.notes, by));
      }

      // Demo Mode (no real email is sent)
      if (user?.isDemo) {
        const next = assets.map((a) => (matchesAsset(a, id) ? updatedAsset : a));
        setAssets(next);
        await updateCache(next);
        return updatedAsset;
      }

      const token = (await getValidAccessToken()) || user?.accessToken;
      if (!token && !isMsConfigured()) {
        throw new Error(
          "Must be signed in to corporate Microsoft 365 or Demo Mode to update assets."
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
        const next = assets.map((a) => (matchesAsset(a, id) ? updatedAsset : a));
        setAssets(next);
        await updateCache(next);
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

        const next = assets.map((a) => (matchesAsset(a, id) ? merged : a));
        setAssets(next);
        await updateCache(next);
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
          const next = assets.map((a) => (matchesAsset(a, id) ? conflict.mergedAsset : a));
          setAssets(next);
          await updateCache(next);
          sendMails();
          return conflict.mergedAsset;
        }

        // Network error fallback
        if (!isRecoverableNetworkError(err)) {
          console.error("API update rejected by SharePoint:", err);
          setSyncError(err?.message || "SharePoint rejected this update.");
          throw err;
        }
        updatedAsset._syncStatus = "pending_update";
        await enqueueOfflineMutation("update", updatedAsset, existing.etag);
        const next = assets.map((a) => (matchesAsset(a, id) ? updatedAsset : a));
        setAssets(next);
        await updateCache(next);
        sendMails();
        return updatedAsset;
      } finally {
        setSyncing(false);
      }
    },
    [user?.accessToken, user?.isDemo, user?.permissions, user?.role, user?.name, user?.email, assets, getValidAccessToken, updateCache]
  );

  // 6. Delete asset
  const deleteAsset = useCallback(
    async (id: string): Promise<void> => {
      if (user?.permissions && !user.permissions.canDeleteAsset) {
        throw new Error("Unauthorized: Only IT Administrators can permanently delete assets.");
      }

      const existing = assets.find((a) => matchesAsset(a, id));
      if (!existing) return;

      // Demo Mode
      if (user?.isDemo) {
        const next = assets.filter((a) => !matchesAsset(a, id));
        setAssets(next);
        await updateCache(next);
        return;
      }

      const token = (await getValidAccessToken()) || user?.accessToken;
      if (!token && !isMsConfigured()) {
        throw new Error(
          "Must be signed in to corporate Microsoft 365 or Demo Mode to delete assets."
        );
      }

      // Offline mode handling
      if (!isNetworkOnline()) {
        await enqueueOfflineMutation("delete", existing, existing.etag);
        const next = assets.filter((a) => !matchesAsset(a, id));
        setAssets(next);
        await updateCache(next);
        return;
      }

      setSyncing(true);
      setSyncError(null);

      try {
        const targetId = existing.spItemId || existing.id;
        await apiDeleteAsset(targetId, token || undefined);
        const next = assets.filter((a) => !matchesAsset(a, id));
        setAssets(next);
        await updateCache(next);
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
        const next = assets.filter((a) => !matchesAsset(a, id));
        setAssets(next);
        await updateCache(next);
      } finally {
        setSyncing(false);
      }
    },
    [user?.accessToken, user?.isDemo, user?.permissions, assets, getValidAccessToken, updateCache]
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
      const existing = assets.find((a) => matchesAsset(a, id));
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
        { assigneeEmail: data.assigneeEmail, reason: data.reason }
      );
    },
    [assets, updateAsset]
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

      const existing = assets.find((a) => matchesAsset(a, id));
      if (!existing) {
        throw new Error(`Asset ${id} not found.`);
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
      decisionNotes?: string
    ): Promise<void> => {
      const existing = assets.find((a) => matchesAsset(a, id));
      if (!existing || !existing.approvalRequest) {
        return;
      }

      const req = existing.approvalRequest;
      const approver = user?.name || "IT Administrator";
      const decided: ApprovalRequest = {
        ...req,
        status: approved ? "approved" : "rejected",
        approverName: approver,
        approverEmail: user?.email,
        decidedAt: new Date().toISOString(),
        decisionNotes,
      };
      const decisionMail =
        req.action === "reassign"
          ? [buildReassignDecisionMail(existing, decided, approved, approver)]
          : [];

      if (!approved) {
        // Rejected: nothing changes except the recorded decision.
        await updateAsset(
          id,
          { ...toAssetInput(existing), approvalRequest: decided },
          {
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
        await deleteAsset(id);
      } else if (req.action === "reassign" && req.pendingChanges) {
        await updateAsset(
          id,
          {
            ...toAssetInput(existing),
            status: "in_use",
            assignee: req.pendingChanges.assignee || existing.assignee,
            location: req.pendingChanges.location || existing.location,
            approvalRequest: undefined,
          },
          {
            approvedBy: approver,
            assigneeEmail: req.pendingChanges.assigneeEmail,
            reason: req.reason,
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
      } else if (req.action === "edit" && req.pendingChanges) {
        await updateAsset(
          id,
          {
            ...toAssetInput(existing),
            ...req.pendingChanges,
            approvalRequest: undefined,
          },
          { approvedBy: approver }
        );
      }
    },
    [assets, user?.name, user?.email, updateAsset, deleteAsset]
  );

  const value = useMemo<AssetContextValue>(
    () => ({
      assets,
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
      resolveApproval,
      refresh,
    }),
    [
      assets,
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
      resolveApproval,
      refresh,
    ]
  );

  return <AssetContext.Provider value={value}>{children}</AssetContext.Provider>;
}

export function useAssets(): AssetContextValue {
  const ctx = useContext(AssetContext);
  if (!ctx) throw new Error("useAssets must be used within AssetProvider");
  return ctx;
}
