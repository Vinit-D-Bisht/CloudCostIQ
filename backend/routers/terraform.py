from fastapi import APIRouter

from lib.sim import analyze
from lib.terraform_gen import generate, validate
from models.cloudcost import TerraformRequest, TerraformResponse, TerraformValidation

router = APIRouter(prefix="/terraform", tags=["terraform"])


@router.post("/generate", response_model=TerraformResponse)
async def generate_terraform(input: TerraformRequest) -> TerraformResponse:
    configuration = generate(input.resources, input.provider)
    estimate = analyze(
        input.resources,
        workload=50,
        hours_per_month=730,
        provider=input.provider,
        pricing_model="on_demand",
        region="us-east",
    )
    return TerraformResponse(
        configuration=configuration,
        resource_count=len(input.resources),
        estimated_monthly_cost=estimate["total_monthly_cost"],
    )


@router.post("/validate", response_model=TerraformValidation)
async def validate_terraform(input: TerraformRequest) -> TerraformValidation:
    result = validate(input.resources, input.provider)
    return TerraformValidation(**result)
