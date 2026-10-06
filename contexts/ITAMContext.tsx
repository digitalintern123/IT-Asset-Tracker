import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useAssets } from "@/contexts/AssetContext";
import { useAuth } from "@/contexts/AuthContext";
import type { Asset } from "@/types/asset";
import type {
  Employee,
  HandoverAssetItem,
  HandoverSlip,
  HandoverType,
  MaintenanceRecord,
  MaintenanceServiceType,
  OnboardingBundlePreset,
} from "@/types/itam";

const ITAM_STORAGE_KEY = "@encalm/itam_data_v1";

export const DEFAULT_EMPLOYEES: Employee[] = [
  {
    id: "EMP-1001",
    name: "Rahul Sharma",
    email: "rahul.sharma@encalm.com",
    department: "Lounge Operations",
    designation: "Lounge Duty Manager",
    phone: "+91 98101 23456",
    location: "T3 Terminal Lounge - Reception",
    status: "active",
    joinedDate: "2023-01-15",
  },
  {
    id: "EMP-1002",
    name: "Priya Nair",
    email: "priya.nair@encalm.com",
    department: "Terminal Operations",
    designation: "Airport Duty Manager",
    phone: "+91 98202 34567",
    location: "Encalm Operations Desk T1",
    status: "active",
    joinedDate: "2023-05-10",
  },
  {
    id: "EMP-1003",
    name: "Vikram Singh",
    email: "vikram.singh@encalm.com",
    department: "IT Support",
    designation: "Senior IT Support Engineer",
    phone: "+91 98303 45678",
    location: "IT Storage - Terminal 3 Basement",
    status: "active",
    joinedDate: "2022-11-01",
  },
  {
    id: "EMP-1004",
    name: "Amit Verma",
    email: "amit.verma@encalm.com",
    department: "Guest Relations",
    designation: "VIP Guest Relations Lead",
    phone: "+91 98404 56789",
    location: "Encalm Prive Lounge T3",
    status: "active",
    joinedDate: "2023-08-20",
  },
  {
    id: "EMP-1005",
    name: "Sneha Patel",
    email: "sneha.patel@encalm.com",
    department: "Executive Office",
    designation: "Executive Concierge Manager",
    phone: "+91 98505 67890",
    location: "VIP Meet & Greet Terminal 3",
    status: "active",
    joinedDate: "2024-02-01",
  },
  {
    id: "EMP-1006",
    name: "Ananya Roy",
    email: "ananya.roy@encalm.com",
    department: "Food & Beverage",
    designation: "F&B Operations Supervisor",
    phone: "+91 98606 78901",
    location: "Atithya Lounge Dining Hall",
    status: "active",
    joinedDate: "2023-09-12",
  },
];

export const ONBOARDING_PRESETS: OnboardingBundlePreset[] = [
  {
    id: "preset_lounge_mgr",
    title: "Lounge Operations Manager Bundle",
    description: "Standard executive kit: High-performance laptop, smartphone, and communication equipment.",
    department: "Lounge Operations",
    recommendedCategories: ["Laptop", "Phone"],
  },
  {
    id: "preset_guest_relations",
    title: "Guest Relations Concierge Kit",
    description: "Mobile hospitality gear: Tablet with lounge check-in software, barcode scanner.",
    department: "Guest Relations",
    recommendedCategories: ["Tablet", "Equipment"],
  },
  {
    id: "preset_terminal_ops",
    title: "Airport Airside Operations Kit",
    description: "Field rugged gear: Operations smartphone, radio/scanner equipment.",
    department: "Terminal Operations",
    recommendedCategories: ["Phone", "Equipment"],
  },
  {
    id: "preset_it_support",
    title: "IT Engineering & Bench Setup",
    description: "Technical workstation: Laptop, 4K monitor, peripherals.",
    department: "IT Support",
    recommendedCategories: ["Laptop", "Monitor"],
  },
];

