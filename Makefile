# ab-infra Makefile — common entry points for day-to-day work.
#
# Defaults target the alwaysbespoke parent account (768507067298).
# Override with ENV / REGION / REGION_SHORT / PROFILE on the
# command line.
#
#   make test                    # run all tests (CDK + Terraform)
#   make synth                   # cdk synth shared/us-east-1
#   make diff                    # cdk diff against live stacks
#   make deploy                  # cdk deploy --all (confirms first)
#   make ci                      # what CI runs locally

SHELL       := /usr/bin/env bash
.SHELLFLAGS := -eu -o pipefail -c

# ── Defaults ────────────────────────────────────────────────────────
ENV          ?= shared
REGION       ?= us-east-1
REGION_SHORT ?= use1
PROFILE      ?= AdministratorAccess-768507067298

# ── Derived ─────────────────────────────────────────────────────────
TF_ENV_DIR   := terraform/envs/$(ENV)-$(REGION_SHORT)
CDK_CONTEXT  := --context env=$(ENV) --context region=$(REGION)
AWS_ENV      := AWS_PROFILE=$(PROFILE)

.DEFAULT_GOAL := help

##@ General

.PHONY: help
help: ## Show this help (default target)
	@awk 'BEGIN {FS = ":.*?## "; printf "\nUsage:\n  make \033[36m<target>\033[0m [ENV=<env>] [REGION=<region>] [REGION_SHORT=<short>] [PROFILE=<sso-profile>]\n"} \
	  /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } \
	  /^[a-zA-Z0-9_-]+:.*?## / { printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)
	@echo ""

##@ Setup

.PHONY: install
install: install-cdk install-tf ## Install all dependencies (npm + terraform init)

.PHONY: install-cdk
install-cdk: ## Install CDK dependencies (npm ci)
	cd cdk && npm ci

.PHONY: install-tf
install-tf: ## Initialize Terraform modules + roots (offline; -backend=false)
	cd terraform/bootstrap     && terraform init -backend=false
	cd terraform/modules/tags  && terraform init
	@if [ -d $(TF_ENV_DIR) ]; then \
	  cd $(TF_ENV_DIR) && terraform init -backend=false; \
	else \
	  echo "skip: $(TF_ENV_DIR) does not exist yet"; \
	fi

##@ Tests + lint

.PHONY: test
test: test-cdk test-tf ## Run all tests (CDK + Terraform)

.PHONY: test-cdk
test-cdk: ## Run CDK jest tests (no AWS auth needed)
	cd cdk && npm test

.PHONY: test-tf
test-tf: ## Run Terraform tests (bootstrap + tags modules)
	cd terraform/modules/tags && terraform init -input=false >/dev/null && terraform test
	cd terraform/bootstrap    && terraform init -input=false >/dev/null && terraform test

.PHONY: fmt
fmt: ## Format all Terraform code in place
	terraform -chdir=terraform fmt -recursive

.PHONY: fmt-check
fmt-check: ## Verify Terraform formatting (CI uses this)
	terraform -chdir=terraform fmt -check -recursive

.PHONY: validate-tf
validate-tf: ## terraform validate on bootstrap + the current env root
	cd terraform/bootstrap && terraform init -backend=false && terraform validate
	@if [ -d $(TF_ENV_DIR) ]; then \
	  cd $(TF_ENV_DIR) && terraform init -backend=false && terraform validate; \
	else \
	  echo "skip: $(TF_ENV_DIR) does not exist yet"; \
	fi

.PHONY: ci
ci: fmt-check test ## Run the local equivalent of CI (fmt + tests + synth)
	cd cdk && npx cdk synth $(CDK_CONTEXT) > /dev/null
	@echo "✓ ci checks passed"

##@ CDK operations  (AWS auth required for diff/deploy)

.PHONY: synth
synth: ## CDK synth for ENV/REGION (no AWS auth needed)
	cd cdk && npx cdk synth $(CDK_CONTEXT)

.PHONY: diff
diff: ## CDK diff against the live stacks for ENV/REGION
	cd cdk && $(AWS_ENV) npx cdk diff $(CDK_CONTEXT)

.PHONY: deploy
deploy: ## CDK deploy ALL stacks for ENV/REGION (confirms first)
	cd cdk && $(AWS_ENV) npx cdk deploy --all $(CDK_CONTEXT)

.PHONY: deploy-unattended
deploy-unattended: ## CDK deploy with --require-approval=never (use with care)
	cd cdk && $(AWS_ENV) npx cdk deploy --all $(CDK_CONTEXT) --require-approval=never

.PHONY: destroy
destroy: ## CDK destroy ALL stacks (DANGEROUS — confirms first)
	cd cdk && $(AWS_ENV) npx cdk destroy --all $(CDK_CONTEXT)

##@ One-time per-account bootstrap

.PHONY: bootstrap-tf
bootstrap-tf: ## ONE-TIME per account: create TF state bucket + lock table (auto-approves)
	@echo "About to create the TF state bucket + lock table in account $(PROFILE)."
	cd terraform/bootstrap && $(AWS_ENV) terraform init && \
	  $(AWS_ENV) terraform apply -auto-approve \
	    -var aws_region=$(REGION) \
	    -var account_id=$$($(AWS_ENV) aws sts get-caller-identity --query Account --output text)

.PHONY: bootstrap-cdk
bootstrap-cdk: ## ONE-TIME per (account, region): bootstrap the CDK toolkit
	cd cdk && $(AWS_ENV) npx cdk bootstrap \
	  aws://$$($(AWS_ENV) aws sts get-caller-identity --query Account --output text)/$(REGION) \
	  $(CDK_CONTEXT)

##@ Cleanup

.PHONY: clean
clean: ## Remove local build artifacts (cdk.out, node_modules, .terraform)
	rm -rf cdk/cdk.out cdk/node_modules
	find terraform -name '.terraform' -type d -prune -exec rm -rf {} +
	@echo "✓ cleaned"
