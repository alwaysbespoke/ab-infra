# Native `terraform test` for the tags module. Runs without AWS
# credentials because we only `plan`.

run "produces_full_tag_set_for_shared_us_east_1" {
  command = plan

  variables {
    environment = "shared"
    region      = "us-east-1"
  }

  assert {
    condition     = output.tags["Environment"] == "shared"
    error_message = "Environment tag must reflect var.environment."
  }
  assert {
    condition     = output.tags["Application"] == "alwaysbespoke-shared"
    error_message = "Application tag must be 'alwaysbespoke-shared' on the ab-infra side."
  }
  assert {
    condition     = output.tags["Team"] == "platform-engineering"
    error_message = "Team tag must be 'platform-engineering'."
  }
  assert {
    condition     = output.tags["CostCenter"] == "engineering"
    error_message = "CostCenter tag must be 'engineering'."
  }
  assert {
    condition     = output.tags["ManagedBy"] == "terraform"
    error_message = "ManagedBy must be 'terraform' on the TF side."
  }
  assert {
    condition     = output.tags["Region"] == "us-east-1"
    error_message = "Region tag must reflect var.region."
  }
  assert {
    condition     = length(keys(output.tags)) == 6
    error_message = "The standard tag set must contain exactly 6 keys."
  }
}

run "rejects_non_shared_environment" {
  command = plan

  variables {
    environment = "prod"
    region      = "us-east-1"
  }

  expect_failures = [var.environment]
}

run "rejects_invalid_region" {
  command = plan

  variables {
    environment = "shared"
    region      = "us-east"
  }

  expect_failures = [var.region]
}