export const SAMPLE_MAINTENANCE_RECORDS: MaintenanceRecord[] = [
  {
    id: "maint_101",
    assetId: "ENC-PHN-2026-0003",
    assetName: "iPhone 15 Pro",
    serviceType: "battery_swap",
    vendor: "Apple Authorized Care (Select Citywalk)",
    status: "in_progress",
    scheduledDate: "2026-10-04",
    completedDate: null,
    cost: 8500,
    issueDescription: "Battery health depleted to 74%; intermittent unexpected shutdowns reported by Airport Duty Manager.",
    resolutionNotes: "Diagnostics completed. Replacement battery pack on order.",
    performedBy: "Apple Certified Technician",
    createdAt: "2026-10-04T09:00:00Z",
  },
  {
    id: "maint_102",
    assetId: "ENC-LAP-2026-0001",
    assetName: "MacBook Pro 16\" M3",
    serviceType: "cleaning",
    vendor: "Encalm In-House IT Bench",
    status: "completed",
    scheduledDate: "2026-08-15",
    completedDate: "2026-08-15",
    cost: 1200,
    issueDescription: "Scheduled bi-annual thermal dust clearing and keyboard inspection.",
    resolutionNotes: "Fans de-dusted, thermal paste checked, keyboard sanitized.",
    performedBy: "Vikram Singh (IT Engineer)",
    createdAt: "2026-08-15T11:00:00Z",
  },
];

interface ITAMStoragePayload {
  employees: Employee[];
  maintenance: MaintenanceRecord[];
  handovers: HandoverSlip[];
}

interface ITAMContextValue {
  employees: Employee[];
  maintenance: MaintenanceRecord[];
  handovers: HandoverSlip[];
  loaded: boolean;
  addEmployee: (emp: Omit<Employee, "id">) => Promise<Employee>;
  updateEmployee: (id: string, emp: Partial<Employee>) => Promise<void>;
  assignAsset: (params: {
    assetId: string;
    employeeId: string;
    condition: "new" | "excellent" | "good" | "fair";
    location?: string;
    notes?: string;
  }) => Promise<HandoverSlip>;
  checkInAsset: (params: {
    assetId: string;
    condition: "new" | "excellent" | "good" | "fair";
    returnLocation: string;
    notes?: string;
    sendToMaintenance?: boolean;
    maintenanceReason?: string;
  }) => Promise<HandoverSlip>;
  transferAsset: (params: {
    assetId: string;
    fromEmployeeId: string;
    toEmployeeId: string;
    condition: "new" | "excellent" | "good" | "fair";
    location?: string;
    notes?: string;
  }) => Promise<HandoverSlip>;
  scheduleMaintenance: (record: Omit<MaintenanceRecord, "id" | "createdAt">) => Promise<MaintenanceRecord>;
  completeMaintenance: (params: {
    id: string;
    completedDate: string;
    resolutionNotes: string;
    finalCost?: number;
    returnToStatus: "available" | "in_use";
  }) => Promise<void>;
  onboardEmployee: (params: {
    employeeId: string;
    assetIds: string[];
    condition: "new" | "excellent" | "good" | "fair";
    notes?: string;
  }) => Promise<HandoverSlip>;
  offboardEmployee: (params: {
    employeeId: string;
    items: {
      assetId: string;
      condition: "new" | "excellent" | "good" | "fair";
      routeTo: "available" | "maintenance";
      notes?: string;
    }[];
    clearanceNotes?: string;
  }) => Promise<HandoverSlip>;
  signHandoverSlip: (slipId: string, signatureSvgData: string) => Promise<void>;
  getEmployee: (idOrName: string) => Employee | undefined;
  getEmployeeAssets: (employeeIdOrName: string) => Asset[];
  refreshDirectoryFromGraph: () => Promise<void>;
}

const ITAMContext = createContext<ITAMContextValue | undefined>(undefined);

