# AGENTS.md

Operational guide for anyone — human or AI — making changes in
`ab-infra`. Read this before opening a PR.

The format follows the [`AGENTS.md`](https://agents.md/) convention.

---

## 1. What this repo is

`ab-infra` provisions AWS resources in the **Alwaysbespoke parent
account** (`768507067298`). It owns:

- Public DNS zones (today: `yotta.bot`).
- Cross-account IAM roles that child-brand accounts assume.
- Future org-level shared resources (billing accounts, central log
  archive, org SCPs, etc.).

It does **not** own anything inside a child brand's AWS account.
Per-brand cluster + workload repos do that.

## 2. The bright line

| Account                | This repo deploys to it? | Why                                                        |
|------------------------|---------------------------|------------------------------------------------------------|
| `768507067298` (ab)    | **Yes**                   | This is the alwaysbespoke parent — our scope.              |
| `461780750330` (yotta) | No                        | Child brand. Lives in `yotta-infra`.                       |

A PR that adds AWS resources outside `768507067298` is a smell —
either it belongs in a different repo, or we need to re-think the
account topology.

## 3. Tooling boundary

- **CDK** (in `cdk/`) — every AWS resource.
- **Terraform** (in `terraform/`) — every non-AWS resource, plus the
  remote state backend for itself.

If a resource type could live in either tool, **CDK wins**. Don't
duplicate across tools.

## 4. Quality bar

Held to the same principal-engineer-level bar as `yotta-infra`.

- **Comments** explain *why* (constraints, tradeoffs, invariants).
  Not what the next line does.
- **Tests.** Non-trivial code has tests:
  - CDK: `aws-cdk-lib/assertions` for structural checks, plus the
    tag-coverage walker.
  - Terraform: native `terraform test` with stubbed AWS provider
    (so CI runs without AWS creds).
- **One source of truth.** Env/region values, account IDs, ARNs
  come from one config location per tool — never copy-pasted.
- **Reversibility.** Prefer changes that revert with one commit.
  Flag anything irreversible (zone names, role ARNs that downstream
  consumers depend on).

## 5. Plans (`docs/plans/`)

Same format and rules as `yotta-infra`:

- **Filename**: `YYYY-MM-DD-descriptive-name.md`.
- **Top of file**: step table — `#`, `Status`, `Difficulty`,
  `Description`.
- **Body**: one detail section per step.
- **Status**: `Not started` · `In progress` · `Blocked` · `Done`.
- **Difficulty**: `S` · `M` · `L`.
- **`OPEN`** markers for unresolved decisions, with recommended
  defaults.

Agents update the step `Status` as they progress. Humans review via
the table.

## 6. Tag standard

Every resource carries:

| Key            | Value                              |
|----------------|------------------------------------|
| `Environment`  | `shared`                           |
| `Application`  | `alwaysbespoke-shared`             |
| `Team`         | `platform-engineering`             |
| `CostCenter`   | `engineering`                      |
| `ManagedBy`    | `cdk` or `terraform`               |
| `Region`       | the AWS region (e.g. `us-east-1`)  |

`Environment=shared` is deliberate: this account is parent-org, not
a dev/stage/prod footprint. If a future workload here genuinely has
envs, introduce a new value rather than reusing `prod`.

CDK helper: `cdk/lib/tagging.ts`. Terraform helper:
`terraform/modules/tags/`.

A test in each tool walks the synthed templates / planned resources
and fails if any taggable resource is missing a key.

## 7. Naming standard

`ab-<env>-<region-short>[-<purpose>]` — e.g.
`ab-shared-use1-external-dns-yotta`.

Region short codes are the same map as `yotta-infra`
(`us-east-1` → `use1`, …). When a new region is adopted, extend the
map in the shared naming helper, not ad-hoc.

## 8. Multi-region / multi-env

Both projects support multi-region from day one (CDK via context,
Terraform via env directories). Today there's one effective
(env, region) pair: `shared/us-east-1`.

If you find yourself hard-coding `us-east-1` in a stack, you're
holding it wrong — pull from config.

## 9. Cross-repo handoff workflow

When this repo creates a resource that a child repo consumes (a
trust-relationship IAM role for external-dns, a hosted zone ID, an
ACM certificate ARN), the workflow is:

```
1. ab-infra PR creates/updates the resource and exports its ARN under
   a stable CloudFormation Export.Name. Updates docs/handoff/.
2. Child repo PR (e.g. yotta-infra) references the export from
   docs/handoff/ when wiring its IRSA role / IAM policy.
3. Both PRs merge; the child repo deploys against the new export.
```

**Never reverse the order.** A child-repo PR that references an
ab-infra export that doesn't yet exist will fail at deploy.

Renames or scope changes are **two-PR**: add the new export
alongside the old, switch consumers, remove the old. Same dance as
between `yotta-infra` and `yotta-gitops`.

## 10. When to ask vs. act

**Ask first** when:
- The change touches a hosted zone or DNS record that a public
  service depends on (a typo here = downtime for that service).
- A cross-account trust policy widens its allowed principals.
- A resource that downstream consumers reference (zone, role ARN,
  cert ARN) gets renamed.

Otherwise act; keep the active plan current; note anything
non-trivial in the PR description.

## 11. Commit messages

Subject is prefixed with **`msalfran/<type>: <message>`** —
`@msalfran` is the current primary engineer on the alwaysbespoke
(ab-*) repos. Examples:

- `msalfran/feat: scaffold ab-infra (CDK + Terraform + CI)`
- `msalfran/fix: bootstrap-tf needs -auto-approve for unattended runs`
- `msalfran/docs: add handoff contract for child repos`

The prefix is **per-commit attribution, not a per-repo lockdown**.
When more engineers contribute, ask which engineer is the primary
author before composing the commit.

## 12. Common commands

> Filled in as the Makefile lands. See the active plan in
> `docs/plans/` for the canonical commands of the day.

Planned set (matches `yotta-infra`'s):

```
make install                                 # npm ci + terraform init
make test                                    # CDK jest + terraform test
make synth                                   # cdk synth
make diff                                    # cdk diff against live stacks
make deploy                                  # cdk deploy --all
make bootstrap-tf                            # one-time per account
make bootstrap-cdk                           # one-time per (account, region)
make ci                                      # local equivalent of CI
```
