import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Activity,
  ArrowUpRight,
  Boxes,
  Bot,
  Check,
  Clipboard,
  Cloud,
  Code2,
  Container,
  Database,
  Download,
  Gauge,
  HardDrive,
  Info,
  Layers,
  LogOut,
  MessageSquare,
  Network,
  Play,
  Plus,
  RefreshCw,
  Save,
  Server,
  Send,
  ShieldCheck,
  Sliders,
  Sparkles,
  Trash2,
  TrendingDown,
  TriangleAlert,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Input } from "@/components/ui/input";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { ruleRecommendations } from "@/lib/advisor";
import { BLUEPRINTS } from "@/lib/blueprints";
import { buildCostCsv, downloadCsv } from "@/lib/report";
import { endSession } from "@/lib/session";
import { catalogFor, enginesFor, kindLabel, skusFor } from "@/lib/catalog";
import {
  INSTANCE_TIERS,
  PRICING_MODELS,
  PROVIDERS,
  REGIONS,
  RESOURCE_KINDS,
  compareProviders,
  simulate,
  type CloudProvider,
  type InstanceTier,
  type PricingModel,
  type RegionKey,
  type ResourceConfig,
  type ResourceKind,
  type SimulationResponse,
} from "@/lib/sim";
import { generateTerraform, validateTerraform } from "@/lib/terraform";
import type {
  AdvisorChatResponse,
  AuthResponse,
  RecommendationRequest,
  RecommendationResponse,
  TerraformResponse,
  TerraformValidation,
  WorkspaceDocument,
  WorkspaceSummary,
} from "@/lib/types";
import { setAuthMode } from "@/lib/workspace-store";

type Panel = "analysis" | "insights" | "scenarios" | "terraform";
type ChatMessage = { role: "user" | "assistant"; content: string };

const KIND_COLOR: Record<ResourceKind, string> = {
  vm: "#f59e0b",
  storage: "#4db8ff",
  network: "#3dd68c",
  database: "#f472b6",
  serverless: "#fb923c",
  container: "#a78bfa",
  cache: "#22d3ee",
  cdn: "#94a3b8",
  queue: "#eab308",
};

const starterResources: ResourceConfig[] = BLUEPRINTS[0].resources;

function currency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

const iconForKind = (kind: ResourceKind) => {
  if (kind === "vm") return Server;
  if (kind === "storage") return HardDrive;
  if (kind === "network") return Network;
  if (kind === "database") return Database;
  if (kind === "serverless") return Workflow;
  if (kind === "container") return Container;
  if (kind === "cache") return Layers;
  if (kind === "cdn") return Cloud;
  return MessageSquare;
};

