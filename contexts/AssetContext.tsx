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
import type { Asset, AssetCategory, AssetInput, AssetStatus } from "@/types/asset";

const STORAGE_KEY = "@asset-tracker/assets/v1";
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

// Map SharePoint fields (via Microsoft Graph or direct) to Asset type
function mapSpItemToAsset(item: any): Asset {
  const f = item.fields || item;
  return {
    id: String(f.AssetId || f.AssetID || item.id || f.id || f.ID || generateId()),
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
  },
];

interface AssetContextValue {
  assets: Asset[];
  loaded: boolean;
  syncing: boolean;
  syncError: string | null;
  getAsset: (id: string) => Asset | undefined;
  addAsset: (input: AssetInput) => Promise<Asset>;
  updateAsset: (id: string, input: AssetInput) => Promise<Asset | undefined>;
  deleteAsset: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
  loadSamples: () => Promise<void>;
  syncFromSharePoint: () => Promise<void>;
}

const AssetContext = createContext<AssetContextValue | undefined>(undefined);

export function AssetProvider({ children }: { children: React.ReactNode }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const { user } = useAuth();

  // Cached Graph identifiers
  const siteIdRef = useRef<string | null>(null);
  const listIdRef = useRef<string | null>(null);

  // Load from local storage on mount
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          setAssets(JSON.parse(raw) as Asset[]);
        } else {
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

  // Resolve SharePoint site and list IDs via Microsoft Graph
  const resolveGraphIds = useCallback(async (token: string): Promise<{ siteId: string; listId: string }> => {
    if (siteIdRef.current && listIdRef.current) {
      return { siteId: siteIdRef.current, listId: listIdRef.current };
    }

    const url = new URL(MS_CONFIG.SHAREPOINT_SITE_URL);
    const hostname = url.hostname;
    const sitePath = url.pathname.replace(/^\/|\/$/g, "");
    const siteEndpoint = sitePath ? `${GRAPH}/sites/${hostname}:/${sitePath}` : `${GRAPH}/sites/${hostname}`;

    // 1. Get site ID
    const siteRes = await fetch(siteEndpoint, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!siteRes.ok) {
      throw new Error(`Graph failed to resolve SharePoint site (${siteRes.status})`);
    }
    const siteData = await siteRes.json();
    const siteId = siteData.id;
    siteIdRef.current = siteId;

    // 2. Get list ID
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

    // Fallback: list all lists to handle case differences
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
  }, []);

  // Sync from SharePoint via Microsoft Graph API
  const syncFromSharePoint = useCallback(async () => {
    if (!user?.accessToken || !isMsConfigured()) return;
    setSyncing(true);
    setSyncError(null);

    try {
      const { siteId, listId } = await resolveGraphIds(user.accessToken);
      const itemsUrl = `${GRAPH}/sites/${siteId}/lists/${listId}/items?expand=fields&$top=500`;

      const resp = await fetch(itemsUrl, {
        headers: {
          Authorization: `Bearer ${user.accessToken}`,
          Accept: "application/json",
        },
      });

      if (!resp.ok) {
        throw new Error(`SharePoint sync failed: HTTP ${resp.status}`);
      }

      const data = await resp.json();
      const items: Asset[] = (data.value || []).map(mapSpItemToAsset);

      if (items.length > 0) {
        setAssets(items);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      }
    } catch (e: any) {
      const msg = e?.message || "Failed to sync from SharePoint";
      console.warn("SharePoint sync warning:", msg);
      setSyncError(msg);
    } finally {
      setSyncing(false);
    }
  }, [user?.accessToken, resolveGraphIds]);

  // Auto-sync when user logs in with valid access token
  useEffect(() => {
    if (user?.accessToken) {
      syncFromSharePoint();
    }
  }, [user?.accessToken, syncFromSharePoint]);

  const persist = useCallback(async (next: Asset[]) => {
    setAssets(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const getAsset = useCallback(
    (id: string) => assets.find((a) => a.id === id),
    [assets],
  );

  const addAsset = useCallback(
    async (input: AssetInput) => {
      const now = new Date().toISOString();
      const asset: Asset = { ...input, id: generateId(), createdAt: now, updatedAt: now };
      const updatedList = [asset, ...assets];
      await persist(updatedList);

      // Async write-back to SharePoint via Graph API if logged in
      if (user?.accessToken && isMsConfigured()) {
        (async () => {
          try {
            const { siteId, listId } = await resolveGraphIds(user.accessToken);
            await fetch(`${GRAPH}/sites/${siteId}/lists/${listId}/items`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${user.accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ fields: assetToSpFields(asset) }),
            });
          } catch (err) {
            console.warn("Failed to write new asset to SharePoint:", err);
          }
        })();
      }

      return asset;
    },
    [assets, persist, user?.accessToken, resolveGraphIds],
  );

  const updateAsset = useCallback(
    async (id: string, input: AssetInput) => {
      const existing = assets.find((a) => a.id === id);
      if (!existing) return undefined;
      const updated: Asset = { ...existing, ...input, updatedAt: new Date().toISOString() };
      await persist(assets.map((a) => (a.id === id ? updated : a)));

      // Async write-back to SharePoint via Graph API if logged in
      if (user?.accessToken && isMsConfigured()) {
        (async () => {
          try {
            const { siteId, listId } = await resolveGraphIds(user.accessToken);
            // Search for item by AssetId field
            const findUrl = `${GRAPH}/sites/${siteId}/lists/${listId}/items?expand=fields&$filter=fields/AssetId eq '${id}'`;
            const findRes = await fetch(findUrl, {
              headers: { Authorization: `Bearer ${user.accessToken}` },
            });
            if (findRes.ok) {
              const findData = await findRes.json();
              const spItemId = findData.value?.[0]?.id;
              if (spItemId) {
                await fetch(`${GRAPH}/sites/${siteId}/lists/${listId}/items/${spItemId}/fields`, {
                  method: "PATCH",
                  headers: {
                    Authorization: `Bearer ${user.accessToken}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify(assetToSpFields(updated)),
                });
              }
            }
          } catch (err) {
            console.warn("Failed to update asset in SharePoint:", err);
          }
        })();
      }

      return updated;
    },
    [assets, persist, user?.accessToken, resolveGraphIds],
  );

  const deleteAsset = useCallback(
    async (id: string) => {
      await persist(assets.filter((a) => a.id !== id));

      if (user?.accessToken && isMsConfigured()) {
        (async () => {
          try {
            const { siteId, listId } = await resolveGraphIds(user.accessToken);
            const findUrl = `${GRAPH}/sites/${siteId}/lists/${listId}/items?expand=fields&$filter=fields/AssetId eq '${id}'`;
            const findRes = await fetch(findUrl, {
              headers: { Authorization: `Bearer ${user.accessToken}` },
            });
            if (findRes.ok) {
              const findData = await findRes.json();
              const spItemId = findData.value?.[0]?.id;
              if (spItemId) {
                await fetch(`${GRAPH}/sites/${siteId}/lists/${listId}/items/${spItemId}`, {
                  method: "DELETE",
                  headers: { Authorization: `Bearer ${user.accessToken}` },
                });
              }
            }
          } catch (err) {
            console.warn("Failed to delete asset from SharePoint:", err);
          }
        })();
      }
    },
    [assets, persist, user?.accessToken, resolveGraphIds],
  );

  const clearAll = useCallback(async () => {
    await persist([]);
  }, [persist]);

  const loadSamples = useCallback(async () => {
    await persist(SAMPLE_ASSETS);
  }, [persist]);

  const value = useMemo<AssetContextValue>(
    () => ({
      assets,
      loaded,
      syncing,
      syncError,
      getAsset,
      addAsset,
      updateAsset,
      deleteAsset,
      clearAll,
      loadSamples,
      syncFromSharePoint,
    }),
    [
      assets,
      loaded,
      syncing,
      syncError,
      getAsset,
      addAsset,
      updateAsset,
      deleteAsset,
      clearAll,
      loadSamples,
      syncFromSharePoint,
    ],
  );

  return <AssetContext.Provider value={value}>{children}</AssetContext.Provider>;
}

export function useAssets(): AssetContextValue {
  const ctx = useContext(AssetContext);
  if (!ctx) throw new Error("useAssets must be used within AssetProvider");
  return ctx;
}
