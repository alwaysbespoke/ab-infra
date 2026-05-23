# Runbook: bootstrap `ab-infra` against the alwaysbespoke account

First-time apply of the Terraform state backend, CDK toolkit, and
the three stacks (`Ab-Shared-Use1-CiOidc`,
`Ab-Shared-Use1-CrossAccountDns`) to AWS account `768507067298`.

This is a **one-time** procedure. Subsequent changes are
routine `make diff` / `make deploy` PRs.

---

## 0. Prerequisites

- AWS SSO profile `AdministratorAccess-768507067298` in
  `~/.aws/config` (see ab-infra's README for the snippet).
- Local tools: `aws` (≥2.15), `terraform` (≥1.6), `node` (≥20),
  `npm`.
- Repo checked out at `main`, working tree clean.
- For any `apply` / `deploy`:
  ```bash
  aws sso login --profile AdministratorAccess-768507067298
  ```

> All commands below assume `cwd` is the ab-infra repo root unless
> noted.

---

## 1. Terraform state bucket + lock table

```bash
make bootstrap-tf
```

What this does:

1. `terraform init` in `terraform/bootstrap/`.
2. `terraform apply -var aws_region=us-east-1 -var account_id=$(...)` —
   creates the S3 state bucket (`ab-tfstate-768507067298-us-east-1`)
   and DynamoDB lock table (`ab-tflock-768507067298-us-east-1`).

Verify:

```bash
AWS_PROFILE=AdministratorAccess-768507067298 \
  aws s3 ls s3://ab-tfstate-768507067298-us-east-1
```

(Empty listing is correct — bucket exists, no state objects yet.)

## 2. CDK toolkit

```bash
make bootstrap-cdk
```

What this does: `cdk bootstrap aws://768507067298/us-east-1` →
deploys the `CDKToolkit` CloudFormation stack (assets bucket +
publishing roles).

Verify:

```bash
AWS_PROFILE=AdministratorAccess-768507067298 \
  aws cloudformation describe-stacks --stack-name CDKToolkit \
  --query "Stacks[0].StackStatus" --output text
```

Expect `CREATE_COMPLETE`.

## 3. Deploy the stacks

```bash
make deploy
```

Or step-by-step:

```bash
AWS_PROFILE=AdministratorAccess-768507067298 \
  npx cdk deploy Ab-Shared-Use1-CiOidc \
    --context env=shared --context region=us-east-1 \
    --require-approval=never

AWS_PROFILE=AdministratorAccess-768507067298 \
  npx cdk deploy Ab-Shared-Use1-CrossAccountDns \
    --context env=shared --context region=us-east-1 \
    --require-approval=never
```

Expected runtime: **~1–2 min total**. These stacks are tiny
(IAM only).

## 4. Verify

```bash
AWS_PROFILE=AdministratorAccess-768507067298 \
  aws cloudformation list-exports \
  --query "Exports[?starts_with(Name, 'ab-shared-')].{Name:Name,Value:Value}" \
  --output table
```

Expect to see:

- `ab-shared-use1-external-dns-yotta-role-arn` →
  `arn:aws:iam::768507067298:role/ab-shared-use1-external-dns-yotta`

And from the OIDC stack:

```bash
AWS_PROFILE=AdministratorAccess-768507067298 \
  aws cloudformation list-exports \
  --query "Exports[?starts_with(Name, 'Ab-Shared-Use1-')].{Name:Name,Value:Value}" \
  --output table
```

Expect:
- `Ab-Shared-Use1-CiOidc-ci-read-role-arn` →
  `arn:aws:iam::768507067298:role/ab-infra-ci-read`
- `Ab-Shared-Use1-CiOidc-oidc-provider-arn`

## 5. Hand off to yotta-infra

The cross-account role is live and trusting the (not-yet-created)
`yotta-prod-use1-external-dns` role. Now the yotta-infra side can
proceed:

1. Create the IRSA role `yotta-prod-use1-external-dns` in
   `yotta-infra` (with inline policy granting `sts:AssumeRole` on
   the cross-account role from §4).
2. `yotta-gitops` installs `external-dns` Helm chart with the
   cross-account role ARN as `assumeRoleArn`.

See [`docs/handoff/child-repo-contract.md`](../handoff/child-repo-contract.md)
for the copy-paste snippets.

## 6. Routine updates

Post-bootstrap, every change is:

```bash
git checkout -b <branch>
# edit code
make ci                    # local test + synth
git commit && git push     # PR triggers CI (cdk diff posted on PR)
# review the diff comment on the PR
# merge
git checkout main && git pull
make diff                  # confirms what's about to change
make deploy                # deploy
```

## 7. Tearing down

> **Stop.** The cross-account role is depended on by yotta's
> external-dns. Destroying it = yotta DNS broken. Before any
> teardown:
>
> 1. Update the yotta cluster's external-dns Application to remove
>    the `assumeRoleArn`.
> 2. Confirm DNS records still resolve.
> 3. Then proceed.

```bash
AWS_PROFILE=AdministratorAccess-768507067298 \
  npx cdk destroy Ab-Shared-Use1-CrossAccountDns \
    --context env=shared --context region=us-east-1
AWS_PROFILE=AdministratorAccess-768507067298 \
  npx cdk destroy Ab-Shared-Use1-CiOidc \
    --context env=shared --context region=us-east-1
```

TF state bucket + lock table survive `cdk destroy` (different
lifecycle). To remove them, `terraform destroy` in
`terraform/bootstrap/` — but only if no other Terraform root in
this account is using them (today: none).
