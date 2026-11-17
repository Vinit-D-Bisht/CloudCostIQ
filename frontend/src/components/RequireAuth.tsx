import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type { AuthResponse } from "@/lib/types";

/** Blocks the simulation board until the user has a valid session cookie. */
export default function RequireAuth({ children }: { children: ReactNode }) {
  const meQuery = useQuery({
    queryKey: ["auth-me"],
    queryFn: () => apiGet<AuthResponse>("/auth/me"),
    retry: false,
  });

  if (meQuery.isLoading) {
    return (
      <div className="grid min-h-svh place-items-center bg-background text-muted-foreground" data-testid="auth-loading">
        <p className="font-mono text-xs uppercase tracking-[0.2em]">Checking session…</p>
      </div>
    );
  }

  if (!meQuery.data?.user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
