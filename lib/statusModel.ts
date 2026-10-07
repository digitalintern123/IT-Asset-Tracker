/**
 * Strict Asset Status Lifecycle Finite State Machine (FSM).
 * Enforces business rules and valid state transitions for ENCALM IT hardware.
 */

import type { AssetStatus } from "@/types/asset";

export const ALLOWED_TRANSITIONS: Record<AssetStatus, AssetStatus[]> = {
  // Nothing moves back to "new": once a device has been issued it is
  // "available" when returned.
  new: ["new", "in_use", "maintenance", "retired"],
  available: ["available", "in_use", "maintenance", "retired"],
  in_use: ["in_use", "available", "maintenance", "retired"],
  maintenance: ["maintenance", "available", "in_use", "retired"],
  retired: ["retired"], // Terminal decommissioned state
};

/**
 * Check if a status transition is structurally allowed by the FSM.
 */
export function canTransitionStatus(
  current: AssetStatus,
  target: AssetStatus
): boolean {
  if (current === target) return true;
  const allowed = ALLOWED_TRANSITIONS[current] || [];
  return allowed.includes(target);
}

/**
 * Validate a proposed status transition with field requirements.
 */
export function validateStatusTransition(
  current: AssetStatus,
  next: AssetStatus,
  context: {
    assignee?: string;
    notes?: string;
    isAdmin?: boolean;
  }
): { valid: boolean; error?: string } {
  // 1. Check if structurally valid transition
  if (!canTransitionStatus(current, next)) {
    if (current === "retired" && !context.isAdmin) {
      return {
        valid: false,
        error:
          "Out of Order devices are decommissioned. Only IT Administrators can bring them back into service.",
      };
    }
  }

  // 2. In-use requires an active assignee
  if (next === "in_use") {
    if (!context.assignee || !context.assignee.trim()) {
      return {
        valid: false,
        error:
          "An assignee name or email is strictly required to mark an asset as 'In Use'.",
      };
    }
  }

  // 3. Maintenance transition requires reason/notes
  if (next === "maintenance" && current !== "maintenance") {
    if (!context.notes || !context.notes.trim()) {
      return {
        valid: false,
        error:
          "Please provide notes detailing the hardware issue or maintenance reason.",
      };
    }
  }

  return { valid: true };
}