export function ITAMProvider({ children }: { children: React.ReactNode }) {
  const [employees, setEmployees] = useState<Employee[]>(DEFAULT_EMPLOYEES);
  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>(SAMPLE_MAINTENANCE_RECORDS);
  const [handovers, setHandovers] = useState<HandoverSlip[]>([]);
  const [loaded, setLoaded] = useState(false);

  const { assets, updateAsset } = useAssets();
  const { user, getValidAccessToken } = useAuth();

  // 1. Initial Storage Hydration
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(ITAM_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as ITAMStoragePayload;
          if (parsed.employees && parsed.employees.length > 0) {
            setEmployees(parsed.employees);
          }
          if (parsed.maintenance) {
            setMaintenance(parsed.maintenance);
          }
          if (parsed.handovers) {
            setHandovers(parsed.handovers);
          }
        }
      } catch {
        // Fall back to defaults
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // 2. Persist to storage helper
  const persistState = useCallback(
    async (
      newEmployees: Employee[],
      newMaintenance: MaintenanceRecord[],
      newHandovers: HandoverSlip[]
    ) => {
      try {
        const payload: ITAMStoragePayload = {
          employees: newEmployees,
          maintenance: newMaintenance,
          handovers: newHandovers,
        };
        await AsyncStorage.setItem(ITAM_STORAGE_KEY, JSON.stringify(payload));
      } catch {
        // Ephemeral storage failure non-fatal
      }
    },
    []
  );

  // Helper: Find employee by ID or Name
  const getEmployee = useCallback(
    (idOrName: string): Employee | undefined => {
      if (!idOrName) return undefined;
      const lower = idOrName.toLowerCase().trim();
      return employees.find(
        (e) =>
          e.id.toLowerCase() === lower ||
          e.name.toLowerCase() === lower ||
          e.email.toLowerCase() === lower
      );
    },
    [employees]
  );

  // Helper: Get assets assigned to employee
  const getEmployeeAssets = useCallback(
    (employeeIdOrName: string): Asset[] => {
      if (!employeeIdOrName) return [];
      const emp = getEmployee(employeeIdOrName);
      const targetName = emp ? emp.name.toLowerCase() : employeeIdOrName.toLowerCase();
      const targetId = emp ? emp.id.toLowerCase() : "";

      return assets.filter((a) => {
        if (a.status !== "in_use") return false;
        if (a.employeeId && targetId && a.employeeId.toLowerCase() === targetId) return true;
        if (a.assignee && a.assignee.toLowerCase() === targetName) return true;
        return false;
      });
    },
    [assets, getEmployee]
  );

  // Add Employee
  const addEmployee = useCallback(
    async (empData: Omit<Employee, "id">): Promise<Employee> => {
      const newId = `EMP-${1000 + employees.length + 1}`;
      const newEmp: Employee = { ...empData, id: newId };
      const updated = [newEmp, ...employees];
      setEmployees(updated);
      await persistState(updated, maintenance, handovers);
      return newEmp;
    },
    [employees, maintenance, handovers, persistState]
  );

  // Update Employee
  const updateEmployee = useCallback(
    async (id: string, empData: Partial<Employee>) => {
      const updated = employees.map((e) => (e.id === id ? { ...e, ...empData } : e));
      setEmployees(updated);
      await persistState(updated, maintenance, handovers);
    },
    [employees, maintenance, handovers, persistState]
  );

  // Assign / Check-Out Asset
  const assignAsset = useCallback(
    async ({
      assetId,
      employeeId,
      condition,
      location,
      notes,
    }: {
      assetId: string;
      employeeId: string;
      condition: "new" | "excellent" | "good" | "fair";
      location?: string;
      notes?: string;
    }): Promise<HandoverSlip> => {
      const asset = assets.find((a) => a.id === assetId);
      if (!asset) throw new Error(`Asset ${assetId} not found`);

      const employee = getEmployee(employeeId);
      if (!employee) throw new Error(`Employee ${employeeId} not found`);

      const targetLocation = location || employee.location || asset.location;
      const historyItem = {
        id: `hist_${Date.now()}`,
        assignee: employee.name,
        assignedBy: user?.name || "IT Officer",
        assignedAt: new Date().toISOString(),
        location: targetLocation,
        notes: notes || `Assigned in ${condition} condition.`,
      };

      const existingHistory = asset.assignmentHistory || [];

      // 1. Update Asset
      await updateAsset(asset.id, {
        name: asset.name,
        category: asset.category,
        serialNumber: asset.serialNumber,
        status: "in_use",
        assignee: employee.name,
        employeeId: employee.id,
        location: targetLocation,
        condition,
        purchaseDate: asset.purchaseDate,
        purchasePrice: asset.purchasePrice,
        warrantyExpiry: asset.warrantyExpiry,
        warrantyDetails: asset.warrantyDetails,
        notes: asset.notes,
        assignmentHistory: [historyItem, ...existingHistory],
      });

      // 2. Generate Handover Slip
      const slip: HandoverSlip = {
        id: `HO-${new Date().getFullYear()}-${String(handovers.length + 1).padStart(4, "0")}`,
        type: "assignment",
        assetIds: [asset.id],
        assetDetails: [
          {
            id: asset.id,
            name: asset.name,
            serialNumber: asset.serialNumber,
            category: asset.category,
            condition,
            notes,
          },
        ],
        toPerson: employee.name,
        toPersonEmail: employee.email,
        issuedBy: user?.name || "IT Administration",
        department: employee.department,
        location: targetLocation,
        issuedAt: new Date().toISOString(),
        termsAccepted: true,
        notes,
      };

      const newHandovers = [slip, ...handovers];
      setHandovers(newHandovers);
      await persistState(employees, maintenance, newHandovers);

      return slip;
    },
    [assets, employees, handovers, maintenance, persistState, updateAsset, user, getEmployee]
  );

  // Check-In Asset
  const checkInAsset = useCallback(
    async ({
      assetId,
      condition,
      returnLocation,
      notes,
      sendToMaintenance,
      maintenanceReason,
    }: {
      assetId: string;
      condition: "new" | "excellent" | "good" | "fair";
      returnLocation: string;
      notes?: string;
      sendToMaintenance?: boolean;
      maintenanceReason?: string;
    }): Promise<HandoverSlip> => {
      const asset = assets.find((a) => a.id === assetId);
      if (!asset) throw new Error(`Asset ${assetId} not found`);

      const prevAssignee = asset.assignee || "Staff Member";
      const emp = getEmployee(prevAssignee);

      const updatedHistory = (asset.assignmentHistory || []).map((h, idx) => {
        if (idx === 0 && !h.returnedAt) {
          return {
            ...h,
            returnedAt: new Date().toISOString(),
            notes: (h.notes ? `${h.notes} | ` : "") + `Returned condition: ${condition}. ${notes || ""}`,
          };
        }
        return h;
      });

      const nextStatus = sendToMaintenance ? "maintenance" : "available";

      // 1. Update Asset
      await updateAsset(asset.id, {
        name: asset.name,
        category: asset.category,
        serialNumber: asset.serialNumber,
        status: nextStatus,
        assignee: "",
        employeeId: undefined,
        location: returnLocation,
        condition,
        purchaseDate: asset.purchaseDate,
        purchasePrice: asset.purchasePrice,
        warrantyExpiry: asset.warrantyExpiry,
        warrantyDetails: asset.warrantyDetails,
        notes: (asset.notes ? `${asset.notes}\n` : "") + `Returned on ${new Date().toLocaleDateString("en-IN")}. Condition: ${condition}.`,
        assignmentHistory: updatedHistory,
      });

      // If damaged/service needed, log maintenance
      let updatedMaintenance = maintenance;
      if (sendToMaintenance) {
        const maintRec: MaintenanceRecord = {
          id: `maint_${Date.now()}`,
          assetId: asset.id,
          assetName: asset.name,
          serviceType: "hardware_repair",
          vendor: "Airport IT Support Bench",
          status: "scheduled",
          scheduledDate: new Date().toISOString().slice(0, 10),
          completedDate: null,
          cost: 0,
          issueDescription: maintenanceReason || `Flagged during check-in return (Condition: ${condition}).`,
          performedBy: user?.name || "IT Inspector",
          createdAt: new Date().toISOString(),
        };
        updatedMaintenance = [maintRec, ...maintenance];
        setMaintenance(updatedMaintenance);
      }

      // Generate Return Handover Slip
      const slip: HandoverSlip = {
        id: `HO-${new Date().getFullYear()}-${String(handovers.length + 1).padStart(4, "0")}`,
        type: "checkin",
        assetIds: [asset.id],
        assetDetails: [
          {
            id: asset.id,
            name: asset.name,
            serialNumber: asset.serialNumber,
            category: asset.category,
            condition,
            notes,
          },
        ],
        fromPerson: prevAssignee,
        toPerson: "IT Central Storage",
        toPersonEmail: emp?.email,
        issuedBy: user?.name || "IT Administration",
        department: emp?.department || "Operations",
        location: returnLocation,
        issuedAt: new Date().toISOString(),
        termsAccepted: true,
        notes: sendToMaintenance
          ? `Returned & routed to Maintenance: ${maintenanceReason || "Damage reported"}`
          : "Returned safely to available stock",
      };

      const newHandovers = [slip, ...handovers];
      setHandovers(newHandovers);
      await persistState(employees, updatedMaintenance, newHandovers);

      return slip;
    },
    [assets, employees, handovers, maintenance, persistState, updateAsset, user, getEmployee]
  );

  // Transfer Asset Custody
  const transferAsset = useCallback(
    async ({
      assetId,
      fromEmployeeId,
      toEmployeeId,
      condition,
      location,
      notes,
    }: {
      assetId: string;
      fromEmployeeId: string;
      toEmployeeId: string;
      condition: "new" | "excellent" | "good" | "fair";
      location?: string;
      notes?: string;
    }): Promise<HandoverSlip> => {
      const asset = assets.find((a) => a.id === assetId);
      if (!asset) throw new Error(`Asset ${assetId} not found`);

      const fromEmp = getEmployee(fromEmployeeId);
      const toEmp = getEmployee(toEmployeeId);
      if (!toEmp) throw new Error(`Destination employee not found`);

      const targetLocation = location || toEmp.location || asset.location;

      // Close previous custody
      const updatedHistory = (asset.assignmentHistory || []).map((h, idx) => {
        if (idx === 0 && !h.returnedAt) {
          return {
            ...h,
            returnedAt: new Date().toISOString(),
            notes: (h.notes ? `${h.notes} | ` : "") + `Transferred to ${toEmp.name}`,
          };
        }
        return h;
      });

      // Append new custody
      const newHistoryItem = {
        id: `hist_${Date.now()}`,
        assignee: toEmp.name,
        assignedBy: user?.name || "IT Officer",
        assignedAt: new Date().toISOString(),
        location: targetLocation,
        notes: `Transferred from ${fromEmp?.name || "Previous Holder"}. Condition: ${condition}. ${notes || ""}`,
      };

      // 1. Update Asset
      await updateAsset(asset.id, {
        name: asset.name,
        category: asset.category,
        serialNumber: asset.serialNumber,
        status: "in_use",
        assignee: toEmp.name,
        employeeId: toEmp.id,
        location: targetLocation,
        condition,
        purchaseDate: asset.purchaseDate,
        purchasePrice: asset.purchasePrice,
        warrantyExpiry: asset.warrantyExpiry,
        warrantyDetails: asset.warrantyDetails,
        notes: asset.notes,
        assignmentHistory: [newHistoryItem, ...updatedHistory],
      });

      // 2. Generate Transfer Slip
      const slip: HandoverSlip = {
        id: `HO-${new Date().getFullYear()}-${String(handovers.length + 1).padStart(4, "0")}`,
        type: "transfer",
        assetIds: [asset.id],
        assetDetails: [
          {
            id: asset.id,
            name: asset.name,
            serialNumber: asset.serialNumber,
            category: asset.category,
            condition,
            notes,
          },
        ],
        fromPerson: fromEmp?.name || "Previous Holder",
        toPerson: toEmp.name,
        toPersonEmail: toEmp.email,
        issuedBy: user?.name || "IT Administration",
        department: toEmp.department,
        location: targetLocation,
        issuedAt: new Date().toISOString(),
        termsAccepted: true,
        notes: `Direct custody transfer from ${fromEmp?.name || "Previous Holder"} to ${toEmp.name}.`,
      };

      const newHandovers = [slip, ...handovers];
      setHandovers(newHandovers);
      await persistState(employees, maintenance, newHandovers);

      return slip;
    },
    [assets, employees, handovers, maintenance, persistState, updateAsset, user, getEmployee]
  );

  // Schedule Maintenance
  const scheduleMaintenance = useCallback(
    async (recordData: Omit<MaintenanceRecord, "id" | "createdAt">): Promise<MaintenanceRecord> => {
      const newRecord: MaintenanceRecord = {
        ...recordData,
        id: `maint_${Date.now()}`,
        createdAt: new Date().toISOString(),
      };

      const updated = [newRecord, ...maintenance];
      setMaintenance(updated);

      // Set asset status to maintenance if scheduled or in_progress
      const asset = assets.find((a) => a.id === recordData.assetId);
      if (asset && asset.status !== "maintenance") {
        await updateAsset(asset.id, {
          name: asset.name,
          category: asset.category,
          serialNumber: asset.serialNumber,
          status: "maintenance",
          assignee: asset.assignee,
          location: asset.location,
          purchaseDate: asset.purchaseDate,
          purchasePrice: asset.purchasePrice,
          warrantyExpiry: asset.warrantyExpiry,
          warrantyDetails: asset.warrantyDetails,
          notes: (asset.notes ? `${asset.notes}\n` : "") + `Maintenance: ${recordData.serviceType} via ${recordData.vendor}`,
          assignmentHistory: asset.assignmentHistory,
        });
      }

      await persistState(employees, updated, handovers);
      return newRecord;
    },
    [assets, employees, handovers, maintenance, persistState, updateAsset]
  );

  // Complete Maintenance
  const completeMaintenance = useCallback(
    async ({
      id,
      completedDate,
      resolutionNotes,
      finalCost,
      returnToStatus,
    }: {
      id: string;
      completedDate: string;
      resolutionNotes: string;
      finalCost?: number;
      returnToStatus: "available" | "in_use";
    }) => {
      let targetAssetId = "";
      const updated = maintenance.map((m) => {
        if (m.id === id) {
          targetAssetId = m.assetId;
          return {
            ...m,
            status: "completed" as const,
            completedDate,
            resolutionNotes,
            cost: finalCost !== undefined ? finalCost : m.cost,
          };
        }
        return m;
      });

      setMaintenance(updated);

      if (targetAssetId) {
        const asset = assets.find((a) => a.id === targetAssetId);
        if (asset) {
          await updateAsset(asset.id, {
            name: asset.name,
            category: asset.category,
            serialNumber: asset.serialNumber,
            status: returnToStatus,
            assignee: returnToStatus === "available" ? "" : asset.assignee,
            location: asset.location,
            purchaseDate: asset.purchaseDate,
            purchasePrice: asset.purchasePrice,
            warrantyExpiry: asset.warrantyExpiry,
            warrantyDetails: asset.warrantyDetails,
            notes: (asset.notes ? `${asset.notes}\n` : "") + `Service completed on ${completedDate}: ${resolutionNotes}`,
            assignmentHistory: asset.assignmentHistory,
          });
        }
      }

      await persistState(employees, updated, handovers);
    },
    [assets, employees, handovers, maintenance, persistState, updateAsset]
  );

  // Onboard Employee (Batch Asset Provisioning)
  const onboardEmployee = useCallback(
    async ({
      employeeId,
      assetIds,
      condition,
      notes,
    }: {
      employeeId: string;
      assetIds: string[];
      condition: "new" | "excellent" | "good" | "fair";
      notes?: string;
    }): Promise<HandoverSlip> => {
      const emp = getEmployee(employeeId);
      if (!emp) throw new Error("Employee not found");

      const items: HandoverAssetItem[] = [];

      for (const aid of assetIds) {
        const asset = assets.find((a) => a.id === aid);
        if (asset) {
          const historyItem = {
            id: `hist_${Date.now()}_${aid}`,
            assignee: emp.name,
            assignedBy: user?.name || "IT Admin",
            assignedAt: new Date().toISOString(),
            location: emp.location,
            notes: `New Hire Onboarding: ${notes || "Provisioned bundle"}`,
          };

          await updateAsset(asset.id, {
            name: asset.name,
            category: asset.category,
            serialNumber: asset.serialNumber,
            status: "in_use",
            assignee: emp.name,
            employeeId: emp.id,
            location: emp.location,
            condition,
            purchaseDate: asset.purchaseDate,
            purchasePrice: asset.purchasePrice,
            warrantyExpiry: asset.warrantyExpiry,
            warrantyDetails: asset.warrantyDetails,
            notes: asset.notes,
            assignmentHistory: [historyItem, ...(asset.assignmentHistory || [])],
          });

          items.push({
            id: asset.id,
            name: asset.name,
            serialNumber: asset.serialNumber,
            category: asset.category,
            condition,
            notes: "Onboarding Kit",
          });
        }
      }

      // Mark employee active
      await updateEmployee(emp.id, { status: "active" });

      // Generate Onboarding Handover Slip
      const slip: HandoverSlip = {
        id: `HO-${new Date().getFullYear()}-${String(handovers.length + 1).padStart(4, "0")}`,
        type: "onboarding",
        assetIds,
        assetDetails: items,
        toPerson: emp.name,
        toPersonEmail: emp.email,
        issuedBy: user?.name || "IT Administration",
        department: emp.department,
        location: emp.location,
        issuedAt: new Date().toISOString(),
        termsAccepted: true,
        notes: `New hire onboarding equipment issuance. Total ${items.length} items issued.`,
      };

      const newHandovers = [slip, ...handovers];
      setHandovers(newHandovers);
      await persistState(employees, maintenance, newHandovers);

      return slip;
    },
    [assets, employees, handovers, maintenance, persistState, updateAsset, updateEmployee, user, getEmployee]
  );

  // Offboard Employee (Batch Asset Retrieval & Clearance)
  const offboardEmployee = useCallback(
    async ({
      employeeId,
      items,
      clearanceNotes,
    }: {
      employeeId: string;
      items: {
        assetId: string;
        condition: "new" | "excellent" | "good" | "fair";
        routeTo: "available" | "maintenance";
        notes?: string;
      }[];
      clearanceNotes?: string;
    }): Promise<HandoverSlip> => {
      const emp = getEmployee(employeeId);
      if (!emp) throw new Error("Employee not found");

      const slipItems: HandoverAssetItem[] = [];

      for (const item of items) {
        const asset = assets.find((a) => a.id === item.assetId);
        if (asset) {
          const updatedHistory = (asset.assignmentHistory || []).map((h, idx) => {
            if (idx === 0 && !h.returnedAt) {
              return {
                ...h,
                returnedAt: new Date().toISOString(),
                notes: (h.notes ? `${h.notes} | ` : "") + `Offboarding return: ${item.condition}. ${item.notes || ""}`,
              };
            }
            return h;
          });

          await updateAsset(asset.id, {
            name: asset.name,
            category: asset.category,
            serialNumber: asset.serialNumber,
            status: item.routeTo,
            assignee: "",
            employeeId: undefined,
            location: "IT Storage - Terminal 3 Basement",
            condition: item.condition,
            purchaseDate: asset.purchaseDate,
            purchasePrice: asset.purchasePrice,
            warrantyExpiry: asset.warrantyExpiry,
            warrantyDetails: asset.warrantyDetails,
            notes: (asset.notes ? `${asset.notes}\n` : "") + `Offboarded from ${emp.name} on ${new Date().toLocaleDateString("en-IN")}. Routed to ${item.routeTo}.`,
            assignmentHistory: updatedHistory,
          });

          slipItems.push({
            id: asset.id,
            name: asset.name,
            serialNumber: asset.serialNumber,
            category: asset.category,
            condition: item.condition,
            notes: `Routed to ${item.routeTo}. ${item.notes || ""}`,
          });
        }
      }

      // Mark employee offboarded
      await updateEmployee(emp.id, { status: "offboarded" });

      // Generate Clearance Handover Slip
      const slip: HandoverSlip = {
        id: `HO-${new Date().getFullYear()}-${String(handovers.length + 1).padStart(4, "0")}`,
        type: "offboarding",
        assetIds: items.map((i) => i.assetId),
        assetDetails: slipItems,
        fromPerson: emp.name,
        toPerson: "IT Central Storage",
        toPersonEmail: emp.email,
        issuedBy: user?.name || "IT Administration",
        department: emp.department,
        location: emp.location,
        issuedAt: new Date().toISOString(),
        termsAccepted: true,
        notes: `IT Asset Clearance completed. ${slipItems.length} assets retrieved. ${clearanceNotes || ""}`,
      };

      const newHandovers = [slip, ...handovers];
      setHandovers(newHandovers);
      await persistState(employees, maintenance, newHandovers);

      return slip;
    },
    [assets, employees, handovers, maintenance, persistState, updateAsset, updateEmployee, user, getEmployee]
  );

  // Sign Handover Slip
  const signHandoverSlip = useCallback(
    async (slipId: string, signatureSvgData: string) => {
      const updated = handovers.map((h) =>
        h.id === slipId ? { ...h, signatureSvgData, termsAccepted: true } : h
      );
      setHandovers(updated);
      await persistState(employees, maintenance, updated);
    },
    [employees, handovers, maintenance, persistState]
  );

  // Refresh Directory from Microsoft Graph (Entra ID)
  const refreshDirectoryFromGraph = useCallback(async () => {
    try {
      const token = await getValidAccessToken();
      if (!token) return;

      const res = await fetch(
        "https://graph.microsoft.com/v1.0/users?$top=50&$select=id,displayName,mail,userPrincipalName,department,jobTitle,mobilePhone,officeLocation",
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!res.ok) return;

      const data = await res.json();
      if (Array.isArray(data.value) && data.value.length > 0) {
        const graphEmployees: Employee[] = data.value.map((u: any, idx: number) => ({
          id: u.id || `EMP-${2000 + idx}`,
          name: u.displayName || u.userPrincipalName || "Employee",
          email: u.mail || u.userPrincipalName || "",
          department: (u.department as any) || "Lounge Operations",
          designation: u.jobTitle || "Operations Staff",
          phone: u.mobilePhone || "",
          location: u.officeLocation || "T3 Terminal Lounge",
          status: "active" as const,
          joinedDate: new Date().toISOString().slice(0, 10),
        }));

        setEmployees(graphEmployees);
        await persistState(graphEmployees, maintenance, handovers);
      }
    } catch {
      // Offline or Graph permission restricted; fallback to current list
    }
  }, [getValidAccessToken, handovers, maintenance, persistState]);

  const value = useMemo(
    () => ({
      employees,
      maintenance,
      handovers,
      loaded,
      addEmployee,
      updateEmployee,
      assignAsset,
      checkInAsset,
      transferAsset,
      scheduleMaintenance,
      completeMaintenance,
      onboardEmployee,
      offboardEmployee,
      signHandoverSlip,
      getEmployee,
      getEmployeeAssets,
      refreshDirectoryFromGraph,
    }),
    [
      employees,
      maintenance,
      handovers,
      loaded,
      addEmployee,
      updateEmployee,
      assignAsset,
      checkInAsset,
      transferAsset,
      scheduleMaintenance,
      completeMaintenance,
      onboardEmployee,
      offboardEmployee,
      signHandoverSlip,
      getEmployee,
      getEmployeeAssets,
      refreshDirectoryFromGraph,
    ]
  );

  return <ITAMContext.Provider value={value}>{children}</ITAMContext.Provider>;
}

export function useITAM() {
  const ctx = useContext(ITAMContext);
  if (!ctx) throw new Error("useITAM must be used within an ITAMProvider");
  return ctx;
}
