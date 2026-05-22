# Plan-time assertions for the TF state-backend bootstrap.
#
# Same pattern as yotta-infra: stub the AWS provider so CI runs
# without credentials; plan-only assertions on the resources we'd
# create.

provider "aws" {
  region                      = "us-east-1"
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_region_validation      = true
  skip_requesting_account_id  = true
  access_key                  = "test"
  secret_key                  = "test"
}

run "creates_versioned_encrypted_bucket_with_predictable_name" {
  command = plan

  variables {
    aws_region = "us-east-1"
    account_id = "768507067298"
  }

  assert {
    condition     = aws_s3_bucket.tfstate.bucket == "ab-tfstate-768507067298-us-east-1"
    error_message = "Bucket name must follow ab-tfstate-<account>-<region>."
  }

  assert {
    condition     = aws_s3_bucket.tfstate.force_destroy == false
    error_message = "force_destroy must stay false on the state bucket."
  }

  assert {
    condition     = aws_s3_bucket_versioning.tfstate.versioning_configuration[0].status == "Enabled"
    error_message = "Versioning is required for recovery from bad applies."
  }

  assert {
    condition = anytrue([
      for rule in aws_s3_bucket_server_side_encryption_configuration.tfstate.rule :
      anytrue([
        for sse in rule.apply_server_side_encryption_by_default :
        sse.sse_algorithm == "AES256"
      ])
    ])
    error_message = "State bucket must be encrypted at rest with AES256."
  }

  assert {
    condition     = aws_s3_bucket_public_access_block.tfstate.block_public_acls == true && aws_s3_bucket_public_access_block.tfstate.block_public_policy == true && aws_s3_bucket_public_access_block.tfstate.ignore_public_acls == true && aws_s3_bucket_public_access_block.tfstate.restrict_public_buckets == true
    error_message = "All four public-access-block flags must be true."
  }
}

run "creates_lock_table_with_required_schema" {
  command = plan

  variables {
    aws_region = "us-east-1"
    account_id = "768507067298"
  }

  assert {
    condition     = aws_dynamodb_table.tflock.name == "ab-tflock-768507067298-us-east-1"
    error_message = "Lock table name must follow ab-tflock-<account>-<region>."
  }

  assert {
    condition     = aws_dynamodb_table.tflock.hash_key == "LockID"
    error_message = "LockID is the hash key mandated by Terraform's S3 backend."
  }

  assert {
    condition = anytrue([
      for attr in aws_dynamodb_table.tflock.attribute :
      attr.name == "LockID" && attr.type == "S"
    ])
    error_message = "LockID attribute must be a String."
  }

  assert {
    condition     = aws_dynamodb_table.tflock.billing_mode == "PAY_PER_REQUEST"
    error_message = "Lock table should be pay-per-request."
  }

  assert {
    condition     = aws_dynamodb_table.tflock.point_in_time_recovery[0].enabled == true
    error_message = "PITR on the lock table protects against accidental writes."
  }
}

run "rejects_invalid_region" {
  command = plan

  variables {
    aws_region = "us-east"
    account_id = "768507067298"
  }

  expect_failures = [var.aws_region]
}

run "rejects_short_account_id" {
  command = plan

  variables {
    aws_region = "us-east-1"
    account_id = "1234"
  }

  expect_failures = [var.account_id]
}
