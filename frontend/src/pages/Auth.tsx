import { useState, type FormEvent } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { KeyRound, LogIn, UserPlus, Zap } from "lucide-react";

import { Input } from "@/components/ui/input";
import { apiPost } from "@/lib/api";
import { beginSession } from "@/lib/session";
import type { AuthResponse } from "@/lib/types";

type Mode = "login" | "signup" | "forgot" | "reset";

export default function Auth() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const initial: Mode =
    (params.get("mode") as Mode) || (location.pathname.includes("signup") ? "signup" : "login");
  const [mode, setMode] = useState<Mode>(initial);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [resetToken, setResetToken] = useState(params.get("token") || "");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      if (mode === "login") {
        await apiPost<AuthResponse>("/auth/login", { email, password });
        beginSession();
        toast.success("Signed in");
        navigate("/");
        return;
      }
      if (mode === "signup") {
        await apiPost<AuthResponse>("/auth/signup", {
          email,
          password,
          display_name: displayName,
        });
        beginSession();
        toast.success("Account created");
        navigate("/");
        return;
      }
      if (mode === "forgot") {
        const res = await apiPost<{ ok: boolean; reset_token?: string; message: string }>(
          "/auth/forgot-password",
          { email },
        );
        toast.success(res.message);
        if (res.reset_token) {
          setResetToken(res.reset_token);
          setMode("reset");
        }
        return;
      }
      await apiPost("/auth/reset-password", { token: resetToken, new_password: password });
      toast.success("Password updated — sign in");
      setMode("login");
    } catch (error) {
      toast.error("Auth failed", {
        description: error instanceof Error ? error.message : "Check your details and try again.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="relative min-h-svh overflow-hidden text-[#f4f7fb]" data-testid="auth-page">
      <div className="pointer-events-none absolute inset-0 blueprint-grid opacity-60" />
      <div className="relative mx-auto flex min-h-svh max-w-lg flex-col justify-center px-6 py-12">
        <p className="mb-8 section-kicker">Sign in required to use the simulation board</p>
        <div className="mb-8 flex items-center gap-4 rise-in">
          <div className="grid size-14 place-items-center border border-[#f5c518]/50 bg-[#f5c518] text-[#0a0b0f] shadow-[0_0_32px_rgba(245,197,24,0.28)]">
            <Zap className="size-7" strokeWidth={2.5} />
          </div>
          <div>
            <p className="font-heading text-3xl font-bold tracking-tight">
              CLOUDCOST <span className="text-[#f5c518]">IQ</span>
            </p>
            <p className="mt-1 font-mono text-sm uppercase tracking-[0.18em] text-[#8fa3b8]">
              {mode === "login"
                ? "Sign in"
                : mode === "signup"
                  ? "Create account"
                  : mode === "forgot"
                    ? "Recover access"
                    : "Reset password"}
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="panel space-y-4 p-6 rise-in rise-in-delay-1" data-testid="auth-form">
          {mode === "signup" && (
            <label className="field-label" htmlFor="display-name">
              Display name
              <Input
                id="display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-2 h-12 rounded-sm border-[#243041] bg-[#0a0e14] font-mono text-base"
                data-testid="display-name-input"
              />
            </label>
          )}
          {mode !== "reset" && (
            <label className="field-label" htmlFor="email">
              Email
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-2 h-12 rounded-sm border-[#243041] bg-[#0a0e14] font-mono text-base"
                data-testid="email-input"
              />
            </label>
          )}
          {(mode === "login" || mode === "signup" || mode === "reset") && (
            <label className="field-label" htmlFor="password">
              {mode === "reset" ? "New password" : "Password"}
              <Input
                id="password"
                type="password"
                required
                minLength={mode === "login" ? 1 : 8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-2 h-12 rounded-sm border-[#243041] bg-[#0a0e14] font-mono text-base"
                data-testid="password-input"
              />
            </label>
          )}
          {mode === "reset" && (
            <label className="field-label" htmlFor="reset-token">
              Reset token
              <Input
                id="reset-token"
                required
                value={resetToken}
                onChange={(e) => setResetToken(e.target.value)}
                className="mt-2 h-12 rounded-sm border-[#243041] bg-[#0a0e14] font-mono text-base"
                data-testid="reset-token-input"
              />
            </label>
          )}

          <button
            type="submit"
            disabled={pending}
            className="btn-primary mt-2 inline-flex w-full items-center justify-center"
            data-testid="auth-submit-button"
          >
            {mode === "login" && <LogIn className="mr-2 size-4" />}
            {mode === "signup" && <UserPlus className="mr-2 size-4" />}
            {(mode === "forgot" || mode === "reset") && <KeyRound className="mr-2 size-4" />}
            {pending
              ? "Working…"
              : mode === "login"
                ? "Sign in"
                : mode === "signup"
                  ? "Create account"
                  : mode === "forgot"
                    ? "Send reset"
                    : "Update password"}
          </button>

          <a
            href="/api/auth/google/start"
            className="btn-ghost flex w-full items-center justify-center"
            data-testid="google-oauth-link"
          >
            Continue with Google
          </a>
        </form>

        <div className="mt-6 flex flex-wrap gap-4 font-mono text-sm uppercase tracking-wider text-[#8fa3b8]">
          {mode !== "login" && (
            <button type="button" onClick={() => setMode("login")} className="hover:text-[#f5c518]" data-testid="switch-login">
              Sign in
            </button>
          )}
          {mode !== "signup" && (
            <button type="button" onClick={() => setMode("signup")} className="hover:text-[#f5c518]" data-testid="switch-signup">
              Create account
            </button>
          )}
          {mode !== "forgot" && (
            <button type="button" onClick={() => setMode("forgot")} className="hover:text-[#f5c518]" data-testid="switch-forgot">
              Forgot password
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
