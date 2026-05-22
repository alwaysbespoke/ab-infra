# ab-infra

Org-level shared infrastructure for **Alwaysbespoke**.

This repository owns AWS resources that live in the alwaysbespoke
parent AWS account (`768507067298`): public DNS zones, cross-account
IAM roles that child accounts assume, and (over time) any org-wide
shared infra — billing accounts, central log archives, SCPs, etc.

It does **not** own anything inside a child brand's account. Each
brand (today: yotta) has its own pair of repos for its cluster
account:

- [`yotta-infra`](https://github.com/yotta-holdings/yotta-infra) — AWS
  resources in the yotta prod account (VPC, EKS, IAM, S3, …).
- [`yotta-gitops`](https://github.com/yotta-holdings/yotta-gitops) —
  in-cluster workloads, synced by Argo CD.

When a new brand launches under Alwaysbespoke, it gets its own
`<brand>-infra` + `<brand>-gitops` pair; this repo stays the parent
that owns the cross-account glue.

---

## Layout

```
.
├── cdk/         # AWS resources (TypeScript CDK app)
├── terraform/   # Non-AWS resources + remote state backend
├── docs/
│   └── plans/   # Multi-step implementation plans
├── AGENTS.md
├── Makefile
└── README.md
```

`cdk/` and `terraform/` are scaffolded as their bootstrap plans
execute — see `docs/plans/` for the live set.

## AWS accounts in scope

| Account                | Purpose                                         | This repo                  |
|------------------------|-------------------------------------------------|----------------------------|
| `768507067298`         | Alwaysbespoke parent — owns `yotta.bot` zone, cross-account IAM, future org-level resources | **deploys here** |
| `461780750330` (yotta) | yotta-bot prod EKS cluster + workloads          | consumed by, not deployed here |

If a future brand gets its own AWS account, add a row.

## Tooling boundary

| Tool      | Owns                                                                    |
|-----------|-------------------------------------------------------------------------|
| CDK       | Every AWS resource in `768507067298` (DNS zones, IAM, S3, …).           |
| Terraform | Non-AWS resources (GitHub, Datadog, etc.) + remote state backend for self. |

Same bright line as `yotta-infra`: AWS → CDK, non-AWS → Terraform.

## Tag standard

Every resource carries this set. Note the differences from
`yotta-infra`'s tags: `Application` is `alwaysbespoke-shared` (not
a single product), and `Environment` is `shared` (the alwaysbespoke
account is parent-org, not a per-env footprint).

| Key            | Value                              |
|----------------|------------------------------------|
| `Environment`  | `shared`                           |
| `Application`  | `alwaysbespoke-shared`             |
| `Team`         | `platform-engineering`             |
| `CostCenter`   | `engineering`                      |
| `ManagedBy`    | `cdk` or `terraform`               |
| `Region`       | the AWS region (e.g. `us-east-1`)  |

A shared tagging helper enforces this in each tool — see `AGENTS.md`.

## Naming standard

`ab-<env>-<region-short>[-<purpose>]` — e.g. `ab-shared-use1-external-dns-yotta`.

Same region-short map as `yotta-infra` (`us-east-1` → `use1`,
`us-west-2` → `usw2`, `eu-west-1` → `euw1`, …).

## Cross-repo contract

When this repo creates a resource that a child brand consumes (e.g.
the IAM role that yotta's external-dns assumes to write the
`yotta.bot` zone), the resource's ARN is **exported under a stable
CloudFormation export name** so the consuming repo can pull it via
`aws cloudformation list-exports`. Export names follow:

```
ab-shared-use1-<purpose>-<resource>
```

A handoff doc (`docs/handoff/`) lists every export and its consumer.

Breaking changes to an export (renames, scope changes) are
two-PR: add the new export alongside the old, switch consumers,
remove the old. Same dance as `yotta-infra/yotta-gitops`.

## Cluster access

This account doesn't host a cluster. Engineers reach it via AWS SSO
with the `AdministratorAccess` permission set:

```bash
aws sso login --profile AdministratorAccess-768507067298
aws sts get-caller-identity --profile AdministratorAccess-768507067298
```

## Quality bar

Same as `yotta-infra` — see `AGENTS.md` for the full set of
conventions:

- Non-trivial code commented for intent (`why`, not `what`).
- Non-trivial code has tests. CDK uses `aws-cdk-lib/assertions`;
  Terraform uses `terraform test`.
- Changes follow the active plan in `docs/plans/` and update its
  step table as work progresses.

## Getting started

> Bootstrap is in progress. See the most recent plan under
> `docs/plans/` for the source of truth.

## Related repos

- [`yotta-infra`](https://github.com/yotta-holdings/yotta-infra) —
  child brand: yotta-bot prod cluster account.
- [`yotta-gitops`](https://github.com/yotta-holdings/yotta-gitops) —
  child brand: yotta-bot in-cluster workloads.
