# AWS provider used only so non-AWS providers can pull values from
# AWS (SSM, KMS, Secrets Manager). New AWS *resources* belong in
# cdk/, not here — see AGENTS.md.

provider "aws" {
  region              = "us-east-1"
  allowed_account_ids = ["768507067298"]
}
