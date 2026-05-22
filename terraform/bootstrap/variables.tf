variable "aws_region" {
  description = "AWS region to host the Terraform state bucket and lock table."
  type        = string

  validation {
    condition     = can(regex("^[a-z]{2}-[a-z]+-[0-9]+$", var.aws_region))
    error_message = "aws_region must be a valid AWS region (e.g. us-east-1)."
  }
}

variable "account_id" {
  description = "Expected 12-digit AWS account ID. Provider refuses to run against any other account."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.account_id))
    error_message = "account_id must be a 12-digit AWS account ID."
  }
}
