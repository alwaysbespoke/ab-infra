# Root module for non-AWS resources in the alwaysbespoke parent
# account. AWS resources for this account live in cdk/.
#
# Currently this root only instantiates the shared tags module so
# the layout is exercised end-to-end (init, validate, plan) before
# any real resources are added.

module "tags" {
  source = "../../modules/tags"

  environment = "shared"
  region      = "us-east-1"
}

output "standard_tags" {
  description = "The standard tag set this root applies to its (non-AWS) resources."
  value       = module.tags.tags
}
