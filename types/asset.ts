export type AssetCategory =
  | "Laptop"
  | "Desktop"
  | "Monitor"
  | "Phone"
  | "Tablet"
  | "Furniture"
  | "Equipment"
  | "Other";

export type AssetStatus = "in_use" | "available" | "maintenance" | "retired";

export type SyncStatus =
  | "synced"
  | "pending_create"
  | "pending_update"
  | "pending_delete";

export interface AssignmentRecord {
  id: string;
  assignee: string;
  assignedBy?: string;
  assignedAt: string;
  returnedAt?: string | null;
  location?: string;
  notes?: string;
}

export interface Asset {
  id: string;
  spItemId?: string;
  name: string;
  category: AssetCategory;
  serialNumber: string;
  status: AssetStatus;
  assignee: string;
  location: string;
  purchaseDate: string;
  purchasePrice: number;
  warrantyExpiry: string | null;
  notes: string;
  assignmentHistory?: AssignmentRecord[];
  etag?: string;
  version?: number;
  createdAt: string;
  updatedAt: string;
  _syncStatus?: SyncStatus;
}

export interface QueuedMutation {
  id: string;
  action: "create" | "update" | "delete";
  asset: Asset;
  timestamp: number;
  retryCount: number;
  etag?: string;
}

export type AssetInput = Omit<
  Asset,
  "id" | "createdAt" | "updatedAt" | "spItemId" | "_syncStatus" | "etag" | "version"
>;
