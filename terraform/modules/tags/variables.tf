variable "environment" {
  description = "Environment for tagging. Constrained to `shared` in ab-infra (this account is parent-org, not per-env)."
  type        = string

  validation {
    condition     = contains(["shared"], var.environment)
    error_message = "environment must be `shared` in ab-infra."
  }
}

variable "region" {
  description = "Full AWS region for the resources being tagged (e.g. us-east-1)."
  type        = string

  validation {
    condition     = can(regex("^[a-z]{2}-[a-z]+-[0-9]+$", var.region))
    error_message = "region must be a valid AWS region (e.g. us-east-1)."
  }
}
