import type {
  CloudProvider,
  PricingModel,
  RegionKey,
  ResourceConfig,
  ResourceEstimate,
  ResourceKind,
  SimulationResponse,
} from "./sim";

export type {
  CloudProvider,
  PricingModel,
  RegionKey,
  ResourceConfig,
  ResourceEstimate,
  ResourceKind,
  SimulationResponse,
};

export interface CatalogItem {
  kind: ResourceKind;
  label: string;
  description: string;
  unit: string;
  hourly_rate?: number;
  color: string;
}

export interface SimulationRequest {
  resources: ResourceConfig[];
  workload: number;
  hours_per_month: number;
  provider: CloudProvider;
  pricing_model: PricingModel;
  region: RegionKey;
}

export interface HealthResponse {
  ok: boolean;
  service: string;
}

export interface TodayResponse {
  date: string;
}

export interface Recommendation {
  title: string;
  rationale: string;
  estimated_monthly_saving: number;
  priority: "low" | "medium" | "high";
  action: string;
}

export interface RecommendationResponse {
  provider: "ollama" | "free_api" | "deterministic";
  recommendations: Recommendation[];
  generated_at: string;
}

export interface RecommendationRequest {
  resources: ResourceConfig[];
  simulation: SimulationResponse;
  provider: CloudProvider;
  pricing_model: PricingModel;
  region: RegionKey;
  workload: number;
}

export interface TerraformRequest {
  resources: ResourceConfig[];
  provider: CloudProvider;
}

export interface TerraformResponse {
  configuration: string;
  resource_count: number;
  estimated_monthly_cost: number;
}

export interface TerraformValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  checks_run: number;
}

export interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  created_at: string;
}

export interface AuthResponse {
  user: UserProfile;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  updated_at: string;
  created_at: string;
}

export interface WorkspaceDocument {
  id: string;
  name: string;
  state: {
    resources: ResourceConfig[];
    provider: CloudProvider;
    pricing_model: PricingModel;
    region: RegionKey;
    hours_per_month: number;
    workload: number;
  };
  created_at: string;
  updated_at: string;
}
