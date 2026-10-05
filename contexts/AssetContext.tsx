import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useAuth } from "@/contexts/AuthContext";
import { MS_CONFIG, isMsConfigured } from "@/lib/msConfig";
import type {
  Asset,
  AssetCategory,
  AssetInput,
  AssetStatus,
  QueuedMutation,
} from "@/types/asset";

const STORAGE_KEY = "@asset-tracker/assets/v2";
const QUEUE_STORAGE_KEY = "@asset-tracker/mutation-queue/v1";
const GRAPH = "https://graph.microsoft.com/v1.0";

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function mapCategory(raw: string): AssetCategory {
  const c = (raw || "").trim().toLowerCase();
  if (c.includes("laptop") || c.includes("macbook") || c.includes("thinkpad")) return "Laptop";
  if (c.includes("desktop") || c.includes("pc") || c.includes("imac")) return "Desktop";
  if (c.includes("monitor") || c.includes("screen") || c.includes("display")) return "Monitor";
  if (c.includes("phone") || c.includes("iphone") || c.includes("mobile")) return "Phone";
  if (c.includes("tablet") || c.includes("ipad")) return "Tablet";
  if (c.includes("furniture") || c.includes("chair") || c.includes("desk")) return "Furniture";
  if (c.includes("equip") || c.includes("network") || c.includes("server") || c.includes("printer")) return "Equipment";
  return "Other";
}

function mapStatus(raw: string): AssetStatus {
  const s = (raw || "").trim().toLowerCase();
  if (s.includes("use") || s.includes("issue") || s.includes("assigned")) return "in_use";
  if (s.includes("maint") || s.includes("repair")) return "maintenance";
  if (s.includes("retir") || s.includes("dispos")) return "retired";
  return "available";
}

function mapSpItemToAsset(item: any): Asset {
  const f = item.fields || item;
  return {
    id: String(f.AssetId || f.AssetID || item.id || f.id || f.ID || generateId()),
    spItemId: item.id ? String(item.id) : undefined,
    name: String(f.Title || f.ComputerName || f.AssetID || f.name || "Unknown"),
    category: mapCategory(f.Category || f.AssetType || "Other"),
    serialNumber: String(f.SerialNumber || f.Serial_x0020_Number || ""),
    status: mapStatus(f.Status || f.AssetStatus || "available"),
    assignee: String(f.AssignedTo?.Title || f.Assign || f.Assignee || (typeof f.AssignedTo === "string" ? f.AssignedTo : "") || ""),
    location: String(f.Location || ""),
    purchaseDate: String(f.PurchaseDate || ""),
    purchasePrice: Number(f.PurchasePrice) || 0,
    warrantyExpiry: f.WarrantyExpiry ? String(f.WarrantyExpiry) : null,
    notes: String(f.Notes || f.Description || ""),
    createdAt: String(f.Created || item.createdDateTime || new Date().toISOString()),
    updatedAt: String(f.Modified || item.lastModifiedDateTime || new Date().toISOString()),
    _syncStatus: "synced",
  };
}

function assetToSpFields(asset: Asset): Record<string, unknown> {
  return {
    Title: asset.name,
    Category: asset.category,
    SerialNumber: asset.serialNumber || "",
    Status: asset.status,
    Assignee: asset.assignee || "",
    Location: asset.location || "",
    PurchaseDate: asset.purchaseDate || "",
    PurchasePrice: asset.purchasePrice || 0,
    WarrantyExpiry: asset.warrantyExpiry || "",
    Notes: asset.notes || "",
    AssetId: asset.id,
  };
}

const SAMPLE_ASSETS: Asset[] = [
  {
    id: "seed-1",
    name: 'MacBook Pro 16"',
    category: "Laptop",
    serialNumber: "C02XJ1234567",
    status: "in_use",
    assignee: "Sarah Chen",
    location: "HQ — Floor 3",
    purchaseDate: "2024-03-12",
    purchasePrice: 2499,
    warrantyExpiry: "2027-03-12",
    notes: "Engineering primary workstation.",
    createdAt: new Date("2024-03-12").toISOString(),
    updatedAt: new Date("2024-03-12").toISOString(),
    _syncStatus: "synced",
  },
  {
    id: "seed-2",
    name: "Dell UltraSharp 27",
    category: "Monitor",
    serialNumber: "CN-0H5JK4-987",
    status: "available",
    assignee: "",
    location: "IT Storage — B2",
    purchaseDate: "2023-11-04",
    purchasePrice: 549,
    warrantyExpiry: "2026-11-04",
    notes: "",
    createdAt: new Date("2023-11-04").toISOString(),
    updatedAt: new Date("2023-11-04").toISOString(),
    _syncStatus: "synced",
  },
  {
    id: "seed-3",
    name: "iPhone 15 Pro",
    category: "Phone",
    serialNumber: "F2LXC9PQRS",
    status: "in_use",
    assignee: "Marcus Wong",
    location: "Remote — NY",
    purchaseDate: "2024-09-22",
    purchasePrice: 1199,
    warrantyExpiry: "2025-09-22",
    notes: "Sales team device.",
    createdAt: new Date("2024-09-22").toISOString(),
    updatedAt: new Date("2024-09-22").toISOString(),
    _syncStatus: "synced",
  },
];

