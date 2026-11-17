import { useState, type FormEvent } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Activity,
  CheckCircle2,
  Code2,
  Eye,
  EyeOff,
  KeyRound,
  Layers,
  Lock,
  LogIn,
  Mail,
  ShieldCheck,
  Sparkles,
  User,
  UserPlus,
  Zap,
} from "lucide-react";

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
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      if (mode === "login") {
        await apiPost<AuthResponse>("/auth/login", { email, password });
        beginSession();
        toast.success("Signed in successfully");
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
        toast.success("Account created successfully");
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
      toast.success("Password updated — please sign in");
      setMode("login");
    } catch (error) {
      toast.error("Authentication failed", {
        description: error instanceof Error ? error.message : "Check your credentials and try again.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="relative min-h-svh flex items-center justify-center p-4 py-8 lg:p-10 text-[#f1f5f9] bg-[#080c14]"
      data-testid="auth-page"
    >
      {/* Decorative ambient blueprint grid and radial glows */}
      <div className="pointer-events-none absolute inset-0 blueprint-grid opacity-30" />

      <div className="relative z-10 mx-auto grid w-full max-w-5xl grid-cols-1 items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Left Column: Visual Showcase & Brand Presentation */}
        <div className="hidden lg:flex flex-col space-y-6 pr-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#f59e0b]/30 bg-[#f59e0b]/10 px-3 py-1 font-mono text-xs uppercase tracking-wider text-[#f59e0b]">
            <Sparkles className="size-3.5" /> Multi-Cloud FinOps Lab
          </div>

          <div>
            <div className="flex items-center gap-3">
              <div className="grid size-12 place-items-center rounded-md border border-[#f59e0b]/50 bg-[#f59e0b] text-[#090d16]">
                <Zap className="size-6" strokeWidth={2.5} />
              </div>
              <h1 className="font-heading text-3xl font-bold tracking-tight text-white">
                CLOUDCOST <span className="text-[#f59e0b]">IQ</span>
              </h1>
            </div>
            <p className="mt-3 text-lg leading-relaxed text-[#94a3b8]">
              Model, right-size, and simulate cloud infrastructure spend across AWS, GCP, and Azure without risking a single dollar.
            </p>
          </div>

          {/* Interactive Mock Preview Card */}
          <div className="rounded-md border border-[#1e293b] bg-[#0e1422]/90 p-5 shadow-2xl backdrop-blur-md space-y-4">
            <div className="flex items-center justify-between border-b border-[#1e293b] pb-3">
              <span className="font-mono text-xs uppercase text-[#38bdf8] flex items-center gap-1.5">
                <Activity className="size-3.5 text-[#10b981]" /> Live Simulation Workbench
              </span>
              <span className="font-mono text-[10px] text-[#94a3b8]">AWS · US-EAST</span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-sm bg-[#141b2d] px-3 py-2 text-xs font-mono">
                <span className="text-[#cbd5e1]">2x EC2 App Servers (t3.medium)</span>
                <span className="text-emerald-400 font-bold">$70.08/mo</span>
              </div>
              <div className="flex items-center justify-between rounded-sm bg-[#141b2d] px-3 py-2 text-xs font-mono">
                <span className="text-[#cbd5e1]">RDS PostgreSQL (Multi-AZ)</span>
                <span className="text-amber-400 font-bold">$268.20/mo</span>
              </div>
              <div className="flex items-center justify-between rounded-sm bg-[#141b2d] px-3 py-2 text-xs font-mono">
                <span className="text-[#cbd5e1]">Redis Cache Node</span>
                <span className="text-emerald-400 font-bold">$49.64/mo</span>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-sm border border-[#10b981]/30 bg-[#10b981]/10 px-3 py-2 font-mono text-xs text-[#34d399]">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5" /> 10 Cost Heuristics Active
              </span>
              <span className="font-bold">Save $128.40/mo</span>
            </div>
          </div>

          {/* Feature Highlights */}
          <div className="grid grid-cols-2 gap-3 text-xs font-mono text-[#94a3b8]">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-[#10b981]" /> Zero Cloud Mutations
            </div>
            <div className="flex items-center gap-2">
              <Code2 className="size-4 text-[#38bdf8]" /> Terraform HCL Preview
            </div>
            <div className="flex items-center gap-2">
              <Layers className="size-4 text-[#f59e0b]" /> 4 Architecture Blueprints
            </div>
            <div className="flex items-center gap-2">
              <Activity className="size-4 text-[#818cf8]" /> Live Workload Sliders
            </div>
          </div>
        </div>

        {/* Right Column: Authentication Card */}
        <div className="w-full max-w-md mx-auto">
          {/* Mobile Brand Header */}
          <div className="flex lg:hidden items-center justify-center gap-3 mb-6">
            <div className="grid size-10 place-items-center rounded-md border border-[#f59e0b]/50 bg-gradient-to-br from-[#fbbf24] to-[#f59e0b] text-[#090d16] shadow-lg">
              <Zap className="size-5" strokeWidth={2.5} />
            </div>
            <h1 className="font-heading text-2xl font-bold tracking-tight text-white">
              CLOUDCOST <span className="text-[#f59e0b]">IQ</span>
            </h1>
          </div>

          <div className="rounded-md border border-[#1e293b] bg-[#0e1422] p-6 shadow-xl sm:p-8">
            {/* Header Tabs (Sign In / Create Account) */}
            {(mode === "login" || mode === "signup") && <div className="mb-6 flex rounded-md border border-[#1e293b] bg-[#090d16] p-1">
              <button
                type="button"
                onClick={() => setMode("login")}
                className={`flex-1 rounded-sm py-2 font-mono text-xs uppercase tracking-wider transition-all cursor-pointer ${
                  mode === "login"
                    ? "bg-[#f59e0b] text-[#090d16] font-bold shadow-md"
                    : "text-[#94a3b8] hover:text-white"
                }`}
                data-testid="switch-login"
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => setMode("signup")}
                className={`flex-1 rounded-sm py-2 font-mono text-xs uppercase tracking-wider transition-all cursor-pointer ${
                  mode === "signup"
                    ? "bg-[#f59e0b] text-[#090d16] font-bold shadow-md"
                    : "text-[#94a3b8] hover:text-white"
                }`}
                data-testid="switch-signup"
              >
                Create Account
              </button>
            </div>}

            <div className="mb-5">
              <h2 className="font-heading text-xl font-bold text-white">
                {mode === "login"
                  ? "Welcome Back"
                  : mode === "signup"
                    ? "Create Your Lab Account"
                    : mode === "forgot"
                      ? "Reset Password"
                      : "Enter New Password"}
              </h2>
              <p className="mt-1 text-xs text-[#94a3b8]">
                {mode === "login"
                  ? "Sign in to access your cloud workspaces and simulations."
                  : mode === "signup"
                    ? "Start simulating infrastructure with full multi-cloud parity."
                    : "Follow the recovery steps to restore access."}
              </p>
            </div>

            <form onSubmit={onSubmit} className="space-y-4" data-testid="auth-form">
              {mode === "signup" && (
                <div>
                  <label className="field-label mb-1.5 flex items-center gap-1.5" htmlFor="display-name">
                    <User className="size-3.5 text-[#f59e0b]" /> Display Name
                  </label>
                  <Input
                    id="display-name"
                    required
                    placeholder="Alex Architect"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="h-11 rounded-md border-[#1e293b] bg-[#090d16] font-mono text-sm text-white focus:border-[#f59e0b]"
                    data-testid="display-name-input"
                  />
                </div>
              )}

              {mode !== "reset" && (
                <div>
                  <label className="field-label mb-1.5 flex items-center gap-1.5" htmlFor="email">
                    <Mail className="size-3.5 text-[#f59e0b]" /> Email Address
                  </label>
                  <Input
                    id="email"
                    type="email"
                    required
                    placeholder="architect@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11 rounded-md border-[#1e293b] bg-[#090d16] font-mono text-sm text-white focus:border-[#f59e0b]"
                    data-testid="email-input"
                  />
                </div>
              )}

              {(mode === "login" || mode === "signup" || mode === "reset") && (
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="field-label flex items-center gap-1.5" htmlFor="password">
                      <Lock className="size-3.5 text-[#f59e0b]" />
                      {mode === "reset" ? "New Password" : "Password"}
                    </label>
                    {mode === "login" && (
                      <button
                        type="button"
                        onClick={() => setMode("forgot")}
                        className="font-mono text-[11px] text-[#f59e0b] hover:underline cursor-pointer"
                        data-testid="switch-forgot"
                      >
                        Forgot?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={mode === "login" ? 1 : 8}
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 rounded-md border-[#1e293b] bg-[#090d16] pr-11 font-mono text-sm text-white focus:border-[#f59e0b]"
                    data-testid="password-input"
                  />
                  <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8] hover:text-white">
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                  </div>
                </div>
              )}

              {mode === "reset" && (
                <div>
                  <label className="field-label mb-1.5 flex items-center gap-1.5" htmlFor="reset-token">
                    <KeyRound className="size-3.5 text-[#f59e0b]" /> Reset Token
                  </label>
                  <Input
                    id="reset-token"
                    required
                    placeholder="Paste reset token"
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    className="h-11 rounded-md border-[#1e293b] bg-[#090d16] font-mono text-sm text-white"
                    data-testid="reset-token-input"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={pending}
                className="btn-primary mt-2 inline-flex w-full items-center justify-center cursor-pointer font-bold shadow-lg"
                data-testid="auth-submit-button"
              >
                {mode === "login" && <LogIn className="mr-2 size-4" />}
                {mode === "signup" && <UserPlus className="mr-2 size-4" />}
                {(mode === "forgot" || mode === "reset") && <KeyRound className="mr-2 size-4" />}
                {pending
                  ? "Please wait…"
                  : mode === "login"
                    ? "Sign In to Workbench"
                    : mode === "signup"
                      ? "Create Account"
                      : mode === "forgot"
                        ? "Send Recovery Token"
                        : "Update Password"}
              </button>

              {(mode === "login" || mode === "signup") && <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[#1e293b]" />
                </div>
                <div className="relative flex justify-center text-[10px] uppercase font-mono">
                  <span className="bg-[#0e1422] px-2 text-[#64748b]">Or Continue With</span>
                </div>
              </div>}

              {(mode === "login" || mode === "signup") && <a
                href="/api/auth/google/start"
                className="btn-ghost flex w-full items-center justify-center gap-2 cursor-pointer text-xs"
                data-testid="google-oauth-link"
              >
                <svg className="size-4" viewBox="0 0 24 24">
                  <path
                    fill="#EA4335"
                    d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.4l3.7 2.9C6.5 7.4 9 5 12 5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M23.5 12.3c0-.8-.1-1.7-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.6 14.7c-.2-.7-.4-1.5-.4-2.7 0-1.2.2-2 .4-2.7L1.9 6.4C.7 8.8 0 10.8 0 12c0 1.2.7 3.2 1.9 5.6l3.7-2.9z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.4-6.4-5.3L1.9 16C3.7 19.8 7.5 23 12 23z"
                  />
                </svg>
                Continue with Google
              </a>}
            </form>

            {/* Quick Switch Links */}
            <div className="mt-5 border-t border-[#1e293b] pt-4 text-center font-mono text-xs text-[#94a3b8]">
              {mode !== "login" && (
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="text-[#f59e0b] hover:underline cursor-pointer"
                >
                  Already have an account? Sign in
                </button>
              )}
              {mode === "login" && (
                <button
                  type="button"
                  onClick={() => setMode("signup")}
                  className="text-[#f59e0b] hover:underline cursor-pointer"
                >
                  Don&apos;t have an account? Create one
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
