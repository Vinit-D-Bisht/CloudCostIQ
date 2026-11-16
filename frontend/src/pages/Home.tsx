import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Activity,
  ArrowUpRight,
  Boxes,
  Bot,
  Check,
  ChevronRight,
  Clipboard,
  Cloud,
  Code2,
  Container,
  Database,
  Download,
  Gauge,
  HardDrive,
  Layers,
  LogOut,
  MessageSquare,
  Network,
  Play,
  Plus,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  Sparkles,
  Trash2,
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
import { catalogFor, kindLabel } from "@/lib/catalog";
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

const KIND_COLOR: Record<ResourceKind, string> = {
  vm: "#f5c518",
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
  const [workspaceName, setWorkspaceName] = useState("untitled-01");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState(starterResources[0]?.id ?? "");
  const [activePanel, setActivePanel] = useState<Panel>("analysis");
  const [copied, setCopied] = useState(false);
  const [localTerraform, setLocalTerraform] = useState<TerraformResponse | null>(null);
  const [localValidation, setLocalValidation] = useState<TerraformValidation | null>(null);

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
    onSuccess: () => toast.success("Simulation confirmed", { description: "Server analysis matches the live model." }),
    onError: () => toast.error("Simulation unavailable", { description: "Showing the live local estimate instead." }),
  });

  const recommendationMutation = useMutation({
    mutationFn: (input: RecommendationRequest) => apiPost<RecommendationResponse>("/recommendations", input),
    onSuccess: (data) =>
      toast.success("Optimization pass complete", { description: `Engine: ${data.provider}.` }),
    onError: () => toast.error("Recommendation engine unreachable — using local rules"),
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
      toast.success("Workspace saved to cloud");
    },
    onError: () => toast.error("Could not save workspace — sign in required"),
  });

  const simulation = simulationMutation.data ?? preview;
  const riskyResources = simulation.resource_estimates.filter((item) => item.status !== "healthy").length;
  const aiData = recommendationMutation.data;
  const providerLabel =
    aiData?.provider === "free_api"
      ? "API fallback"
      : aiData?.provider === "ollama"
        ? "Ollama"
        : aiData
          ? "Rules engine"
          : "Local rules";

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

  function addResource(kind: ResourceKind) {
    const meta = catalogFor(provider).find((item) => item.kind === kind);
    const count = resources.filter((resource) => resource.kind === kind).length + 1;
    const id = `${kind}-${Date.now()}`;
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
      environment: "non_production",
    };
    setResources((current) => [...current, next]);
    setSelectedId(id);
    toast.success(`${kindLabel(kind, provider)} added`);
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
    toast.success("Resource removed");
  }

  function applyBlueprint(id: string) {
    const blueprint = BLUEPRINTS.find((item) => item.id === id);
    if (!blueprint) return;
    setResources(blueprint.resources.map((item) => ({ ...item, region })));
    setWorkload(blueprint.workload);
    setSelectedId(blueprint.resources[0]?.id ?? "");
    setWorkspaceName(blueprint.name.toLowerCase().replace(/\s+/g, "-"));
    toast.success(`Loaded ${blueprint.name}`);
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
      toast.success("Workspace restored — costs recomputed live");
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

  function generateLocalTerraform() {
    const configuration = generateTerraform(resources, provider);
    setLocalTerraform({
      configuration,
      resource_count: resources.length,
      estimated_monthly_cost: simulation.total_monthly_cost,
    });
    setLocalValidation(validateTerraform(resources, provider, configuration));
    toast.success("Terraform generated");
  }

  async function copyTerraform() {
    const configuration = localTerraform?.configuration ?? "";
    if (!configuration) return;
    await navigator.clipboard.writeText(configuration);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
    toast.success("Terraform copied");
  }

  function exportCsv() {
    const csv = buildCostCsv(resources, simulation, {
      provider,
      pricingModel,
      region,
    });
    downloadCsv(`cloudcostiq-${workspaceName}.csv`, csv);
    toast.success("CSV exported");
  }

  const insights = aiData?.recommendations ?? localRules;

  return (
    <div className="min-h-svh text-[#f4f7fb]" data-testid="cloudcostiq-app-shell">
      <header
        className="sticky top-0 z-30 border-b border-[#243041]/90 bg-[#07080b]/90 backdrop-blur-xl"
        data-testid="workspace-header"
      >
        <div className="flex min-h-20 flex-wrap items-center justify-between gap-4 px-5 py-3 lg:px-8">
          <div className="flex items-center gap-4">
            <div
              className="grid size-12 place-items-center border border-[#f5c518]/50 bg-[#f5c518] text-[#0a0b0f] shadow-[0_0_28px_rgba(245,197,24,0.25)]"
              data-testid="brand-mark"
            >
              <Zap className="size-6" strokeWidth={2.5} />
            </div>
            <div>
              <p className="font-heading text-2xl font-bold tracking-tight text-white" data-testid="brand-name">
                CLOUDCOST <span className="text-[#f5c518]">IQ</span>
              </p>
              <p className="mt-0.5 font-mono text-xs uppercase tracking-[0.2em] text-[#8fa3b8]">
                Infrastructure simulation lab
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2" data-testid="header-controls">
            <select
              aria-label="Cloud provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value as CloudProvider)}
              className="control-chip"
              data-testid="provider-switcher"
            >
              {PROVIDERS.map((item) => (
                <option key={item} value={item}>
                  {item.toUpperCase()}
                </option>
              ))}
            </select>
            <select
              aria-label="Pricing model"
              value={pricingModel}
              onChange={(e) => setPricingModel(e.target.value as PricingModel)}
              className="control-chip"
              data-testid="pricing-model-select"
            >
              {PRICING_MODELS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Region"
              value={region}
              onChange={(e) => setRegion(e.target.value as RegionKey)}
              className="control-chip"
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
              className="btn-primary inline-flex items-center"
              data-testid="run-simulation-button"
            >
              {simulationMutation.isPending ? (
                <RefreshCw className="mr-2 size-4 animate-spin" />
              ) : (
                <Play className="mr-2 size-4" />
              )}
              Run simulation
            </button>
            <button type="button" onClick={exportCsv} className="btn-ghost inline-flex items-center" data-testid="export-csv-button">
              <Download className="mr-2 size-4" /> CSV
            </button>
            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="btn-ghost inline-flex items-center"
              data-testid="save-workspace-button"
            >
              <Save className="mr-2 size-4" /> Save
            </button>
            <button
              type="button"
              onClick={() => endSession("/login")}
              className="btn-ghost inline-flex items-center gap-2"
              data-testid="sign-out-button"
            >
              <LogOut className="size-4" />
              <span className="max-w-[9rem] truncate">{user?.display_name}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1800px] p-5 lg:p-7" data-testid="workspace-main">
        <div className="mb-5 flex flex-wrap items-center gap-3 rise-in" data-testid="blueprint-row">
          <span className="section-kicker mr-1">Blueprints</span>
          {BLUEPRINTS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => applyBlueprint(item.id)}
              className="border border-[#243041] bg-[#0c1017] px-4 py-2.5 font-mono text-sm uppercase tracking-wider text-[#c4d0dc] transition-colors hover:border-[#f5c518]/50 hover:text-[#f5c518]"
              data-testid={`blueprint-${item.id}`}
              title={item.description}
            >
              {item.name}
            </button>
          ))}
          <Input
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            className="ml-auto h-11 w-52 rounded-sm border-[#243041] bg-[#0a0e14] font-mono text-sm"
            data-testid="workspace-name-input"
          />
        </div>

        <div
          className="mb-5 grid grid-cols-1 gap-px border border-[#243041] bg-[#243041] sm:grid-cols-2 xl:grid-cols-4"
          data-testid="metric-strip"
        >
          <Metric
            className="rise-in rise-in-delay-1"
            label="Modeled spend / month"
            value={currency(simulation.total_monthly_cost)}
            detail="est. at current workload"
            icon={Activity}
          />
          <Metric
            className="rise-in rise-in-delay-2"
            label="Right-sizing savings"
            value={currency(simulation.estimated_savings)}
            detail={`${riskyResources} signal${riskyResources === 1 ? "" : "s"}`}
            icon={Gauge}
            accent="yellow"
          />
          <Metric
            className="rise-in rise-in-delay-3"
            label="Utilization score"
            value={`${simulation.utilization_score}%`}
            detail={`${hoursPerMonth}h / month`}
            icon={Zap}
            accent="green"
          />
          <Metric
            className="rise-in rise-in-delay-4"
            label="Annual projection"
            value={currency(simulation.projected_annual_cost)}
            detail={`${provider.toUpperCase()} · ${pricingModel}`}
            icon={ArrowUpRight}
          />
        </div>

        <div
          className="grid min-h-[calc(100vh-240px)] grid-cols-1 gap-5 xl:grid-cols-[280px_minmax(480px,1fr)_420px]"
          data-testid="builder-grid"
        >
          <aside className="panel flex flex-col" data-testid="resource-toolbox">
            <div className="border-b border-[#243041] px-5 py-5">
              <p className="section-kicker">01 / toolbox</p>
              <h2 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-white">Build your stack</h2>
              <p className="mt-2 text-sm leading-relaxed text-[#8fa3b8]">
                Drop services onto the canvas. Nothing here provisions a real cloud.
              </p>
            </div>
            <div className="max-h-[52vh] space-y-3 overflow-auto p-4" data-testid="resource-catalog-list">
              {catalogFor(provider).map((item) => {
                const Icon = iconForKind(item.kind);
                return (
                  <button
                    key={item.kind}
                    type="button"
                    onClick={() => addResource(item.kind)}
                    className="group flex w-full items-center gap-4 border border-[#243041] bg-[#0a0e14]/80 p-4 text-left transition-colors hover:border-[#f5c518]/40"
                    data-testid={`add-${item.kind}-resource-button`}
                  >
                    <span
                      className="grid size-12 shrink-0 place-items-center border border-[#243041] bg-[#10141c]"
                      style={{ color: item.color }}
                    >
                      <Icon className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-semibold text-zinc-100">{item.label}</span>
                      <span className="mt-1 block text-sm leading-snug text-[#8fa3b8]">{item.description}</span>
                    </span>
                    <Plus className="size-5 text-[#5a6b7d] transition-transform group-hover:rotate-90 group-hover:text-[#f5c518]" />
                  </button>
                );
              })}
            </div>
            <div className="mt-auto space-y-5 border-t border-[#243041] p-4" data-testid="scenario-controls">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="section-kicker">Workload</span>
                  <span className="font-mono text-base text-[#f5c518]">{workload}%</span>
                </div>
                <input
                  aria-label="Workload intensity"
                  type="range"
                  min={0}
                  max={100}
                  value={workload}
                  onChange={(e) => setWorkload(Number(e.target.value))}
                  className="w-full accent-[#f5c518]"
                  data-testid="workload-slider"
                />
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="section-kicker">Hours / month</span>
                  <span className="font-mono text-base text-[#f5c518]">{hoursPerMonth}h</span>
                </div>
                <input
                  aria-label="Monthly running hours"
                  type="range"
                  min={1}
                  max={730}
                  value={hoursPerMonth}
                  onChange={(e) => setHoursPerMonth(Number(e.target.value))}
                  className="w-full accent-[#f5c518]"
                  data-testid="hours-slider"
                />
              </div>
              {(workspacesQuery.data?.length ?? 0) > 0 && (
                <div data-testid="cloud-workspace-list">
                  <p className="section-kicker mb-2">Saved workspaces</p>
                  <div className="max-h-40 space-y-2 overflow-auto">
                    {workspacesQuery.data?.map((item) => (
                      <div key={item.id} className="flex items-center gap-2 border border-[#243041] px-3 py-2">
                        <button
                          type="button"
                          onClick={() => loadCloudWorkspace(item.id)}
                          className="min-w-0 flex-1 truncate text-left text-sm text-[#d7e0ea] hover:text-[#f5c518]"
                        >
                          {item.name}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteCloudWorkspace(item.id)}
                          className="text-[#5a6b7d] hover:text-red-400"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>

          <section
            className="blueprint-grid relative flex min-h-[640px] flex-col border border-[#243041]"
            data-testid="infrastructure-canvas"
          >
            <div className="relative z-10 flex items-center justify-between border-b border-[#243041] bg-[#0c1017]/92 px-5 py-4 backdrop-blur">
              <div>
                <p className="section-kicker">02 / topology</p>
                <p className="mt-1 font-heading text-xl font-semibold text-white">
                  Simulation canvas{" "}
                  <span className="ml-2 font-mono text-sm font-normal text-[#8fa3b8]">{resources.length} nodes</span>
                </p>
              </div>
              <span className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-[#3dd68c]">
                <span className="size-2 animate-pulse rounded-full bg-[#3dd68c]" />
                no cloud resources created
              </span>
            </div>
            <div
              className="relative z-10 flex flex-1 flex-wrap content-start items-start gap-5 p-6 lg:gap-8 lg:p-10"
              data-testid="canvas-node-area"
            >
              {resources.map((resource, index) => {
                const Icon = iconForKind(resource.kind);
                const estimate = simulation.resource_estimates.find((item) => item.resource_id === resource.id);
                const isSelected = resource.id === selectedId;
                return (
                  <div
                    key={resource.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedId(resource.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") setSelectedId(resource.id);
                    }}
                    className={`resource-node group relative z-10 w-[220px] cursor-pointer border ${
                      isSelected ? "is-selected border-[#f5c518]" : "border-[#2c3b50] hover:border-[#5a6b7d]"
                    }`}
                    data-testid={`resource-node-${resource.id}`}
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-[#243041] px-4 py-3">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className="grid size-8 place-items-center bg-[#0a0e14] text-[#f5c518]">
                          <Icon className="size-4" />
                        </span>
                        <span className="truncate text-base font-semibold text-zinc-100">{resource.name}</span>
                      </span>
                      <button
                        type="button"
                        aria-label={`Delete ${resource.name}`}
                        title="Delete resource"
                        onClick={(event) => {
                          event.stopPropagation();
                          removeResource(resource.id);
                        }}
                        className="grid size-8 place-items-center text-[#8fa3b8] hover:bg-red-500/10 hover:text-red-400"
                        data-testid={`delete-resource-${resource.id}`}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                    <div className="space-y-3 p-4">
                      <div className="flex items-end justify-between">
                        <span className="font-mono text-xs uppercase tracking-wider text-[#8fa3b8]">
                          {kindLabel(resource.kind, provider)}
                        </span>
                        <span
                          className={`font-mono text-sm ${
                            estimate?.status === "healthy" ? "text-[#3dd68c]" : "text-[#f5c518]"
                          }`}
                        >
                          {estimate?.utilization ?? 0}% util
                        </span>
                      </div>
                      <div className="h-1.5 bg-[#1a2230]">
                        <div className="h-full bg-[#f5c518]" style={{ width: `${estimate?.utilization ?? 0}%` }} />
                      </div>
                      <p className="font-heading text-xl font-semibold text-white">
                        {currency(estimate?.monthly_cost ?? 0)}
                        <span className="ml-1 text-sm font-normal text-[#8fa3b8]">/mo</span>
                      </p>
                      <p className="font-mono text-xs text-[#5a6b7d]">NODE 0{index + 1}</p>
                    </div>
                    <ChevronRight className="absolute -right-6 top-1/2 size-5 -translate-y-1/2 text-[#2c3b50] group-last:hidden" />
                  </div>
                );
              })}
              {resources.length === 0 && (
                <div className="absolute inset-0 grid place-items-center">
                  <div className="max-w-sm text-center">
                    <Boxes className="mx-auto size-12 text-[#2c3b50]" />
                    <p className="mt-4 font-heading text-xl font-semibold text-zinc-200">Your canvas is clear</p>
                    <p className="mt-2 text-base text-[#8fa3b8]">Add a service from the toolbox to start modeling.</p>
                  </div>
                </div>
              )}
            </div>
          </section>

          <aside className="panel flex flex-col" data-testid="inspector-panel">
            <div className="border-b border-[#243041] px-5 py-5">
              <p className="section-kicker">03 / inspector</p>
              <h2 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-white">Control room</h2>
            </div>

            <div className="border-b border-[#243041] p-5" data-testid="resource-properties">
              {selected ? (
                <>
                  <div className="mb-5 flex items-start justify-between gap-3">
                    <div>
                      <p className="section-kicker">Selected resource</p>
                      <p className="mt-2 text-lg font-semibold text-white">{kindLabel(selected.kind, provider)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeResource(selected.id)}
                      className="inline-flex h-10 items-center gap-2 border border-red-400/35 bg-red-400/10 px-3 font-mono text-xs uppercase tracking-wider text-red-300 hover:bg-red-400/20"
                      data-testid="delete-selected-resource-button"
                    >
                      <Trash2 className="size-4" /> Delete
                    </button>
                  </div>
                  <label className="field-label" htmlFor="resource-name-input">
                    Resource name
                    <Input
                      id="resource-name-input"
                      value={selected.name}
                      onChange={(e) => updateSelected({ name: e.target.value })}
                      className="mt-2 h-11 rounded-sm border-[#243041] bg-[#0a0e14] font-mono text-base"
                      data-testid="resource-name-input"
                    />
                  </label>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    {(selected.kind === "vm" ||
                      selected.kind === "database" ||
                      selected.kind === "container" ||
                      selected.kind === "cache") && (
                      <label className="field-label" htmlFor="tier-select">
                        Tier
                        <select
                          id="tier-select"
                          value={selected.tier ?? "small"}
                          onChange={(e) =>
                            updateSelected({
                              tier: e.target.value as InstanceTier,
                              size: INSTANCE_TIERS.find((t) => t.id === e.target.value)?.weight ?? 1,
                            })
                          }
                          className="mt-2 h-11 w-full border border-[#243041] bg-[#0a0e14] px-3 font-mono text-sm"
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
                    {selected.kind === "storage" && (
                      <label className="field-label" htmlFor="storage-class-select">
                        Class
                        <select
                          id="storage-class-select"
                          value={selected.storage_class ?? "object"}
                          onChange={(e) => updateSelected({ storage_class: e.target.value as "object" | "block_ssd" })}
                          className="mt-2 h-11 w-full border border-[#243041] bg-[#0a0e14] px-3 font-mono text-sm"
                          data-testid="storage-class-select"
                        >
                          <option value="object">Object</option>
                          <option value="block_ssd">Block SSD</option>
                        </select>
                      </label>
                    )}
                    {selected.kind === "database" && (
                      <label className="field-label" htmlFor="db-ha-select">
                        HA
                        <select
                          id="db-ha-select"
                          value={selected.db_ha ?? "single_az"}
                          onChange={(e) => updateSelected({ db_ha: e.target.value as "single_az" | "multi_az" })}
                          className="mt-2 h-11 w-full border border-[#243041] bg-[#0a0e14] px-3 font-mono text-sm"
                          data-testid="db-ha-select"
                        >
                          <option value="single_az">Single-AZ</option>
                          <option value="multi_az">Multi-AZ</option>
                        </select>
                      </label>
                    )}
                    {selected.kind === "network" && (
                      <label className="field-label" htmlFor="network-service-select">
                        Service
                        <select
                          id="network-service-select"
                          value={selected.network_service ?? "egress"}
                          onChange={(e) => updateSelected({ network_service: e.target.value as "egress" | "alb" })}
                          className="mt-2 h-11 w-full border border-[#243041] bg-[#0a0e14] px-3 font-mono text-sm"
                          data-testid="network-service-select"
                        >
                          <option value="egress">Egress</option>
                          <option value="alb">Load balancer</option>
                        </select>
                      </label>
                    )}
                    <label className="field-label" htmlFor="resource-quantity-input">
                      Quantity
                      <Input
                        id="resource-quantity-input"
                        type="number"
                        min={1}
                        max={100}
                        value={selected.quantity}
                        onChange={(e) => updateSelected({ quantity: Number(e.target.value) })}
                        className="mt-2 h-11 rounded-sm border-[#243041] bg-[#0a0e14] font-mono text-base"
                        data-testid="resource-quantity-input"
                      />
                    </label>
                    {(selected.kind === "storage" || selected.kind === "network" || selected.kind === "database") && (
                      <label className="field-label" htmlFor="resource-size-input">
                        {selected.kind === "database" ? "Storage GB" : "Capacity"}
                        <Input
                          id="resource-size-input"
                          type="number"
                          min={0.1}
                          step={1}
                          value={selected.size}
                          onChange={(e) => updateSelected({ size: Number(e.target.value) })}
                          className="mt-2 h-11 rounded-sm border-[#243041] bg-[#0a0e14] font-mono text-base"
                          data-testid="resource-size-input"
                        />
                      </label>
                    )}
                    <label className="field-label" htmlFor="env-select">
                      Environment
                      <select
                        id="env-select"
                        value={selected.environment ?? "non_production"}
                        onChange={(e) =>
                          updateSelected({ environment: e.target.value as "production" | "non_production" })
                        }
                        className="mt-2 h-11 w-full border border-[#243041] bg-[#0a0e14] px-3 font-mono text-sm"
                        data-testid="env-select"
                      >
                        <option value="non_production">Non-prod</option>
                        <option value="production">Production</option>
                      </select>
                    </label>
                  </div>
                  <div className="mt-5">
                    <div className="mb-2 flex justify-between">
                      <span className="field-label">Baseline utilization</span>
                      <span className="font-mono text-base text-[#f5c518]">{selected.utilization}%</span>
                    </div>
                    <input
                      aria-label="Resource baseline utilization"
                      type="range"
                      min={0}
                      max={100}
                      value={selected.utilization}
                      onChange={(e) => updateSelected({ utilization: Number(e.target.value) })}
                      className="w-full accent-[#f5c518]"
                      data-testid="resource-utilization-slider"
                    />
                  </div>
                </>
              ) : (
                <p className="text-base text-[#8fa3b8]">Select a node to inspect it.</p>
              )}
            </div>

            <div className="flex border-b border-[#243041]" data-testid="inspector-tabs">
              {(["analysis", "insights", "scenarios", "terraform"] as Panel[]).map((panel) => (
                <button
                  key={panel}
                  type="button"
                  onClick={() => setActivePanel(panel)}
                  className={`flex-1 border-b-2 px-2 py-4 font-mono text-xs uppercase tracking-wider transition-colors ${
                    activePanel === panel
                      ? "border-[#f5c518] text-[#f5c518]"
                      : "border-transparent text-[#5a6b7d] hover:text-[#d7e0ea]"
                  }`}
                  data-testid={`${panel}-tab`}
                >
                  {panel === "analysis" ? "Cost" : panel === "insights" ? "AI" : panel === "scenarios" ? "Compare" : "Code"}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-auto p-5" data-testid="active-inspector-panel">
              {activePanel === "analysis" && (
                <div data-testid="cost-analysis-panel">
                  <p className="section-kicker">Cost analysis</p>
                  <p className="mt-2 font-heading text-4xl font-bold tracking-tight text-white">
                    {currency(simulation.total_monthly_cost)}
                    <span className="ml-2 text-base font-normal text-[#8fa3b8]">/ month</span>
                  </p>
                  <div className="mt-5 h-48" data-testid="cost-pie-chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={42} outerRadius={72} paddingAngle={3}>
                          {pieData.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => currency(value)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-3 space-y-3">
                    {simulation.resource_estimates.map((item) => (
                      <div
                        key={item.resource_id}
                        className="flex items-center justify-between border-b border-[#243041]/80 pb-3 text-sm"
                      >
                        <span className="flex items-center gap-2 text-[#9aa7b8]">
                          <span
                            className={`size-2 ${
                              item.status === "healthy"
                                ? "bg-[#3dd68c]"
                                : item.status === "idle"
                                  ? "bg-red-400"
                                  : "bg-[#f5c518]"
                            }`}
                          />
                          {item.resource_id}
                        </span>
                        <span className="font-mono text-base text-zinc-200">{currency(item.monthly_cost)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activePanel === "insights" && (
                <div data-testid="ai-insights-panel">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="section-kicker">Optimization copilot</p>
                      <p className="mt-2 font-heading text-xl font-semibold text-white">Signals → actions</p>
                    </div>
                    <Bot className="size-5 text-[#f5c518]" />
                  </div>
                  <div className="scanline mt-4 flex items-center gap-2 border border-[#243041] bg-[#0a0e14] px-3 py-2.5 font-mono text-xs uppercase tracking-wider text-[#8fa3b8]">
                    <span className="size-2 rounded-full bg-[#3dd68c]" /> {providerLabel}
                  </div>
                  {recommendationMutation.isPending && (
                    <p className="mt-4 font-mono text-sm uppercase tracking-wider text-[#f5c518]">Scanning…</p>
                  )}
                  <div className="mt-4 space-y-3" data-testid="recommendation-list">
                    {insights.map((item, index) => (
                      <div
                        key={`${item.title}-${index}`}
                        className="border border-[#243041] bg-[#0a0e14]/80 p-4"
                        data-testid={`recommendation-card-${index}`}
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className={`mt-0.5 grid size-7 shrink-0 place-items-center ${
                              item.priority === "high" ? "bg-red-400/15 text-red-300" : "bg-[#f5c518]/15 text-[#f5c518]"
                            }`}
                          >
                            {item.priority === "high" ? <TriangleAlert className="size-4" /> : <Check className="size-4" />}
                          </span>
                          <div>
                            <p className="text-base font-semibold text-zinc-100">{item.title}</p>
                            <p className="mt-2 text-sm leading-relaxed text-[#8fa3b8]">{item.rationale}</p>
                            <p className="mt-3 font-mono text-xs uppercase tracking-wider text-[#3dd68c]">
                              save {currency(item.estimated_monthly_saving)} · {item.action}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={runRecommendations}
                    disabled={recommendationMutation.isPending}
                    className="btn-primary mt-5 inline-flex w-full items-center justify-center"
                    data-testid="run-ai-analysis-button"
                  >
                    <Sparkles className="mr-2 size-4" />
                    {recommendationMutation.isPending ? "Analyzing" : "Run AI analysis"}
                  </button>
                </div>
              )}

              {activePanel === "scenarios" && (
                <div data-testid="scenario-compare-panel">
                  <p className="section-kicker">Provider comparison</p>
                  <p className="mt-2 font-heading text-xl font-semibold text-white">Same footprint, three clouds</p>
                  <div className="mt-5 h-52" data-testid="provider-bar-chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={providerCompare}>
                        <XAxis dataKey="provider" tick={{ fill: "#8fa3b8", fontSize: 12 }} />
                        <YAxis tick={{ fill: "#8fa3b8", fontSize: 12 }} width={48} />
                        <Tooltip formatter={(value: number) => currency(value)} />
                        <Bar dataKey="monthly" fill="#f5c518" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 space-y-3">
                    {providerCompare.map((row) => (
                      <div key={row.provider} className="flex justify-between border-b border-[#243041] pb-3 text-base">
                        <span className="font-mono uppercase text-[#8fa3b8]">{row.provider}</span>
                        <span className={`font-mono ${row.provider === provider ? "text-[#f5c518]" : "text-zinc-200"}`}>
                          {currency(row.monthly)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activePanel === "terraform" && (
                <div data-testid="terraform-panel">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="section-kicker">Infrastructure as code</p>
                      <p className="mt-2 font-heading text-xl font-semibold text-white">
                        {provider.toUpperCase()} Terraform
                      </p>
                    </div>
                    <Code2 className="size-5 text-[#f5c518]" />
                  </div>
                  {!localTerraform && (
                    <div className="mt-5 border border-dashed border-[#2c3b50] p-5">
                      <p className="text-base font-semibold text-zinc-200">Generate a reviewable plan</p>
                      <p className="mt-2 text-sm leading-relaxed text-[#8fa3b8]">
                        HCL only — CloudCost IQ never applies it.
                      </p>
                    </div>
                  )}
                  {localTerraform && (
                    <>
                      <pre
                        className="code-window mt-4 max-h-64 overflow-auto p-4 text-sm leading-relaxed text-[#d7e0ea]"
                        data-testid="terraform-code-output"
                      >
                        {localTerraform.configuration}
                      </pre>
                      {localValidation && (
                        <div
                          className={`mt-4 border p-4 text-sm ${
                            localValidation.valid
                              ? "border-emerald-400/30 bg-emerald-400/5 text-emerald-300"
                              : "border-red-400/30 bg-red-400/5 text-red-300"
                          }`}
                        >
                          <div className="flex items-center gap-2 font-semibold">
                            {localValidation.valid ? <Check className="size-4" /> : <X className="size-4" />}
                            {localValidation.valid ? "Plan checks passed" : "Plan needs attention"}
                          </div>
                          {[...localValidation.errors, ...localValidation.warnings].map((message) => (
                            <p key={message} className="mt-2 text-sm opacity-90">
                              {message}
                            </p>
                          ))}
                        </div>
                      )}
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={copyTerraform}
                          className="btn-ghost inline-flex items-center justify-center"
                          data-testid="copy-terraform-button"
                        >
                          <Clipboard className="mr-2 size-4" />
                          {copied ? "Copied" : "Copy"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const conf = localTerraform.configuration;
                            const blob = new Blob([conf], { type: "text/plain" });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `cloudcostiq-${provider}.tf`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                          className="btn-ghost inline-flex items-center justify-center"
                          data-testid="download-terraform-button"
                        >
                          <Download className="mr-2 size-4" /> Download
                        </button>
                      </div>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={generateLocalTerraform}
                    className="btn-primary mt-4 inline-flex w-full items-center justify-center"
                    data-testid="generate-terraform-button"
                  >
                    <Code2 className="mr-2 size-4" />
                    {localTerraform ? "Regenerate plan" : "Generate Terraform"}
                  </button>
                </div>
              )}
            </div>

            <div className="border-t border-[#243041] p-5">
              <div className="flex gap-3">
                <div className="grid size-10 shrink-0 place-items-center border border-[#f5c518]/30 bg-[#f5c518]/10 text-[#f5c518]">
                  <ShieldCheck className="size-5" />
                </div>
                <div>
                  <p className="text-base font-semibold text-zinc-100">Idle cost invariant</p>
                  <p className="mt-1 text-sm leading-relaxed text-[#8fa3b8]">
                    Compute and provisioned disk stay fixed. Only egress/ALB scale with workload.
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>
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
    <div className={`bg-[#0c1017] px-5 py-5 ${className}`} data-testid={`metric-${label.toLowerCase().replaceAll(" ", "-")}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="section-kicker">{label}</span>
        <Icon
          className={`size-5 shrink-0 ${
            accent === "yellow" ? "text-[#f5c518]" : accent === "green" ? "text-[#3dd68c]" : "text-[#5a6b7d]"
          }`}
        />
      </div>
      <p className="metric-value mt-3">{value}</p>
      <p className="mt-2 font-mono text-xs uppercase tracking-wider text-[#5a6b7d]">{detail}</p>
    </div>
  );
}
