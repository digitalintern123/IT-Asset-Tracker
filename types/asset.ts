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

export interface Asset {
  id: string;
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
  createdAt: string;
  updatedAt: string;
}

export type AssetInput = Omit<Asset, "id" | "createdAt" | "updatedAt">;
