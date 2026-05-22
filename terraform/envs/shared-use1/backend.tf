# Remote state for the shared / us-east-1 root.
#
# Bucket + lock table are created by `terraform/bootstrap` in this
# same account. If `terraform init` fails with a bucket-not-found
# error, run the bootstrap module first.

terraform {
  backend "s3" {
    bucket         = "ab-tfstate-768507067298-us-east-1"
    key            = "shared/us-east-1/services/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "ab-tflock-768507067298-us-east-1"
    encrypt        = true
  }
}
