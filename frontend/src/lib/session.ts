// Session boundary: auth is an httpOnly cookie the backend owns; the frontend's one
// duty is wiping caches so one account's data never renders for the next.
import { queryClient } from "./queryClient";
import { apiPost } from "./api";
import { clearAllLocalCaches, setAuthMode } from "./workspace-store";

export function beginSession(): void {
  setAuthMode(true);
  queryClient.clear();
}

export async function endSession(redirectTo: string = "/login"): Promise<void> {
  try {
    await apiPost("/auth/logout");
  } finally {
    clearAllLocalCaches();
    queryClient.clear();
    window.location.assign(redirectTo);
  }
}
