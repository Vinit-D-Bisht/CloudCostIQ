from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field


ResourceKind = Literal[
    "vm",
    "storage",
    "network",
    "database",
    "serverless",
    "container",
    "cache",
    "cdn",
    "queue",
]
CloudProvider = Literal["aws", "gcp", "azure"]
PricingModel = Literal["on_demand", "reserved_1y", "reserved_3y", "spot"]
RegionKey = Literal["us-east", "us-west", "eu-central", "ap-southeast"]
InstanceTier = Literal["micro", "small", "medium", "large", "xlarge", "2xlarge"]
StorageClass = Literal["object", "block_ssd"]
DbHa = Literal["single_az", "multi_az"]
NetworkService = Literal["egress", "alb"]
Environment = Literal["production", "non_production"]


class ResourceConfig(BaseModel):
    id: str
    name: str = Field(min_length=1, max_length=48)
    kind: ResourceKind
    region: RegionKey = "us-east"
    quantity: int = Field(default=1, ge=1, le=100)
    size: float = Field(default=1, ge=0.1, le=10000)
    utilization: int = Field(default=50, ge=0, le=100)
    tier: InstanceTier | None = "small"
    storage_class: StorageClass | None = None
    db_ha: DbHa | None = None
    network_service: NetworkService | None = None
    environment: Environment | None = "non_production"
    sku: str | None = None
    engine: str | None = None
    service_tier: str | None = None


class SimulationRequest(BaseModel):
    resources: list[ResourceConfig] = Field(max_length=100)
    workload: int = Field(default=52, ge=0, le=100)
    hours_per_month: int = Field(default=730, ge=1, le=744)
    provider: CloudProvider = "aws"
    pricing_model: PricingModel = "on_demand"
    region: RegionKey = "us-east"


class ResourceEstimate(BaseModel):
    resource_id: str
    monthly_cost: float
    unit_cost: float = 0
    utilization: int
    status: Literal["healthy", "overprovisioned", "idle"]
    scales_with_workload: bool = False


class SimulationResponse(BaseModel):
    total_monthly_cost: float
    projected_annual_cost: float
    estimated_savings: float
    utilization_score: int
    resource_estimates: list[ResourceEstimate]
    by_kind: dict[str, float] = Field(default_factory=dict)
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CatalogItem(BaseModel):
    kind: ResourceKind
    label: str
    description: str
    unit: str
    hourly_rate: float = 0
    color: str


class HealthResponse(BaseModel):
    ok: bool
    service: str


class TodayResponse(BaseModel):
    date: str


class RecommendationRequest(BaseModel):
    resources: list[ResourceConfig] = Field(max_length=100)
    simulation: SimulationResponse
    provider: CloudProvider = "aws"
    pricing_model: PricingModel = "on_demand"
    region: RegionKey = "us-east"
    workload: int = Field(default=52, ge=0, le=100)
    hours_per_month: int = Field(default=730, ge=1, le=744)


class Recommendation(BaseModel):
    title: str
    rationale: str
    situation: str = ""
    benefits: list[str] = Field(default_factory=list)
    tradeoffs: list[str] = Field(default_factory=list)
    estimated_monthly_saving: float = Field(default=0, ge=0)
    priority: Literal["low", "medium", "high"] = "medium"
    action: str
    risk: str | None = None


class RecommendationResponse(BaseModel):
    provider: Literal["gemini", "deterministic"]
    recommendations: list[Recommendation]
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AdvisorChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class AdvisorChatRequest(RecommendationRequest):
    messages: list[AdvisorChatMessage] = Field(min_length=1, max_length=20)
    conversation_id: str | None = Field(default=None, min_length=1, max_length=64)


class AdvisorChatHistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)
    tools_used: list[str] = Field(default_factory=list)


class AdvisorChatHistoryResponse(BaseModel):
    conversation_id: str | None = None
    messages: list[AdvisorChatHistoryMessage] = Field(default_factory=list)


class AdvisorChatResponse(BaseModel):
    reply: str
    provider: Literal["groq", "unavailable"]
    conversation_id: str
    tools_used: list[str] = Field(default_factory=list)


class TerraformRequest(BaseModel):
    resources: list[ResourceConfig] = Field(max_length=100)
    provider: CloudProvider = "aws"


class TerraformResponse(BaseModel):
    configuration: str
    resource_count: int
    estimated_monthly_cost: float


class TerraformValidation(BaseModel):
    valid: bool
    errors: list[str]
    warnings: list[str]
    checks_run: int


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(default="", max_length=80)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


class ProfileUpdateRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=80)


class UserProfile(BaseModel):
    id: str
    email: str
    display_name: str
    created_at: str


class AuthResponse(BaseModel):
    user: UserProfile


class WorkspaceState(BaseModel):
    resources: list[ResourceConfig] = Field(default_factory=list, max_length=100)
    provider: CloudProvider = "aws"
    pricing_model: PricingModel = "on_demand"
    region: RegionKey = "us-east"
    hours_per_month: int = Field(default=730, ge=1, le=744)
    workload: int = Field(default=52, ge=0, le=100)


class WorkspaceSaveRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    state: WorkspaceState
    id: str | None = None


class WorkspaceSummary(BaseModel):
    id: str
    name: str
    updated_at: str
    created_at: str


class WorkspaceDocument(BaseModel):
    id: str
    name: str
    state: WorkspaceState
    created_at: str
    updated_at: str
