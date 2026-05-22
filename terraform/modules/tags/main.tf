# Shared tagging helper for ab-infra Terraform roots.
#
# Differs from yotta-infra's tags module:
#   - Application = "alwaysbespoke-shared"
#   - Environment is constrained to {shared} only (no dev/stage/prod
#     here — this account is parent-org).

locals {
  tags = {
    Environment = var.environment
    Application = "alwaysbespoke-shared"
    Team        = "platform-engineering"
    CostCenter  = "engineering"
    ManagedBy   = "terraform"
    Region      = var.region
  }
}
