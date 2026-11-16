import type { CloudProvider, PricingModel, RegionKey, ResourceConfig } from "./sim";

const GUEST_KEY = "cloudcostiq:guest-workspace";
const AUTH_FLAG = "cloudcostiq:auth-mode";

export interface WorkspaceState {
  name: string;
  resources: ResourceConfig[];
  provider: CloudProvider;
  pricingModel: PricingModel;
  region: RegionKey;
  hoursPerMonth: number;
  workload: number;
  updatedAt: string;
}

export function isAuthMode(): boolean {
  return localStorage.getItem(AUTH_FLAG) === "1";
}

export function setAuthMode(enabled: boolean): void {
  if (enabled) {
    localStorage.setItem(AUTH_FLAG, "1");
    // Prevent stale guest drafts from overwriting authenticated cloud sessions.
    localStorage.removeItem(GUEST_KEY);
  } else {
    localStorage.removeItem(AUTH_FLAG);
  }
}

export function loadGuestWorkspace(): WorkspaceState | null {
  if (isAuthMode()) return null;
  try {
    const raw = localStorage.getItem(GUEST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkspaceState;
    if (!parsed || !Array.isArray(parsed.resources)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveGuestWorkspace(state: WorkspaceState): void {
  if (isAuthMode()) return;
  const payload: WorkspaceState = {
    ...state,
    name: state.name?.trim() || "Guest sandbox",
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(GUEST_KEY, JSON.stringify(payload));
}

export function clearGuestWorkspace(): void {
  localStorage.removeItem(GUEST_KEY);
}

export function clearAllLocalCaches(): void {
  localStorage.removeItem(GUEST_KEY);
  localStorage.removeItem(AUTH_FLAG);
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("cloudcostiq:")) localStorage.removeItem(key);
  }
}
