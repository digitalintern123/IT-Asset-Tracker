export type EmployeeDepartment =
  | "Lounge Operations"
  | "Guest Relations"
  | "IT Support"
  | "Terminal Operations"
  | "Food & Beverage"
  | "Executive Office"
  | "Finance & Admin";

export type EmployeeStatus = "active" | "onboarding" | "offboarded";

export interface Employee {
  id: string; // e.g. "EMP-1001" or Azure AD ObjectID
  name: string;
  email: string;
  department: EmployeeDepartment;
  designation: string;
  phone?: string;
  location: string;
  status: EmployeeStatus;
  joinedDate: string;
  avatarUrl?: string;
}

export type MaintenanceServiceType =
  | "routine_service"
  | "hardware_repair"
  | "screen_replacement"
  | "battery_swap"
  | "software_reimage"
  | "cleaning";

export type MaintenanceStatus = "scheduled" | "in_progress" | "completed" | "cancelled";

export interface MaintenanceRecord {
  id: string;
  assetId: string;
  assetName: string;
  serviceType: MaintenanceServiceType;
  vendor: string; // e.g. "Apple Authorized Service", "Dell ProSupport", "Airport IT Bench"
  status: MaintenanceStatus;
  scheduledDate: string;
  completedDate?: string | null;
  cost: number; // in ₹ INR
  issueDescription: string;
  resolutionNotes?: string;
  performedBy?: string;
  createdAt: string;
}

export type WarrantyCoverageType = "comprehensive" | "parts_only" | "on_site" | "carry_in";

export interface WarrantyDetails {
  provider: string; // "AppleCare+", "Dell ProSupport Plus", "HP CarePack", "OEM Standard"
  contractNumber?: string;
  startDate?: string;
  expiryDate: string; // YYYY-MM-DD
  supportContact?: string;
  supportPhone?: string;
  coverageType: WarrantyCoverageType;
}

export type WarrantyStatus = "active" | "expiring_soon" | "expired";

export type HandoverType =
  | "assignment"
  | "transfer"
  | "checkin"
  | "onboarding"
  | "offboarding";

export interface HandoverAssetItem {
  id: string;
  name: string;
  serialNumber: string;
  category: string;
  condition: "new" | "excellent" | "good" | "fair";
  notes?: string;
}

export interface HandoverSlip {
  id: string; // e.g. "HO-2026-0001"
  type: HandoverType;
  assetIds: string[];
  assetDetails: HandoverAssetItem[];
  fromPerson?: string;
  toPerson: string;
  toPersonEmail?: string;
  issuedBy: string;
  department: string;
  location: string;
  issuedAt: string;
  termsAccepted: boolean;
  signatureSvgData?: string;
  notes?: string;
}

export interface OnboardingBundlePreset {
  id: string;
  title: string;
  description: string;
  department: EmployeeDepartment;
  recommendedCategories: string[];
}
