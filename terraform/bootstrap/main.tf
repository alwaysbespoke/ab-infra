# ONE-TIME bootstrap for the Terraform remote-state backend in the
# alwaysbespoke parent account. Same pattern as yotta-infra's
# bootstrap module — separate copy here so each account-scoped repo
# owns its own state-creation lineage.
#
# How to run (first time):
#
#   cd terraform/bootstrap
#   AWS_PROFILE=AdministratorAccess-768507067298 terraform init
#   AWS_PROFILE=AdministratorAccess-768507067298 terraform apply \
#     -var aws_region=us-east-1 \
#     -var account_id=768507067298
#
# Bucket name uses `ab-` prefix (cosmetic consistency with the rest
# of this repo's naming).

resource "aws_s3_bucket" "tfstate" {
  bucket        = "ab-tfstate-${var.account_id}-${var.aws_region}"
  force_destroy = false
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_dynamodb_table" "tflock" {
  name         = "ab-tflock-${var.account_id}-${var.aws_region}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }
}
