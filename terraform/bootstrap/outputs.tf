output "state_bucket_name" {
  description = "Name of the S3 bucket holding remote state."
  value       = aws_s3_bucket.tfstate.bucket
}

output "lock_table_name" {
  description = "Name of the DynamoDB lock table."
  value       = aws_dynamodb_table.tflock.name
}

output "region" {
  description = "AWS region of the backend."
  value       = var.aws_region
}

output "account_id" {
  description = "AWS account ID the backend lives in."
  value       = var.account_id
}