interface AssetContextValue {
  assets: Asset[];
  loaded: boolean;
  syncing: boolean;
  syncError: string | null;
  pendingSyncCount: number;
  getAsset: (id: string) => Asset | undefined;
  addAsset: (input: AssetInput) => Promise<Asset>;
  updateAsset: (id: string, input: AssetInput) => Promise<Asset | undefined>;
  deleteAsset: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
  loadSamples: () => Promise<void>;
  syncFromSharePoint: () => Promise<void>;
  flushQueue: () => Promise<void>;
}

const AssetContext = createContext<AssetContextValue | undefined>(undefined);

export function AssetProvider({ children }: { children: React.ReactNode }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [queue, setQueue] = useState<QueuedMutation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const { user } = useAuth();

  // Cached Microsoft Graph resource IDs
  const siteIdRef = useRef<string | null>(null);
  const listIdRef = useRef<string | null>(null);
  const isFlushingRef = useRef<boolean>(false);

  // 1. Initial hydration from local AsyncStorage
  useEffect(() => {
    (async () => {
      try {
        const [rawAssets, rawQueue] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(QUEUE_STORAGE_KEY),
        ]);

        if (rawQueue) {
          try {
            setQueue(JSON.parse(rawQueue) as QueuedMutation[]);
          } catch {}
        }

        if (rawAssets) {
          const parsed = JSON.parse(rawAssets) as Asset[];
          setAssets(parsed);
        } else {
          // If no user is logged in, show sample assets
          setAssets(SAMPLE_ASSETS);
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(SAMPLE_ASSETS));
        }
      } catch {
        setAssets(SAMPLE_ASSETS);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // Save assets to local replica
  const persistAssets = useCallback(async (next: Asset[]) => {
    setAssets(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  // Save mutation queue to local storage
  const persistQueue = useCallback(async (nextQueue: QueuedMutation[]) => {
    setQueue(nextQueue);
    await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(nextQueue));
  }, []);

  // Enqueue a local mutation for background synchronization
  const enqueueMutation = useCallback(
    async (action: "create" | "update" | "delete", asset: Asset) => {
      const mutation: QueuedMutation = {
        id: generateId(),
        action,
        asset,
        timestamp: Date.now(),
        retryCount: 0,
      };
      const updatedQueue = [...queue.filter((q) => q.asset.id !== asset.id || q.action !== action), mutation];
      await persistQueue(updatedQueue);
      return mutation;
    },
    [queue, persistQueue]
  );

  // Resolve SharePoint site and list IDs via Microsoft Graph
  const resolveGraphIds = useCallback(
    async (token: string): Promise<{ siteId: string; listId: string }> => {
      if (siteIdRef.current && listIdRef.current) {
        return { siteId: siteIdRef.current, listId: listIdRef.current };
      }

      const url = new URL(MS_CONFIG.SHAREPOINT_SITE_URL);
      const hostname = url.hostname;
      const sitePath = url.pathname.replace(/^\/|\/$/g, "");
      const siteEndpoint = sitePath
        ? `${GRAPH}/sites/${hostname}:/${sitePath}`
        : `${GRAPH}/sites/${hostname}`;

      const siteRes = await fetch(siteEndpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!siteRes.ok) {
        throw new Error(`Graph failed to resolve site (${siteRes.status})`);
      }
      const siteData = await siteRes.json();
      const siteId = siteData.id;
      siteIdRef.current = siteId;

      let listId: string | null = null;
      const filterUrl = `${GRAPH}/sites/${siteId}/lists?$filter=displayName eq '${encodeURIComponent(MS_CONFIG.LIST_NAME)}'`;
      const listRes = await fetch(filterUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (listRes.ok) {
        const listData = await listRes.json();
        if (listData.value && listData.value.length > 0) {
          listId = listData.value[0].id;
        }
      }

      if (!listId) {
        const allListsRes = await fetch(`${GRAPH}/sites/${siteId}/lists`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (allListsRes.ok) {
          const allData = await allListsRes.json();
          const target = MS_CONFIG.LIST_NAME.trim().toLowerCase();
          const match = (allData.value || []).find(
            (l: any) =>
              (l.displayName && l.displayName.trim().toLowerCase() === target) ||
              (l.name && l.name.trim().toLowerCase() === target)
          );
          if (match) listId = match.id;
        }
      }

      if (!listId) {
        throw new Error(`SharePoint list "${MS_CONFIG.LIST_NAME}" not found`);
      }

      listIdRef.current = listId;
      return { siteId, listId };
    },
    []
  );

  // Helper: Find SharePoint internal Item ID by AssetId field
  const findSpItemId = useCallback(
    async (token: string, siteId: string, listId: string, assetId: string): Promise<string | null> => {
      const url = `${GRAPH}/sites/${siteId}/lists/${listId}/items?expand=fields&$filter=fields/AssetId eq '${assetId}'`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        return data.value?.[0]?.id ?? null;
      }
      return null;
    },
    []
  );

  // Flush the offline mutation queue to SharePoint
  const flushQueue = useCallback(async () => {
    if (!user?.accessToken || !isMsConfigured() || queue.length === 0 || isFlushingRef.current) {
      return;
    }

    isFlushingRef.current = true;
    const remainingQueue: QueuedMutation[] = [];
    let updatedAssets = [...assets];

    try {
      const { siteId, listId } = await resolveGraphIds(user.accessToken);

      for (const item of queue) {
        try {
          if (item.action === "create") {
            const createRes = await fetch(`${GRAPH}/sites/${siteId}/lists/${listId}/items`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${user.accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ fields: assetToSpFields(item.asset) }),
            });
            if (createRes.ok) {
              const createdData = await createRes.json();
              updatedAssets = updatedAssets.map((a) =>
                a.id === item.asset.id
                  ? { ...a, spItemId: createdData.id, _syncStatus: "synced" }
                  : a
              );
            } else {
              remainingQueue.push({ ...item, retryCount: item.retryCount + 1 });
            }
          } else if (item.action === "update") {
            let targetId = item.asset.spItemId;
            if (!targetId) {
              targetId = (await findSpItemId(user.accessToken, siteId, listId, item.asset.id)) || undefined;
            }
            if (targetId) {
              const patchRes = await fetch(`${GRAPH}/sites/${siteId}/lists/${listId}/items/${targetId}/fields`, {
                method: "PATCH",
                headers: {
                  Authorization: `Bearer ${user.accessToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(assetToSpFields(item.asset)),
              });
              if (patchRes.ok) {
                updatedAssets = updatedAssets.map((a) =>
                  a.id === item.asset.id ? { ...a, _syncStatus: "synced" } : a
                );
              } else {
                remainingQueue.push({ ...item, retryCount: item.retryCount + 1 });
              }
            } else {
              // Item doesn't exist yet on SharePoint, convert to create
              remainingQueue.push({ ...item, action: "create" });
            }
          } else if (item.action === "delete") {
            let targetId = item.asset.spItemId;
            if (!targetId) {
              targetId = (await findSpItemId(user.accessToken, siteId, listId, item.asset.id)) || undefined;
            }
            if (targetId) {
              const delRes = await fetch(`${GRAPH}/sites/${siteId}/lists/${listId}/items/${targetId}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${user.accessToken}` },
              });
              if (!delRes.ok && delRes.status !== 404) {
                remainingQueue.push({ ...item, retryCount: item.retryCount + 1 });
              }
            }
          }
        } catch {
          remainingQueue.push({ ...item, retryCount: item.retryCount + 1 });
        }
      }

      await persistQueue(remainingQueue);
      await persistAssets(updatedAssets);
    } catch (err: any) {
      console.warn("Queue flush error:", err?.message);
    } finally {
      isFlushingRef.current = false;
    }
  }, [user?.accessToken, queue, assets, resolveGraphIds, findSpItemId, persistQueue, persistAssets]);

  // Synchronize master data from SharePoint
  const syncFromSharePoint = useCallback(async () => {
    if (!user?.accessToken || !isMsConfigured()) return;
    setSyncing(true);
    setSyncError(null);

    try {
      // 1. Flush any pending mutations first
      if (queue.length > 0) {
        await flushQueue();
      }

      // 2. Fetch authoritative master list from SharePoint
      const { siteId, listId } = await resolveGraphIds(user.accessToken);
      const itemsUrl = `${GRAPH}/sites/${siteId}/lists/${listId}/items?expand=fields&$top=500`;

      const resp = await fetch(itemsUrl, {
        headers: {
          Authorization: `Bearer ${user.accessToken}`,
          Accept: "application/json",
        },
      });

      if (!resp.ok) {
        throw new Error(`SharePoint error: HTTP ${resp.status}`);
      }

      const data = await resp.json();
      const serverItems: Asset[] = (data.value || []).map(mapSpItemToAsset);

      // 3. Reconcile server master with local optimistic pending items
      const pendingCreates = assets.filter((a) => a._syncStatus === "pending_create");
      const pendingUpdates = new Map(
        assets.filter((a) => a._syncStatus === "pending_update").map((a) => [a.id, a])
      );
      const pendingDeletes = new Set(
        assets.filter((a) => a._syncStatus === "pending_delete").map((a) => a.id)
      );

      // Merge: server master items, overriding with pending local updates, removing pending deletes
      const reconciled: Asset[] = serverItems
        .filter((spItem) => !pendingDeletes.has(spItem.id))
        .map((spItem) => {
          const pending = pendingUpdates.get(spItem.id);
          return pending ? pending : spItem;
        });

      // Add any locally created assets not yet recorded on server
      const serverIds = new Set(serverItems.map((s) => s.id));
      for (const pending of pendingCreates) {
        if (!serverIds.has(pending.id)) {
          reconciled.unshift(pending);
        }
      }

      // When signed in, completely purge sample/seed assets
      const cleanAssets = reconciled.filter((a) => !a.id.startsWith("seed-"));

      await persistAssets(cleanAssets);
    } catch (e: any) {
      const msg = e?.message || "Failed to sync from SharePoint";
      setSyncError(msg);
      console.warn("SharePoint sync warning:", msg);
    } finally {
      setSyncing(false);
    }
  }, [user?.accessToken, queue, assets, flushQueue, resolveGraphIds, persistAssets]);

  // When user signs in, trigger sync and purge demo assets
  useEffect(() => {
    if (user?.accessToken) {
      syncFromSharePoint();
    }
  }, [user?.accessToken]);

  const getAsset = useCallback(
    (id: string) => assets.find((a) => a.id === id),
    [assets]
  );

  const addAsset = useCallback(
    async (input: AssetInput) => {
      const now = new Date().toISOString();
      const asset: Asset = {
        ...input,
        id: generateId(),
        createdAt: now,
        updatedAt: now,
        _syncStatus: user?.accessToken ? "pending_create" : "synced",
      };

      const updated = [asset, ...assets.filter((a) => !a.id.startsWith("seed-"))];
      await persistAssets(updated);

      if (user?.accessToken && isMsConfigured()) {
        await enqueueMutation("create", asset);
        flushQueue();
      }

      return asset;
    },
    [assets, persistAssets, user?.accessToken, enqueueMutation, flushQueue]
  );

  const updateAsset = useCallback(
    async (id: string, input: AssetInput) => {
      const existing = assets.find((a) => a.id === id);
      if (!existing) return undefined;

      const updatedAsset: Asset = {
        ...existing,
        ...input,
        updatedAt: new Date().toISOString(),
        _syncStatus: user?.accessToken ? "pending_update" : "synced",
      };

      const updatedList = assets.map((a) => (a.id === id ? updatedAsset : a));
      await persistAssets(updatedList);

      if (user?.accessToken && isMsConfigured()) {
        await enqueueMutation("update", updatedAsset);
        flushQueue();
      }

      return updatedAsset;
    },
    [assets, persistAssets, user?.accessToken, enqueueMutation, flushQueue]
  );

  const deleteAsset = useCallback(
    async (id: string) => {
      const existing = assets.find((a) => a.id === id);
      const updatedList = assets.filter((a) => a.id !== id);
      await persistAssets(updatedList);

      if (existing && user?.accessToken && isMsConfigured()) {
        await enqueueMutation("delete", existing);
        flushQueue();
      }
    },
    [assets, persistAssets, user?.accessToken, enqueueMutation, flushQueue]
  );

  const clearAll = useCallback(async () => {
    await persistAssets([]);
    await persistQueue([]);
  }, [persistAssets, persistQueue]);

  const loadSamples = useCallback(async () => {
    await persistAssets(SAMPLE_ASSETS);
  }, [persistAssets]);

  const value = useMemo<AssetContextValue>(
    () => ({
      assets,
      loaded,
      syncing,
      syncError,
      pendingSyncCount: queue.length,
      getAsset,
      addAsset,
      updateAsset,
      deleteAsset,
      clearAll,
      loadSamples,
      syncFromSharePoint,
      flushQueue,
    }),
    [
      assets,
      loaded,
      syncing,
      syncError,
      queue.length,
      getAsset,
      addAsset,
      updateAsset,
      deleteAsset,
      clearAll,
      loadSamples,
      syncFromSharePoint,
      flushQueue,
    ]
  );

  return <AssetContext.Provider value={value}>{children}</AssetContext.Provider>;
}

export function useAssets(): AssetContextValue {
  const ctx = useContext(AssetContext);
  if (!ctx) throw new Error("useAssets must be used within AssetProvider");
  return ctx;
}
