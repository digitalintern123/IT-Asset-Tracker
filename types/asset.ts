export type StandardCategory =
  | "Laptop"
  | "Desktop"
  | "Monitor"
  | "Phone"
  | "Tablet"
  | "Furniture"
  | "Equipment"
  | "Other";

export type AssetCategory = StandardCategory | (string & {});

// "new" = brand-new device, never assigned. "retired" is shown as "Out of Order";
// the key is kept so existing SharePoint items need no migration.
export type AssetStatus = "new" | "in_use" | "available" | "maintenance" | "retired";

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
  assigneeEmail?: string;
  approvedBy?: string;
  /** Set when the user confirmed receipt (from the Asset Confirmations list). */
  confirmedAt?: string;
  confirmedBy?: string;
}

export type AssetEventType =
  | "created"
  | "assigned"
  | "returned"
  | "status_changed"
  | "reassign_requested"
  | "reassign_approved"
  | "reassign_rejected"
  | "confirmed";

/** One entry in an asset's audit trail (the report logs). */
export interface AssetEvent {
  id: string;
  type: AssetEventType;
  at: string;
  by: string;
  assignee?: string;
  assigneeEmail?: string;
  approvedBy?: string;
  fromStatus?: AssetStatus;
  toStatus?: AssetStatus;
  notes?: string;
}

export type ApprovalActionType = "delete" | "reassign" | "edit";
export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface ApprovalRequest {
  id: string;
  action: ApprovalActionType;
  status: ApprovalStatus;
  requesterName: string;
  requesterEmail: string;
  requestedAt: string;
  reason: string;
  pendingChanges?: Partial<AssetInput> & { assigneeEmail?: string };
  approverName?: string;
  approverEmail?: string;
  decidedAt?: string;
  decisionNotes?: string;
}

export interface Asset {
  id: string;
  spItemId?: string;
  /** Host name (SharePoint Title). */
  name: string;
  make?: string;
  model?: string;
  category: AssetCategory;
  serialNumber: string;
  status: AssetStatus;
  assignee: string;
  location: string;
  /** Company the device belongs to (SharePoint "Vertical" column). */
  vertical?: string;
  purchaseDate: string;
  purchasePrice: number;
  warrantyExpiry: string | null;
  notes: string;
  assignmentHistory?: AssignmentRecord[];
  events?: AssetEvent[];
  approvalRequest?: ApprovalRequest;
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