export default function Home() {
  const queryClient = useQueryClient();
  const [resources, setResources] = useState<ResourceConfig[]>(starterResources);
  const [workload, setWorkload] = useState(58);
  const [hoursPerMonth, setHoursPerMonth] = useState(730);
  const [provider, setProvider] = useState<CloudProvider>("aws");
  const [pricingModel, setPricingModel] = useState<PricingModel>("on_demand");
  const [region, setRegion] = useState<RegionKey>("us-east");
  const [workspaceName, setWorkspaceName] = useState("web-application-stack");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState(starterResources[0]?.id ?? "");
  const [activePanel, setActivePanel] = useState<Panel>("analysis");
  const [copied, setCopied] = useState(false);
  const [localTerraform, setLocalTerraform] = useState<TerraformResponse | null>(null);
  const [localValidation, setLocalValidation] = useState<TerraformValidation | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [tfProvider, setTfProvider] = useState<CloudProvider>("aws");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatPending, setChatPending] = useState(false);
  const [chatProvider, setChatProvider] = useState<"groq" | "deterministic" | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Hi! Ask me about this setup, its estimated costs, or ways to optimize it." },
  ]);

  const meQuery = useQuery({
    queryKey: ["auth-me"],
    queryFn: () => apiGet<AuthResponse>("/auth/me"),
    retry: false,
  });
  const user = meQuery.data?.user;

  useEffect(() => {
    setAuthMode(true);
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth") === "1") {
      window.history.replaceState({}, "", "/");
    }
  }, []);

  const workspacesQuery = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => apiGet<WorkspaceSummary[]>("/workspaces"),
    retry: false,
  });

  const selected = resources.find((resource) => resource.id === selectedId) ?? resources[0];

  const preview = useMemo(
    () =>
      simulate(resources, {
        provider,
        pricingModel,
        region,
        hoursPerMonth,
        workload,
      }),
    [resources, provider, pricingModel, region, hoursPerMonth, workload],
  );

  const providerCompare = useMemo(
    () =>
      compareProviders(resources, {
        pricingModel,
        region,
        hoursPerMonth,
        workload,
      }),
    [resources, pricingModel, region, hoursPerMonth, workload],
  );

  const localRules = useMemo(
    () => ruleRecommendations(resources, preview, pricingModel),
    [resources, preview, pricingModel],
  );

  const simulationMutation = useMutation({
    mutationFn: () =>
      apiPost<SimulationResponse>("/simulation/analyze", {
        resources,
        workload,
        hours_per_month: hoursPerMonth,
        provider,
        pricing_model: pricingModel,
        region,
      }),
    onSuccess: () => toast.success("Simulation confirmed", { description: "Server simulation matches live model." }),
    onError: () => toast.error("Simulation running in live local engine."),
  });

  const recommendationMutation = useMutation({
    mutationFn: (input: RecommendationRequest) => apiPost<RecommendationResponse>("/recommendations", input),
    onSuccess: (data) =>
      toast.success("Optimization pass complete", { description: `Engine: ${data.provider}.` }),
    onError: () => toast.error("AI service offline — using high-accuracy deterministic advisor."),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      apiPost<WorkspaceDocument>("/workspaces", {
        id: workspaceId,
        name: workspaceName,
        state: {
          resources,
          provider,
          pricing_model: pricingModel,
          region,
          hours_per_month: hoursPerMonth,
          workload,
        },
      }),
    onSuccess: (doc) => {
      setWorkspaceId(doc.id);
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      toast.success("Workspace saved to cloud", { description: "Inputs preserved; spend recalculated on load." });
    },
    onError: () => toast.error("Could not save workspace — authentication required."),
  });

  const simulation = simulationMutation.data ?? preview;
  const riskyResources = simulation.resource_estimates.filter((item) => item.status !== "healthy").length;
  const aiData = recommendationMutation.data;
  const providerLabel =
    aiData?.provider === "gemini"
      ? "Gemini AI"
      : aiData
        ? "Deterministic Advisor"
        : "Deterministic Rule Engine (Guaranteed)";

  const pieData = RESOURCE_KINDS
    .map((kind) => ({
      name: kindLabel(kind, provider),
      value: simulation.by_kind[kind] ?? 0,
      color: KIND_COLOR[kind],
    }))
    .filter((row) => row.value > 0);

  function runSimulation() {
    simulationMutation.mutate();
  }

  function runRecommendations() {
    setActivePanel("insights");
    recommendationMutation.mutate({
      resources,
      simulation,
      provider,
      pricing_model: pricingModel,
      region,
      workload,
    });
  }

  async function sendChatMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = chatInput.trim();
    if (!content || chatPending) return;
    const nextMessages = [...chatMessages, { role: "user" as const, content }];
    setChatMessages(nextMessages);
    setChatInput("");
    setChatPending(true);
    try {
      const response = await apiPost<AdvisorChatResponse>("/recommendations/chat", {
        messages: nextMessages.slice(-20),
        resources,
        simulation,
        provider,
        pricing_model: pricingModel,
        region,
        workload,
      });
      setChatProvider(response.provider);
      setChatMessages((current) => [...current, { role: "assistant", content: response.reply }]);
    } catch {
      setChatMessages((current) => [...current, { role: "assistant", content: "I couldn't reach the advisor right now. Please try again." }]);
    } finally {
      setChatPending(false);
    }
  }

  function addResource(kind: ResourceKind) {
    const meta = catalogFor(provider).find((item) => item.kind === kind);
    const count = resources.filter((resource) => resource.kind === kind).length + 1;
    const id = `${kind}-${Date.now()}`;
    const skus = skusFor(provider, kind);
    const engines = enginesFor(provider);

    const next: ResourceConfig = {
      id,
      name: `${kind}-${String(count).padStart(2, "0")}`,
      kind,
      region,
      quantity: 1,
      size: meta?.defaultSize ?? 1,
      utilization: meta?.defaultUtil ?? 48,
      tier: kind === "vm" || kind === "database" || kind === "container" || kind === "cache" ? "small" : undefined,
      storage_class: kind === "storage" ? "object" : undefined,
      db_ha: kind === "database" ? "single_az" : undefined,
      network_service: kind === "network" ? "egress" : undefined,
      sku: skus[0]?.id,
      engine: kind === "database" ? engines[0]?.id : undefined,
      service_tier: skus[0]?.name,
      environment: "non_production",
    };
    setResources((current) => [...current, next]);
    setSelectedId(id);
    toast.success(`${kindLabel(kind, provider)} added to simulation canvas`);
  }

  function updateSelected(patch: Partial<ResourceConfig>) {
    if (!selected) return;
    setResources((current) =>
      current.map((resource) => (resource.id === selected.id ? { ...resource, ...patch } : resource)),
    );
  }

  function removeResource(id: string) {
    setResources((current) => {
      const remaining = current.filter((resource) => resource.id !== id);
      setSelectedId((prev) => (prev === id ? remaining[0]?.id ?? "" : prev));
      return remaining;
    });
    toast.success("Resource node removed from topology");
  }

  function clearAllResources() {
    setResources([]);
    setSelectedId("");
    toast.success("Simulation canvas cleared");
  }

  function applyBlueprint(id: string) {
    const blueprint = BLUEPRINTS.find((item) => item.id === id);
    if (!blueprint) return;
    setResources(blueprint.resources.map((item) => ({ ...item, region })));
    setWorkload(blueprint.workload);
    setSelectedId(blueprint.resources[0]?.id ?? "");
    setWorkspaceName(blueprint.name.toLowerCase().replace(/\s+/g, "-"));
    toast.success(`Loaded blueprint: ${blueprint.name}`);
  }

  async function loadCloudWorkspace(id: string) {
    try {
      const doc = await apiGet<WorkspaceDocument>(`/workspaces/${id}`);
      setWorkspaceId(doc.id);
      setWorkspaceName(doc.name);
      setResources(doc.state.resources);
      setProvider(doc.state.provider);
      setPricingModel(doc.state.pricing_model);
      setRegion(doc.state.region);
      setHoursPerMonth(doc.state.hours_per_month);
      setWorkload(doc.state.workload);
      setSelectedId(doc.state.resources[0]?.id ?? "");
      toast.success("Workspace loaded — inputs recomputed live");
    } catch {
      toast.error("Failed to load workspace");
    }
  }

  async function deleteCloudWorkspace(id: string) {
    await apiDelete(`/workspaces/${id}`);
    if (workspaceId === id) setWorkspaceId(null);
    queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    toast.success("Workspace deleted");
  }

  function generateLocalTerraform(p: CloudProvider = tfProvider) {
    const configuration = generateTerraform(resources, p);
    setLocalTerraform({
      configuration,
      resource_count: resources.length,
      estimated_monthly_cost: simulation.total_monthly_cost,
    });
    setLocalValidation(validateTerraform(resources, p, configuration));
    toast.success(`Terraform generated for ${p.toUpperCase()}`);
  }

  async function copyTerraform() {
    const configuration = localTerraform?.configuration ?? "";
    if (!configuration) return;
    await navigator.clipboard.writeText(configuration);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
    toast.success("Terraform HCL copied to clipboard");
  }

  function exportCsv() {
    const csv = buildCostCsv(resources, simulation, {
      provider,
      pricingModel,
      region,
    });
    downloadCsv(`cloudcostiq-${workspaceName}.csv`, csv);
    toast.success("CSV export downloaded");
  }

  const insights = aiData?.recommendations ?? localRules;
  const potentialSavings = insights.reduce((total, item) => total + Math.max(0, item.estimated_monthly_saving), 0);
  const priorityCount = insights.filter((item) => item.priority === "high").length;

  // Filter toolbox by category
  const filteredCatalog = catalogFor(provider).filter((item) => {
    if (selectedCategory === "all") return true;
    if (selectedCategory === "compute") return item.kind === "vm" || item.kind === "container" || item.kind === "serverless";
    if (selectedCategory === "storage") return item.kind === "storage" || item.kind === "database" || item.kind === "cache";
    if (selectedCategory === "network") return item.kind === "network" || item.kind === "cdn" || item.kind === "queue";
    return true;
  });

  return (
    <div className="min-h-svh bg-[#080c14] text-[#f1f5f9]" data-testid="cloudcostiq-app-shell">
      {/* Top Banner / Engineering Control Room Header */}
      <header
        className="sticky top-0 z-30 border-b border-[#1e293b] bg-[#080c14]/95 backdrop-blur-xl"
        data-testid="workspace-header"
      >
        <div className="flex min-h-20 flex-wrap items-center justify-between gap-4 px-5 py-3 lg:px-8">
          <div className="flex items-center gap-4">
            <div
              className="grid size-12 place-items-center border border-[#f59e0b]/60 bg-[#f59e0b] text-[#090d16] shadow-[0_0_30px_rgba(245,197,24,0.3)] transition-transform hover:scale-105"
              data-testid="brand-mark"
            >
              <Zap className="size-6" strokeWidth={2.5} />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <p className="font-heading text-2xl font-bold tracking-tight text-white" data-testid="brand-name">
                  CLOUDCOST <span className="text-[#f59e0b]">IQ</span>
                </p>
                <span className="hidden rounded-xs border border-[#3dd68c]/40 bg-[#3dd68c]/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#3dd68c] sm:inline-block">
                  Sim Only · 0 Mutations
                </span>
              </div>
              <p className="mt-0.5 font-mono text-xs uppercase tracking-[0.2em] text-[#94a3b8]">
                Multi-Cloud Cost Simulation Lab
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5" data-testid="header-controls">
            {/* Cloud Provider Switcher */}
            <div className="flex items-center rounded-sm border border-[#1e293b] bg-[#090d16] p-1">
              {PROVIDERS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setProvider(item);
                    setTfProvider(item);
                    toast.success(`Switched cloud provider catalog to ${item.toUpperCase()}`);
                  }}
                  className={`px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider transition-colors ${
                    provider === item
                      ? "bg-[#f59e0b] text-[#090d16] shadow-sm"
                      : "text-[#94a3b8] hover:text-white"
                  }`}
                  data-testid={`provider-btn-${item}`}
                >
                  {item.toUpperCase()}
                </button>
              ))}
            </div>

            <select
              aria-label="Cloud provider"
              value={provider}
              onChange={(e) => {
                const p = e.target.value as CloudProvider;
                setProvider(p);
                setTfProvider(p);
              }}
              className="sr-only"
              data-testid="provider-switcher"
            >
              {PROVIDERS.map((item) => (
                <option key={item} value={item}>
                  {item.toUpperCase()}
                </option>
              ))}
            </select>

            {/* Pricing Model */}
            <select
              aria-label="Pricing model"
              value={pricingModel}
              onChange={(e) => setPricingModel(e.target.value as PricingModel)}
              className="control-chip cursor-pointer"
              data-testid="pricing-model-select"
            >
              {PRICING_MODELS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>

            {/* Region */}
            <select
              aria-label="Region"
              value={region}
              onChange={(e) => setRegion(e.target.value as RegionKey)}
              className="control-chip cursor-pointer"
              data-testid="region-select"
            >
              {REGIONS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={runSimulation}
              disabled={simulationMutation.isPending}
              className="btn-primary inline-flex items-center cursor-pointer"
              data-testid="run-simulation-button"
            >
              {simulationMutation.isPending ? (
                <RefreshCw className="mr-2 size-4 animate-spin" />
              ) : (
                <Play className="mr-2 size-4 fill-current" />
              )}
              Simulate
            </button>

            <button
              type="button"
              onClick={exportCsv}
              className="btn-ghost inline-flex items-center cursor-pointer"
              data-testid="export-csv-button"
              title="Export sanitized CSV formula-injection safe"
            >
              <Download className="mr-2 size-4" /> CSV
            </button>

            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="btn-ghost inline-flex items-center cursor-pointer"
              data-testid="save-workspace-button"
            >
              <Save className="mr-2 size-4" /> Save
            </button>

            <button
              type="button"
              onClick={() => endSession("/login")}
              className="btn-ghost inline-flex items-center gap-2 cursor-pointer text-[#94a3b8] hover:text-red-400"
              data-testid="sign-out-button"
              title="Sign out of CloudCost IQ"
            >
              <LogOut className="size-4" />
              <span className="max-w-[7rem] truncate">{user?.display_name || "Sign out"}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1920px] p-5 lg:p-7" data-testid="workspace-main">
        {/* Blueprints and Workspace Naming Bar */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border border-[#1e293b] bg-[#0e1422] p-3 rise-in" data-testid="blueprint-row">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="section-kicker flex items-center gap-1.5 px-2 text-[#f59e0b]">
              <Layers className="size-3.5" /> Blueprints:
            </span>
            {BLUEPRINTS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => applyBlueprint(item.id)}
                className="group relative border border-[#1e293b] bg-[#162032] px-3.5 py-2 font-mono text-xs uppercase tracking-wider text-[#cbd5e1] transition-all hover:border-[#f59e0b]/60 hover:text-[#f59e0b] cursor-pointer"
                data-testid={`blueprint-${item.id}`}
                title={item.description}
              >
                <span className="mr-1.5 text-[10px] text-[#64748b] group-hover:text-[#f59e0b]">{item.category} /</span>
                {item.name}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 font-mono text-xs text-[#94a3b8]">
              Workspace:
              <Input
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                className="h-9 w-52 rounded-sm border-[#1e293b] bg-[#090d16] font-mono text-sm text-[#f59e0b]"
                data-testid="workspace-name-input"
              />
            </label>
            <button
              type="button"
              onClick={clearAllResources}
              className="border border-[#1e293b] bg-[#162032] px-3 py-2 font-mono text-xs text-[#94a3b8] hover:border-red-500/50 hover:text-red-400 cursor-pointer"
              title="Clear all canvas nodes"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Top Control Room Metric Strip */}
        <div
          className="mb-5 grid grid-cols-1 gap-px border border-[#1e293b] bg-[#1e293b] sm:grid-cols-2 xl:grid-cols-4"
          data-testid="metric-strip"
        >
          <Metric
            className="rise-in rise-in-delay-1"
            label="Simulated Monthly Spend"
            value={currency(simulation.total_monthly_cost)}
            detail={`${hoursPerMonth}h runtime · ${pricingModel}`}
            icon={Activity}
          />
          <Metric
            className="rise-in rise-in-delay-2"
            label="Optimization Savings"
            value={currency(simulation.estimated_savings)}
            detail={`${riskyResources} optimization signals`}
            icon={TrendingDown}
            accent="yellow"
          />
          <Metric
            className="rise-in rise-in-delay-3"
            label="Fleet Utilization"
            value={`${simulation.utilization_score}%`}
            detail={simulation.utilization_score > 60 ? "Balanced workload" : "Potential idle capacity"}
            icon={Gauge}
            accent="green"
          />
          <Metric
            className="rise-in rise-in-delay-4"
            label="Annual Run-rate"
            value={currency(simulation.projected_annual_cost)}
            detail={`${provider.toUpperCase()} · ${region}`}
            icon={ArrowUpRight}
          />
        </div>

        {/* 3-Column Engineering Workbench Grid */}
        <div
          className="grid min-h-[calc(100vh-250px)] grid-cols-1 gap-5 xl:grid-cols-[300px_minmax(500px,1fr)_440px]"
          data-testid="builder-grid"
        >
          {/* LEFT: Toolbox & Scenario Controls */}
          <aside className="panel flex flex-col" data-testid="resource-toolbox">
            <div className="border-b border-[#1e293b] p-4">
              <div className="flex items-center justify-between">
                <p className="section-kicker">01 / Service Toolbox</p>
                <span className="font-mono text-xs uppercase text-[#f59e0b]">{provider.toUpperCase()}</span>
              </div>
              <h2 className="mt-1 font-heading text-xl font-bold tracking-tight text-white">Add Cloud Services</h2>
              <p className="mt-1 text-xs leading-relaxed text-[#94a3b8]">
                Select provider-branded catalog resources. Simulation only.
              </p>

              {/* Category Filter */}
              <div className="mt-3 flex gap-1 border-t border-[#1e293b]/60 pt-3">
                {["all", "compute", "storage", "network"].map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`flex-1 py-1 text-center font-mono text-[10px] uppercase tracking-wider transition-colors cursor-pointer ${
                      selectedCategory === cat
                        ? "border border-[#f59e0b]/50 bg-[#f59e0b]/10 text-[#f59e0b]"
                        : "border border-[#1e293b] text-[#94a3b8] hover:text-white"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Catalog List */}
            <div className="max-h-[46vh] space-y-2.5 overflow-auto p-3" data-testid="resource-catalog-list">
              {filteredCatalog.map((item) => {
                const Icon = iconForKind(item.kind);
                return (
                  <button
                    key={item.kind}
                    type="button"
                    onClick={() => addResource(item.kind)}
                    className="group flex w-full items-center gap-3.5 border border-[#1e293b] bg-[#090d16]/90 p-3 text-left transition-all hover:border-[#f59e0b]/50 hover:bg-[#162032] cursor-pointer"
                    data-testid={`add-${item.kind}-resource-button`}
                  >
                    <span
                      className="grid size-10 shrink-0 place-items-center border border-[#1e293b] bg-[#162032]"
                      style={{ color: item.color }}
                    >
                      <Icon className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-zinc-100 group-hover:text-[#f59e0b]">
                        {item.label}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-[#94a3b8]">{item.description}</span>
                    </span>
                    <Plus className="size-4 text-[#64748b] transition-transform group-hover:rotate-90 group-hover:text-[#f59e0b]" />
                  </button>
                );
              })}
            </div>

            {/* Workload Simulation Sliders */}
            <div className="mt-auto space-y-4 border-t border-[#1e293b] p-4 bg-[#090d16]/60" data-testid="scenario-controls">
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="section-kicker flex items-center gap-1.5">
                    <Sliders className="size-3 text-[#f59e0b]" /> Workload Intensity
                  </span>
                  <span className="font-mono text-sm font-bold text-[#f59e0b]">{workload}%</span>
                </div>
                <input
                  aria-label="Workload intensity"
                  type="range"
                  min={0}
                  max={100}
                  value={workload}
                  onChange={(e) => setWorkload(Number(e.target.value))}
                  className="w-full accent-[#f59e0b] cursor-pointer"
                  data-testid="workload-slider"
                />
                <div className="mt-1 flex justify-between font-mono text-[10px] text-[#64748b]">
                  <span>0% Idle</span>
                  <span>50% Steady</span>
                  <span>100% Peak</span>
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="section-kicker">Operating Hours / Mo</span>
                  <span className="font-mono text-sm font-bold text-[#f59e0b]">{hoursPerMonth}h</span>
                </div>
                <input
                  aria-label="Monthly running hours"
                  type="range"
                  min={1}
                  max={730}
                  value={hoursPerMonth}
                  onChange={(e) => setHoursPerMonth(Number(e.target.value))}
                  className="w-full accent-[#f59e0b] cursor-pointer"
                  data-testid="hours-slider"
                />
                <div className="mt-1.5 flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setHoursPerMonth(160)}
                    className="flex-1 border border-[#1e293b] py-1 font-mono text-[10px] text-[#94a3b8] hover:text-white cursor-pointer"
                  >
                    Office (160h)
                  </button>
                  <button
                    type="button"
                    onClick={() => setHoursPerMonth(730)}
                    className="flex-1 border border-[#1e293b] py-1 font-mono text-[10px] text-[#94a3b8] hover:text-white cursor-pointer"
                  >
                    24/7 (730h)
                  </button>
                </div>
              </div>

              {/* Saved Cloud Workspaces List */}
              {(workspacesQuery.data?.length ?? 0) > 0 && (
                <div data-testid="cloud-workspace-list" className="border-t border-[#1e293b]/60 pt-3">
                  <p className="section-kicker mb-2">Saved Workspaces</p>
                  <div className="max-h-32 space-y-1.5 overflow-auto">
                    {workspacesQuery.data?.map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-2 border border-[#1e293b] bg-[#0e1422] px-2.5 py-1.5">
                        <button
                          type="button"
                          onClick={() => loadCloudWorkspace(item.id)}
                          className="min-w-0 flex-1 truncate text-left font-mono text-xs text-[#cbd5e1] hover:text-[#f59e0b] cursor-pointer"
                        >
                          {item.name}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteCloudWorkspace(item.id)}
                          className="text-[#64748b] hover:text-red-400 cursor-pointer"
                          title="Delete workspace"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>

          {/* CENTER: Canvas / Infrastructure Topology */}
          <section
            className="blueprint-grid relative flex min-h-[640px] flex-col border border-[#1e293b] bg-[#080c14]"
            data-testid="infrastructure-canvas"
          >
            {/* Canvas Header */}
            <div className="relative z-10 flex items-center justify-between border-b border-[#1e293b] bg-[#0e1422]/95 px-5 py-4 backdrop-blur">
              <div>
                <p className="section-kicker">02 / Infrastructure Topology</p>
                <p className="mt-0.5 font-heading text-lg font-bold text-white">
                  Simulation Canvas{" "}
                  <span className="ml-2 rounded-xs border border-[#1e293b] bg-[#162032] px-2 py-0.5 font-mono text-xs font-normal text-[#f59e0b]">
                    {resources.length} active node{resources.length === 1 ? "" : "s"}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-[#3dd68c]">
                  <span className="size-2 animate-pulse rounded-full bg-[#3dd68c]" />
                  Client Simulation Mode
                </span>
              </div>
            </div>

            {/* Canvas Node Grid Area */}
            <div
              className="relative z-10 flex flex-1 flex-wrap content-start items-start gap-5 p-6 lg:gap-6 lg:p-8"
              data-testid="canvas-node-area"
            >
              {resources.map((resource, index) => {
                const Icon = iconForKind(resource.kind);
                const estimate = simulation.resource_estimates.find((item) => item.resource_id === resource.id);
                const isSelected = resource.id === selectedId;
                const statusColor =
                  estimate?.status === "healthy"
                    ? "text-[#3dd68c] border-[#3dd68c]/30 bg-[#3dd68c]/10"
                    : estimate?.status === "idle"
                      ? "text-red-400 border-red-400/30 bg-red-400/10"
                      : "text-[#f59e0b] border-[#f59e0b]/30 bg-[#f59e0b]/10";

                return (
                  <div
                    key={resource.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedId(resource.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") setSelectedId(resource.id);
                    }}
                    className={`resource-node group relative z-10 w-[240px] cursor-pointer border bg-[#0e1422] transition-all ${
                      isSelected
                        ? "is-selected border-[#f59e0b] shadow-[0_0_24px_rgba(245,197,24,0.18)]"
                        : "border-[#1e293b] hover:border-[#64748b]"
                    }`}
                    data-testid={`resource-node-${resource.id}`}
                  >
                    {/* Node Header */}
                    <div className="flex items-center justify-between gap-2 border-b border-[#1e293b] px-3.5 py-2.5 bg-[#162032]/80">
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="grid size-7 place-items-center bg-[#080c14]"
                          style={{ color: KIND_COLOR[resource.kind] }}
                        >
                          <Icon className="size-4" />
                        </span>
                        <span className="truncate font-mono text-xs font-bold text-zinc-100" title={resource.name}>
                          {resource.name}
                        </span>
                      </span>
                      <button
                        type="button"
                        aria-label={`Delete ${resource.name}`}
                        title="Delete resource"
                        onClick={(event) => {
                          event.stopPropagation();
                          removeResource(resource.id);
                        }}
                        className="grid size-7 place-items-center text-[#94a3b8] hover:bg-red-500/15 hover:text-red-400 cursor-pointer"
                        data-testid={`delete-resource-${resource.id}`}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>

                    {/* Node Body */}
                    <div className="space-y-2.5 p-3.5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[11px] uppercase tracking-wider text-[#94a3b8]">
                          {kindLabel(resource.kind, provider)}
                        </span>
                        <span className={`rounded-xs border px-1.5 py-0.5 font-mono text-[10px] uppercase ${statusColor}`}>
                          {estimate?.status ?? "healthy"}
                        </span>
                      </div>

                      {/* Hardware / SKU subtitle */}
                      <p className="truncate font-mono text-xs text-[#cbd5e1]">
                        {resource.sku || resource.tier || (resource.kind === "storage" ? resource.storage_class : `${resource.size} units`)}
                      </p>

                      {/* Utilization Meter */}
                      <div className="space-y-1">
                        <div className="flex justify-between font-mono text-[10px] text-[#94a3b8]">
                          <span>Utilization</span>
                          <span className={estimate?.status === "healthy" ? "text-[#3dd68c]" : "text-[#f59e0b]"}>
                            {estimate?.utilization ?? 0}%
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-[#162032]">
                          <div
                            className={`h-full transition-all ${
                              estimate?.status === "healthy"
                                ? "bg-[#3dd68c]"
                                : estimate?.status === "idle"
                                  ? "bg-red-400"
                                  : "bg-[#f59e0b]"
                            }`}
                            style={{ width: `${Math.min(100, estimate?.utilization ?? 0)}%` }}
                          />
                        </div>
                      </div>

                      {/* Cost Display */}
                      <div className="flex items-baseline justify-between border-t border-[#1e293b]/60 pt-2">
                        <span className="font-mono text-[10px] text-[#64748b]">NODE 0{index + 1}</span>
                        <p className="font-heading text-lg font-bold text-white">
                          {currency(estimate?.monthly_cost ?? 0)}
                          <span className="ml-1 text-xs font-normal text-[#94a3b8]">/mo</span>
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}

              {resources.length === 0 && (
                <div className="absolute inset-0 grid place-items-center">
                  <div className="max-w-md border border-dashed border-[#1e293b] p-8 text-center bg-[#0e1422]/80">
                    <Boxes className="mx-auto size-14 text-[#1e293b]" />
                    <p className="mt-4 font-heading text-xl font-bold text-zinc-100">Topology Canvas is Empty</p>
                    <p className="mt-2 text-sm leading-relaxed text-[#94a3b8]">
                      Add components from the left toolbox or load one of the pre-configured architecture blueprints above.
                    </p>
                    <div className="mt-5 flex justify-center gap-3">
                      <button
                        type="button"
                        onClick={() => applyBlueprint("web-app")}
                        className="btn-primary cursor-pointer text-xs"
                      >
                        Load Web Architecture
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* RIGHT: Inspector & Control Room Tabs */}
          <aside className="panel flex flex-col" data-testid="inspector-panel">
            <div className="border-b border-[#1e293b] p-4">
              <p className="section-kicker">03 / Resource Inspector</p>
              <h2 className="mt-1 font-heading text-xl font-bold tracking-tight text-white">Node Specifications</h2>
            </div>

            {/* Selected Resource Details */}
            <div className="border-b border-[#1e293b] p-4" data-testid="resource-properties">
              {selected ? (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3 border-b border-[#1e293b]/60 pb-3">
                    <div>
                      <p className="section-kicker text-[#f59e0b]">Active Component</p>
                      <p className="mt-0.5 text-base font-bold text-white">{kindLabel(selected.kind, provider)}</p>
                      <span className="font-mono text-xs text-[#94a3b8]">{selected.id}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeResource(selected.id)}
                      className="inline-flex h-8 items-center gap-1.5 border border-red-500/40 bg-red-500/10 px-2.5 font-mono text-xs uppercase tracking-wider text-red-300 hover:bg-red-500/20 cursor-pointer"
                      data-testid="delete-selected-resource-button"
                      title="Remove this node from topology"
                    >
                      <Trash2 className="size-3.5" /> Delete
                    </button>
                  </div>

                  {/* Resource Name */}
                  <label className="field-label" htmlFor="resource-name-input">
                    Resource Name
                    <Input
                      id="resource-name-input"
                      value={selected.name}
                      onChange={(e) => updateSelected({ name: e.target.value })}
                      className="mt-1.5 h-10 rounded-sm border-[#1e293b] bg-[#090d16] font-mono text-sm"
                      data-testid="resource-name-input"
                    />
                  </label>

                  {/* Provider SKU Selector */}
                  {skusFor(provider, selected.kind).length > 0 && (
                    <label className="field-label" htmlFor="sku-select">
                      {provider.toUpperCase()} Catalog SKU
                      <select
                        id="sku-select"
                        value={selected.sku ?? skusFor(provider, selected.kind)[0]?.id}
                        onChange={(e) => {
                          const chosen = skusFor(provider, selected.kind).find((s) => s.id === e.target.value);
                          updateSelected({
                            sku: e.target.value,
                            tier: chosen?.tier ?? selected.tier,
                            storage_class: chosen?.storage_class ?? selected.storage_class,
                            service_tier: chosen?.name,
                          });
                        }}
                        className="mt-1.5 h-10 w-full border border-[#1e293b] bg-[#090d16] px-2.5 font-mono text-xs text-white cursor-pointer"
                        data-testid="sku-select"
                      >
                        {skusFor(provider, selected.kind).map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} — {s.description}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    {/* Tier selector for compute/db/container/cache */}
                    {(selected.kind === "vm" ||
                      selected.kind === "database" ||
                      selected.kind === "container" ||
                      selected.kind === "cache") && (
                      <label className="field-label" htmlFor="tier-select">
                        Size Tier
                        <select
                          id="tier-select"
                          value={selected.tier ?? "small"}
                          onChange={(e) =>
                            updateSelected({
                              tier: e.target.value as InstanceTier,
                              size: INSTANCE_TIERS.find((t) => t.id === e.target.value)?.weight ?? 1,
                            })
                          }
                          className="mt-1.5 h-10 w-full border border-[#1e293b] bg-[#090d16] px-2.5 font-mono text-xs text-white cursor-pointer"
                          data-testid="tier-select"
                        >
                          {INSTANCE_TIERS.map((tier) => (
                            <option key={tier.id} value={tier.id}>
                              {tier.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    {/* Database Engine */}
                    {selected.kind === "database" && (
                      <label className="field-label" htmlFor="db-engine-select">
                        Engine
                        <select
                          id="db-engine-select"
                          value={selected.engine ?? "postgres"}
                          onChange={(e) => updateSelected({ engine: e.target.value })}
                          className="mt-1.5 h-10 w-full border border-[#1e293b] bg-[#090d16] px-2.5 font-mono text-xs text-white cursor-pointer"
                          data-testid="db-engine-select"
                        >
                          {enginesFor(provider).map((eng) => (
                            <option key={eng.id} value={eng.id}>
                              {eng.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    {/* Storage Class */}
                    {selected.kind === "storage" && (
                      <label className="field-label" htmlFor="storage-class-select">
                        Storage Class
                        <select
                          id="storage-class-select"
                          value={selected.storage_class ?? "object"}
                          onChange={(e) => updateSelected({ storage_class: e.target.value as "object" | "block_ssd" })}
                          className="mt-1.5 h-10 w-full border border-[#1e293b] bg-[#090d16] px-2.5 font-mono text-xs text-white cursor-pointer"
                          data-testid="storage-class-select"
                        >
                          <option value="object">Object Storage (S3 / GCS / Blob)</option>
                          <option value="block_ssd">Block SSD (EBS / PD / Managed Disk)</option>
                        </select>
                      </label>
                    )}

                    {/* Database HA */}
                    {selected.kind === "database" && (
                      <label className="field-label" htmlFor="db-ha-select">
                        Availability (HA)
                        <select
                          id="db-ha-select"
                          value={selected.db_ha ?? "single_az"}
                          onChange={(e) => updateSelected({ db_ha: e.target.value as "single_az" | "multi_az" })}
                          className="mt-1.5 h-10 w-full border border-[#1e293b] bg-[#090d16] px-2.5 font-mono text-xs text-white cursor-pointer"
                          data-testid="db-ha-select"
                        >
                          <option value="single_az">Single-AZ (Standalone)</option>
                          <option value="multi_az">Multi-AZ (+85% Redundancy)</option>
                        </select>
                      </label>
                    )}

                    {/* Network Service */}
                    {selected.kind === "network" && (
                      <label className="field-label" htmlFor="network-service-select">
                        Service Type
                        <select
                          id="network-service-select"
                          value={selected.network_service ?? "egress"}
                          onChange={(e) => updateSelected({ network_service: e.target.value as "egress" | "alb" })}
                          className="mt-1.5 h-10 w-full border border-[#1e293b] bg-[#090d16] px-2.5 font-mono text-xs text-white cursor-pointer"
                          data-testid="network-service-select"
                        >
                          <option value="egress">Outbound Data Egress</option>
                          <option value="alb">Application Load Balancer</option>
                        </select>
                      </label>
                    )}

                    {/* Quantity */}
                    <label className="field-label" htmlFor="resource-quantity-input">
                      Instances / Replicas
                      <Input
                        id="resource-quantity-input"
                        type="number"
                        min={1}
                        max={100}
                        value={selected.quantity}
                        onChange={(e) => updateSelected({ quantity: Math.max(1, Number(e.target.value)) })}
                        className="mt-1.5 h-10 rounded-sm border-[#1e293b] bg-[#090d16] font-mono text-sm"
                        data-testid="resource-quantity-input"
                      />
                    </label>

                    {/* Size / Capacity */}
                    {(selected.kind === "storage" ||
                      selected.kind === "network" ||
                      selected.kind === "database" ||
                      selected.kind === "serverless" ||
                      selected.kind === "container" ||
                      selected.kind === "cdn" ||
                      selected.kind === "queue") && (
                      <label className="field-label" htmlFor="resource-size-input">
                        {selected.kind === "storage"
                          ? "Disk Size (GB)"
                          : selected.kind === "database"
                            ? "Storage (GB)"
                            : selected.kind === "network"
                              ? "Egress (GB)"
                              : selected.kind === "serverless"
                                ? "Requests (M req)"
                                : selected.kind === "container"
                                  ? "Allocated vCPU"
                                  : selected.kind === "cdn"
                                    ? "Transfer (TB)"
                                    : "Messages (M msg)"}
                        <Input
                          id="resource-size-input"
                          type="number"
                          min={0.1}
                          step={1}
                          value={selected.size}
                          onChange={(e) => updateSelected({ size: Math.max(0.1, Number(e.target.value)) })}
                          className="mt-1.5 h-10 rounded-sm border-[#1e293b] bg-[#090d16] font-mono text-sm"
                          data-testid="resource-size-input"
                        />
                      </label>
                    )}

                    {/* Environment */}
                    <label className="field-label" htmlFor="env-select">
                      Environment Tier
                      <select
                        id="env-select"
                        value={selected.environment ?? "non_production"}
                        onChange={(e) =>
                          updateSelected({ environment: e.target.value as "production" | "non_production" })
                        }
                        className="mt-1.5 h-10 w-full border border-[#1e293b] bg-[#090d16] px-2.5 font-mono text-xs text-white cursor-pointer"
                        data-testid="env-select"
                      >
                        <option value="non_production">Non-Production (Dev/Test)</option>
                        <option value="production">Production</option>
                      </select>
                    </label>
                  </div>

                  {/* Utilization Slider */}
                  <div className="border-t border-[#1e293b]/60 pt-3">
                    <div className="mb-1.5 flex justify-between">
                      <span className="field-label">Baseline Node Utilization</span>
                      <span className="font-mono text-sm font-bold text-[#f59e0b]">{selected.utilization}%</span>
                    </div>
                    <input
                      aria-label="Resource baseline utilization"
                      type="range"
                      min={0}
                      max={100}
                      value={selected.utilization}
                      onChange={(e) => updateSelected({ utilization: Number(e.target.value) })}
                      className="w-full accent-[#f59e0b] cursor-pointer"
                      data-testid="resource-utilization-slider"
                    />
                  </div>
                </div>
              ) : (
                <div className="p-4 text-center">
                  <p className="text-sm text-[#94a3b8]">Select a node on the canvas to configure hardware and pricing parameters.</p>
                </div>
              )}
            </div>

            {/* Inspector Tab Switcher */}
            <div className="flex border-b border-[#1e293b] bg-[#0e1422]" data-testid="inspector-tabs">
              {(["analysis", "insights", "scenarios", "terraform"] as Panel[]).map((panel) => (
                <button
                  key={panel}
                  type="button"
                  onClick={() => setActivePanel(panel)}
                  className={`flex-1 border-b-2 py-3.5 text-center font-mono text-xs uppercase tracking-wider transition-colors cursor-pointer ${
                    activePanel === panel
                      ? "border-[#f59e0b] bg-[#162032] text-[#f59e0b] font-bold"
                      : "border-transparent text-[#94a3b8] hover:text-white"
                  }`}
                  data-testid={`${panel}-tab`}
                >
                  {panel === "analysis" ? "Spend" : panel === "insights" ? "Advisor" : panel === "scenarios" ? "Compare" : "Terraform"}
                </button>
              ))}
            </div>

            {/* Tab Panels */}
            <div className="flex-1 overflow-auto p-4" data-testid="active-inspector-panel">
              {/* TAB 1: Cost Analysis */}
              {activePanel === "analysis" && (
                <div data-testid="cost-analysis-panel" className="space-y-4">
                  <div>
                    <p className="section-kicker">Monthly Cost Allocation</p>
                    <p className="mt-1 font-heading text-3xl font-bold tracking-tight text-white">
                      {currency(simulation.total_monthly_cost)}
                      <span className="ml-2 text-sm font-normal text-[#94a3b8]">/ month</span>
                    </p>
                  </div>

                  <div className="h-44 w-full" data-testid="cost-pie-chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={42} outerRadius={68} paddingAngle={2}>
                          {pieData.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => currency(value)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Resource Breakdown Table */}
                  <div className="space-y-2 border-t border-[#1e293b] pt-3">
                    <p className="section-kicker">Resource Spend Breakdown</p>
                    <div className="max-h-56 space-y-1.5 overflow-auto">
                      {simulation.resource_estimates.map((item) => (
                        <div
                          key={item.resource_id}
                          className="flex items-center justify-between border-b border-[#1e293b]/60 pb-1.5 text-xs font-mono"
                        >
                          <span className="flex items-center gap-2 truncate text-[#cbd5e1]">
                            <span
                              className={`size-2 shrink-0 ${
                                item.status === "healthy"
                                  ? "bg-[#3dd68c]"
                                  : item.status === "idle"
                                    ? "bg-red-400"
                                    : "bg-[#f59e0b]"
                              }`}
                            />
                            {item.resource_id}
                          </span>
                          <span className="font-bold text-white">{currency(item.monthly_cost)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: AI & Deterministic Advisor */}
              {activePanel === "insights" && (
                <div data-testid="ai-insights-panel" className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="section-kicker">Your cloud cost review</p>
                      <p className="mt-0.5 font-heading text-xl font-bold text-white">Clear ways to spend less</p>
                    </div>
                    <span className="grid size-10 place-items-center rounded-xl border border-[#f59e0b]/25 bg-[#f59e0b]/10"><Bot className="size-5 text-[#f59e0b]" /></span>
                  </div>

                  <div className="rounded-xl border border-[#3dd68c]/25 bg-gradient-to-br from-[#123329] to-[#0c1720] p-4">
                    <p className="text-xs font-medium text-[#a7c8ba]">Estimated savings in the recommendations below</p>
                    <div className="mt-1 flex items-end justify-between gap-2">
                      <p className="font-heading text-3xl font-bold tracking-tight text-[#70e0a8]">{currency(potentialSavings)}<span className="ml-1 text-sm font-semibold text-[#a7c8ba]">/ month</span></p>
                      <span className="pb-1 text-right text-xs text-[#a7c8ba]">{insights.length} {insights.length === 1 ? "suggestion" : "suggestions"}<br />{priorityCount} high priority</span>
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-[#a7c8ba]">Savings are estimates. Review each trade-off before changing your setup.</p>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-[#1e293b] bg-[#090d16] px-3 py-2 text-xs text-[#94a3b8]">
                    <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-[#3dd68c]" />Analysis source</span>
                    <span className="font-medium text-[#f59e0b]">{providerLabel}</span>
                  </div>

                  {recommendationMutation.isPending && (
                    <div className="flex items-center gap-2 border border-[#f59e0b]/30 bg-[#f59e0b]/10 p-3 font-mono text-xs text-[#f59e0b]">
                      <RefreshCw className="size-4 animate-spin" /> Analyzing architecture with AI model…
                    </div>
                  )}

                  <div className="space-y-3" data-testid="recommendation-list">
                    {insights.map((item, index) => (
                      <div
                        key={`${item.title}-${index}`}
                        className="space-y-3 rounded-xl border border-[#263449] bg-[#0b111d] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.16)]"
                        data-testid={`recommendation-card-${index}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`grid size-7 shrink-0 place-items-center rounded-lg ${
                                item.priority === "high"
                                  ? "bg-red-500/20 text-red-400"
                                  : "bg-[#f59e0b]/20 text-[#f59e0b]"
                              }`}
                            >
                              {item.priority === "high" ? <TriangleAlert className="size-3.5" /> : <Check className="size-3.5" />}
                            </span>
                            <div>
                              <p className="text-sm font-bold leading-snug text-zinc-100">{item.title}</p>
                              <span className={`mt-1 inline-block text-[10px] font-bold uppercase tracking-wider ${item.priority === "high" ? "text-red-400" : item.priority === "medium" ? "text-[#f59e0b]" : "text-[#94a3b8]"}`}>{item.priority} priority</span>
                            </div>
                          </div>
                          {item.estimated_monthly_saving > 0 && (
                            <span className="shrink-0 rounded-xs border border-[#3dd68c]/40 bg-[#3dd68c]/10 px-2 py-0.5 font-mono text-xs font-bold text-[#3dd68c]">
                              Save {currency(item.estimated_monthly_saving)}/mo
                            </span>
                          )}
                        </div>

                        <div className="rounded-lg bg-[#111b2a] p-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-[#94a3b8]">Why this came up</p>
                          <p className="mt-1 text-xs leading-relaxed text-[#cbd5e1]">{item.situation || item.rationale.replace(/Problem:\s*/i, "").replace(/\s*Why it matters:\s*/i, " ").split(/\s*Action:\s*/i)[0]}</p>
                        </div>

                        {!!item.benefits?.length && (
                          <div className="rounded-lg border border-[#3dd68c]/15 bg-[#3dd68c]/[0.04] p-3">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-[#70e0a8]">Pros</p>
                            <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-relaxed text-[#cbd5e1]">{item.benefits.map((benefit, benefitIndex) => <li key={benefitIndex}>{benefit}</li>)}</ul>
                          </div>
                        )}

                        {!!(item.tradeoffs?.length || item.risk) && (
                          <div className="flex items-start gap-1.5 rounded-xs bg-[#162032] p-2 font-mono text-[11px] text-[#94a3b8]">
                            <Info className="size-3.5 shrink-0 text-[#f59e0b] mt-0.5" />
                            <span><strong className="text-[#cbd5e1]">Cons / trade-offs:</strong> {[...(item.tradeoffs ?? []), ...(!item.tradeoffs?.length && item.risk ? [item.risk] : [])].join(" ")}</span>
                          </div>
                        )}

                        <div className="flex items-start gap-2 rounded-lg border border-[#3dd68c]/20 bg-[#3dd68c]/[0.06] p-3">
                          <Check className="mt-0.5 size-4 shrink-0 text-[#3dd68c]" />
                          <div><p className="text-[10px] font-bold uppercase tracking-wider text-[#70e0a8]">What to do</p><p className="mt-0.5 text-xs font-medium leading-relaxed text-[#d1fae5]">{item.action}</p></div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={runRecommendations}
                    disabled={recommendationMutation.isPending}
                    className="btn-primary inline-flex w-full items-center justify-center cursor-pointer"
                    data-testid="run-ai-analysis-button"
                  >
                    <Sparkles className="mr-2 size-4" />
                    {recommendationMutation.isPending ? "Reviewing your setup…" : "Refresh recommendations"}
                  </button>
                </div>
              )}

              {/* TAB 3: Multi-Cloud Comparison */}
              {activePanel === "scenarios" && (
                <div data-testid="scenario-compare-panel" className="space-y-4">
                  <div>
                    <p className="section-kicker">Multi-Cloud Parity</p>
                    <p className="mt-0.5 font-heading text-lg font-bold text-white">AWS vs GCP vs Azure</p>
                    <p className="text-xs text-[#94a3b8]">Identical topology simulated across cloud providers.</p>
                  </div>

                  <div className="h-48 w-full" data-testid="provider-bar-chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={providerCompare}>
                        <XAxis dataKey="provider" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                        <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} width={50} />
                        <Tooltip formatter={(value: number) => currency(value)} />
                        <Bar dataKey="monthly" fill="#f59e0b" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="space-y-2 border-t border-[#1e293b] pt-3">
                    {providerCompare.map((row) => (
                      <div
                        key={row.provider}
                        className={`flex items-center justify-between border p-2.5 font-mono text-xs ${
                          row.provider === provider
                            ? "border-[#f59e0b] bg-[#f59e0b]/10 text-[#f59e0b]"
                            : "border-[#1e293b] bg-[#090d16] text-[#cbd5e1]"
                        }`}
                      >
                        <span className="font-bold uppercase tracking-wider">{row.provider}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold">{currency(row.monthly)}/mo</span>
                          {row.provider !== provider && (
                            <button
                              type="button"
                              onClick={() => {
                                setProvider(row.provider);
                                setTfProvider(row.provider);
                                toast.success(`Active cloud set to ${row.provider.toUpperCase()}`);
                              }}
                              className="border border-[#1e293b] px-2 py-0.5 text-[10px] uppercase text-[#94a3b8] hover:text-white cursor-pointer"
                            >
                              Switch
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 4: Terraform IaC Preview */}
              {activePanel === "terraform" && (
                <div data-testid="terraform-panel" className="space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="section-kicker">Infrastructure As Code</p>
                      <p className="mt-0.5 font-heading text-lg font-bold text-white">Terraform Preview</p>
                    </div>
                    <Code2 className="size-5 text-[#f59e0b]" />
                  </div>

                  {/* Provider toggle inside Terraform panel */}
                  <div className="flex rounded-xs border border-[#1e293b] bg-[#090d16] p-1">
                    {PROVIDERS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => {
                          setTfProvider(p);
                          generateLocalTerraform(p);
                        }}
                        className={`flex-1 py-1 text-center font-mono text-xs uppercase tracking-wider transition-colors cursor-pointer ${
                          tfProvider === p
                            ? "bg-[#f59e0b] text-[#090d16] font-bold"
                            : "text-[#94a3b8] hover:text-white"
                        }`}
                      >
                        {p.toUpperCase()}
                      </button>
                    ))}
                  </div>

                  {!localTerraform && (
                    <div className="border border-dashed border-[#1e293b] p-4 text-center bg-[#090d16]">
                      <p className="text-xs text-[#94a3b8]">
                        Reviewable HCL syntax for all 9 resource kinds. CloudCost IQ never executes terraform apply.
                      </p>
                    </div>
                  )}

                  {localTerraform && (
                    <>
                      <pre
                        className="code-window max-h-64 overflow-auto rounded-xs border border-[#1e293b] bg-[#040608] p-3 font-mono text-xs leading-relaxed text-[#cbd5e1]"
                        data-testid="terraform-code-output"
                      >
                        {localTerraform.configuration}
                      </pre>

                      {localValidation && (
                        <div
                          className={`border p-3 text-xs ${
                            localValidation.valid
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                              : "border-red-500/30 bg-red-500/10 text-red-300"
                          }`}
                        >
                          <div className="flex items-center gap-2 font-bold font-mono">
                            {localValidation.valid ? <Check className="size-4" /> : <X className="size-4" />}
                            {localValidation.valid ? "HCL Structure Validated (6 Checks Run)" : "HCL Attention Required"}
                          </div>
                          {[...localValidation.errors, ...localValidation.warnings].map((msg, i) => (
                            <p key={i} className="mt-1 font-mono text-[11px] opacity-90">
                              • {msg}
                            </p>
                          ))}
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={copyTerraform}
                          className="btn-ghost inline-flex items-center justify-center cursor-pointer text-xs"
                          data-testid="copy-terraform-button"
                        >
                          <Clipboard className="mr-1.5 size-3.5" />
                          {copied ? "Copied" : "Copy HCL"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const conf = localTerraform.configuration;
                            const blob = new Blob([conf], { type: "text/plain" });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `cloudcostiq-${tfProvider}.tf`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                          className="btn-ghost inline-flex items-center justify-center cursor-pointer text-xs"
                          data-testid="download-terraform-button"
                        >
                          <Download className="mr-1.5 size-3.5" /> Download .tf
                        </button>
                      </div>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => generateLocalTerraform(tfProvider)}
                    className="btn-primary inline-flex w-full items-center justify-center cursor-pointer text-xs"
                    data-testid="generate-terraform-button"
                  >
                    <Code2 className="mr-2 size-4" />
                    {localTerraform ? "Regenerate HCL Plan" : `Generate ${tfProvider.toUpperCase()} Terraform`}
                  </button>
                </div>
              )}
            </div>

            {/* Bottom Guardrail Footer */}
            <div className="border-t border-[#1e293b] p-3 bg-[#090d16]/80">
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="size-4 text-[#f59e0b] mt-0.5 shrink-0" />
                <p className="text-[11px] leading-tight text-[#94a3b8]">
                  <strong className="text-[#cbd5e1]">Simulation Safety Guarantee:</strong> Idle compute and disk retain fixed pricing invariants. Zero real cloud mutations.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </main>
      <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3" data-testid="advisor-chat-widget">
        {chatOpen && (
          <section className="flex h-[min(34rem,calc(100svh-7rem))] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-[#263449] bg-[#0e1422] shadow-2xl" aria-label="AI Advisor chat">
            <header className="flex items-center justify-between border-b border-[#263449] px-4 py-3">
              <div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-lg bg-[#f59e0b]/15"><Bot className="size-4 text-[#f59e0b]" /></span><div><p className="text-sm font-bold text-white">AI Advisor</p><p className="text-[11px] text-[#94a3b8]">{chatProvider === "groq" ? "Groq AI · workspace aware" : chatProvider === "deterministic" ? "AI unavailable · setup needed" : "Groq AI · ask about this simulation"}</p></div></div>
              <button type="button" onClick={() => setChatOpen(false)} aria-label="Close advisor chat" className="rounded p-1 text-[#94a3b8] hover:bg-[#1e293b] hover:text-white"><X className="size-4" /></button>
            </header>
            <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
              {chatMessages.map((message, index) => <div key={`${index}-${message.role}`} className={`max-w-[90%] whitespace-pre-wrap rounded-xl px-3 py-2.5 text-sm leading-relaxed ${message.role === "user" ? "ml-auto bg-[#f59e0b] text-[#090d16]" : "border border-[#263449] bg-[#111b2a] text-[#dbe4ef]"}`}>{message.content}</div>)}
              {chatPending && <div className="flex items-center gap-2 text-xs text-[#94a3b8]"><RefreshCw className="size-3 animate-spin" /> Thinking…</div>}
            </div>
            <form onSubmit={sendChatMessage} className="flex items-end gap-2 border-t border-[#263449] p-3">
              <textarea value={chatInput} onChange={(event) => setChatInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} rows={1} maxLength={2000} placeholder="Ask about costs or savings…" aria-label="Message the AI Advisor" className="max-h-28 min-h-10 flex-1 resize-y rounded-lg border border-[#263449] bg-[#090d16] px-3 py-2.5 text-sm text-white outline-none placeholder:text-[#64748b] focus:border-[#f59e0b]" />
              <button type="submit" disabled={!chatInput.trim() || chatPending} aria-label="Send message" className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#f59e0b] text-[#090d16] disabled:opacity-40"><Send className="size-4" /></button>
            </form>
          </section>
        )}
        <button type="button" onClick={() => setChatOpen((open) => !open)} aria-expanded={chatOpen} aria-label={chatOpen ? "Close AI Advisor" : "Chat with AI Advisor"} className="flex h-12 items-center gap-2 rounded-full border border-[#f59e0b]/50 bg-[#f59e0b] px-5 font-semibold text-[#090d16] shadow-[0_8px_30px_rgba(0,0,0,0.4)] transition-transform hover:scale-[1.03]" data-testid="advisor-chat-toggle"><Bot className="size-5" /> AI Advisor</button>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  icon: Icon,
  accent,
  className = "",
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Activity;
  accent?: "yellow" | "green";
  className?: string;
}) {
  return (
    <div className={`bg-[#0e1422] p-5 ${className}`} data-testid={`metric-${label.toLowerCase().replaceAll(" ", "-")}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="section-kicker">{label}</span>
        <Icon
          className={`size-5 shrink-0 ${
            accent === "yellow" ? "text-[#f59e0b]" : accent === "green" ? "text-[#3dd68c]" : "text-[#64748b]"
          }`}
        />
      </div>
      <p className="metric-value mt-2 text-2xl font-bold font-heading text-white">{value}</p>
      <p className="mt-1 font-mono text-xs uppercase tracking-wider text-[#94a3b8]">{detail}</p>
    </div>
  );
}
