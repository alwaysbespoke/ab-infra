# 2026-05-22 — Bootstrap `ab-infra` (scaffold + `yotta.bot` zone + cross-account DNS role)

> **Owner:** platform-engineering
> **Status:** Draft — Step 1 `OPEN` decisions block the rest.
> **Target account:** Alwaysbespoke parent — `768507067298`, `us-east-1`.
> **Related repos:**
> [`yotta-infra`](https://github.com/yotta-holdings/yotta-infra)
> consumes the cross-account role from Step 8 to wire
> `external-dns` into the yotta cluster.
> **Triggered by:** the cross-account DNS work scoped from yotta-gitops
> — Argo CD / Grafana / Prometheus / yotta-bot apex all need DNS
> records in `yotta.bot`.

---

## Summary

Stand up `ab-infra` end-to-end and ship the first concrete
deliverable: a cross-account IAM role in the alwaysbespoke account
that the yotta cluster's `external-dns` can assume to write records
in the `yotta.bot` Route 53 zone.

After this plan lands, the dependent work in yotta-infra +
yotta-gitops (AWS Load Balancer Controller, ACM cert, ingress) can
proceed without further changes in this account.

## Scope

**In scope**
- Repo scaffolding: `README.md` ✅, `AGENTS.md` ✅, `Makefile`,
  `.gitignore`, CDK + Terraform layouts, lint config, CI workflow.
- Terraform remote-state bootstrap module + apply in account
  `768507067298`.
- CDK app scaffold with the same env/region pattern as `yotta-infra`
  (single env `shared`, region `us-east-1` to start).
- Shared tagging + naming helpers (same shape, ab-specific values).
- **Hosted zone import** for the existing `yotta.bot` Route 53 zone
  (so future records / cross-account roles can reference it via
  CDK).
- **Cross-account IAM role** for yotta's `external-dns` to assume,
  with permissions scoped to the `yotta.bot` hosted zone only.
- GitHub Actions CI with OIDC (read-only role; same posture as
  `yotta-infra`).
- Handoff contract doc listing the exported values for child repos.
- Runbook.

**Out of scope**
- ACM certificate for `*.yotta.bot` — proposed to live in
  `yotta-infra` because the certs are consumed by ALBs there, and
  AWS does not support cross-account cert sharing. The DNS
  validation records go in `yotta.bot` via the role from this plan.
- A second cross-account role for any other child brand — add per
  brand as they exist.
- Org SCPs, billing org, central log archive — separate plans when
  needed.

## Tooling boundary reminder

| Thing                                                | Lives in       |
|------------------------------------------------------|----------------|
| `yotta.bot` Route 53 zone                            | **here** (imported, since it was created out-of-band) |
| Cross-account IAM role for yotta's external-dns      | **here**       |
| Yotta cluster's `external-dns` IRSA role             | `yotta-infra`  |
| Yotta cluster's `external-dns` Helm install          | `yotta-gitops` |

## Steps

| #  | Status      | Difficulty | Description                                                                                       |
|----|-------------|------------|---------------------------------------------------------------------------------------------------|
| 1  | Not started | S          | Resolve `OPEN` decisions (CDK lang, env name, naming, tag values, zone ID, CI scope)              |
| 2  | Not started | S          | Repo scaffolding: Makefile, .gitignore, dirs, .yamllint, dependabot                               |
| 3  | Not started | S          | Terraform state-backend bootstrap module + native `terraform test` (mirror yotta-infra)           |
| 4  | Not started | S          | CDK app scaffold (TS) with env/region config (single pair: `shared/us-east-1`)                    |
| 5  | Not started | S          | Shared tagging + naming helpers + repo-wide tag-coverage test                                     |
| 6  | Not started | S          | `HostedZoneStack`: imports the existing `yotta.bot` zone; exports zone ID + name                  |
| 7  | Not started | S          | `CiOidcStack`: GitHub OIDC provider + read-only CI role (scoped to this repo)                     |
| 8  | Not started | M          | `CrossAccountDnsStack`: IAM role `ab-shared-use1-external-dns-yotta` for yotta to assume          |
| 9  | Not started | S          | CDK + TF tests cover the new stacks; `make ci` green                                              |
| 10 | Not started | S          | GitHub Actions CI workflow (jest, cdk synth, terraform fmt/validate/test, cdk diff on PR)         |
| 11 | Not started | S          | Handoff contract (`docs/handoff/child-repo-contract.md`) listing exports                          |
| 12 | Not started | S          | Bootstrap runbook (TF bootstrap → cdk bootstrap → deploy)                                         |
| 13 | Not started | M          | Apply to AWS: TF bootstrap, `cdk bootstrap`, deploy all stacks                                    |

Status legend: `Not started` · `In progress` · `Blocked` · `Done`
Difficulty legend: `S` (~hours) · `M` (~1 day) · `L` (multi-day)

---

## Step 1 — Resolve open decisions

**`OPEN` decisions**

1. **CDK language: TypeScript.** Recommendation: same as
   `yotta-infra` — keeps cross-repo cognitive load low, same Jest
   tests, same construct library.
2. **Env name for this account: `shared`.** Recommendation: this is
   parent-org, not a dev/stage/prod footprint. `shared` makes the
   tagging unambiguous. Don't reuse `prod` (it'd confuse cost
   dashboards that group by Application+Environment).
3. **Resource naming prefix: `ab`.** Short, scannable in the
   console. Same `<prefix>-<env>-<region-short>[-<purpose>]` shape.
4. **`yotta.bot` Route 53 zone ID.** I need this from you to do the
   import in Step 6. Find with:
   ```
   AWS_PROFILE=AdministratorAccess-768507067298 \
     aws route53 list-hosted-zones-by-name --dns-name yotta.bot \
     --query "HostedZones[0].Id" --output text
   ```
5. **Region scope.** `us-east-1` to start (matches the yotta
   cluster). Route 53 is global so region is mostly cosmetic for
   DNS, but the stack itself has to live somewhere.
6. **CI deploy role?** Recommendation: no — same as `yotta-infra`,
   read-only role only. Deploys are operator-run until we explicitly
   adopt CI-driven deploy.
7. **Cross-account role's trust scope.** Recommendation: trust the
   exact IRSA role ARN from `yotta-infra`'s external-dns stack
   (will be `arn:aws:iam::461780750330:role/yotta-prod-use1-external-dns`).
   Single-principal trust — tighter than trusting the whole yotta
   account's root.

**Acceptance criteria**

- Each `OPEN` resolved and added to the Decision Log **before**
  Step 4 begins.
- Zone ID captured in a constant in `cdk/config/`.

**Test approach.** N/A — review only.

---

## Step 2 — Repo scaffolding

**Goal.** Repo has the same structure as `yotta-infra` and is
ready for CDK/Terraform code.

**Implementation notes**

- `README.md` (✅ done with this plan).
- `AGENTS.md` (✅ done with this plan).
- `Makefile` mirroring `yotta-infra` — `install`, `test`, `fmt`,
  `fmt-check`, `validate-tf`, `ci`, `synth`, `diff`, `deploy`,
  `bootstrap-tf`, `bootstrap-cdk`, `clean`. All accept
  `ENV=shared`, `REGION=us-east-1`, `REGION_SHORT=use1`,
  `PROFILE=AdministratorAccess-768507067298` overrides; defaults
  point at the single live (env, region).
- `.gitignore` + `.yamllint.yaml` (relax for Helm-style values
  files in case future shared infra has any).
- `.github/dependabot.yaml` — npm + terraform + github-actions.
- Empty dirs as needed (`cdk/`, `terraform/`, `docs/onboarding/`,
  `docs/runbooks/`, `docs/handoff/`).

**Acceptance criteria**

- `make help` prints the target list.
- `make lint` runs (no content yet → trivially clean).

**Test approach.** Lint output is the test.

---

## Step 3 — Terraform state-backend bootstrap

**Goal.** A one-time-per-account TF state bucket + lock table for
this account.

**Implementation notes**

- Layout copied from `yotta-infra/terraform/`:
  - `terraform/bootstrap/{main,versions,variables,outputs}.tf`
  - `terraform/bootstrap/tests/bootstrap.tftest.hcl` with the same
    stubbed AWS provider so CI runs without creds.
  - `terraform/modules/tags/` with ab-specific tag values.
  - `terraform/envs/shared-use1/` as the (currently empty) non-AWS
    root.
- Bucket name follows the yotta convention:
  `yotta-tfstate-<account>-<region>` → here that becomes
  `yotta-tfstate-768507067298-us-east-1`. The "yotta" prefix is
  ahistorical baggage of the convention; not worth bikeshedding for
  a one-time-per-account bucket. *(Open in §1 if you'd rather use
  `ab-tfstate-…` for cosmetic consistency.)*
- Lock table same pattern.

**Acceptance criteria**

- `terraform test` passes 4+ assertions on bootstrap (bucket name,
  versioning, encryption, public-access-block, lock table schema,
  variable validation).

**Test approach.** Native `terraform test`, no AWS creds needed.

---

## Step 4 — CDK app scaffold

**Goal.** A working CDK app that knows how to instantiate stacks
for the single `(shared, us-east-1)` context, with the same
fail-loudly behavior as `yotta-infra` for unknown contexts.

**Implementation notes**

- `cdk/` initialized with TypeScript, Jest, identical tsconfig to
  `yotta-infra`.
- `cdk/config/environments.ts` — single entry today
  (`shared/us-east-1`), account `768507067298`. Same
  `loadEnvironment` + `assertAccountPopulated` helpers.
- `cdk/bin/ab-infra.ts` entry point reading context flags.
- Stack naming: `Ab-Shared-Use1-<Purpose>` (PascalCase) matching
  the yotta `Yotta-<Env>-<RegionShort>-<Purpose>` convention.
- A placeholder stack confirming the wiring, deleted at Step 6 when
  the first real stack lands.

**Acceptance criteria**

- `npx cdk synth --context env=shared --context region=us-east-1`
  succeeds.
- Unknown (env, region) pair fails loudly with a clear error.

**Test approach.** Jest tests on the config loader + the
placeholder stack synth.

---

## Step 5 — Shared tagging + naming helpers

**Goal.** Same `applyStandardTags` / `resourceName` /
`regionShortFor` helpers as `yotta-infra`, with the ab-specific
tag values (`Application: alwaysbespoke-shared`,
`Environment: shared`).

**Implementation notes**

- `cdk/lib/tagging.ts` — exports `STANDARD_TAG_KEYS`,
  `applyStandardTags(scope, config)`. The `Application` value is
  hard-coded `'alwaysbespoke-shared'`.
- `cdk/lib/naming.ts` — exports `regionShortFor` (same region
  map; consider extracting to a shared package later) and
  `resourceName(cfg, purpose?)` returning `ab-<env>-<short>[-<purpose>]`.
- Repo-wide `tag-coverage.test.ts` walking every taggable resource
  in every synthed stack and asserting the standard tag keys.
- Terraform side: `modules/tags/` with the same outputs but
  `Application = "alwaysbespoke-shared"` and `ManagedBy = "terraform"`.
- A test for both tooling sides.

**Acceptance criteria**

- Tag-coverage test passes on the placeholder + future stacks.
- TF native test passes on tags module.

**Test approach.** Same pattern as `yotta-infra` — assertions on
the synthed templates / TF plan output.

---

## Step 6 — `HostedZoneStack`

**Goal.** The `yotta.bot` Route 53 hosted zone is referenceable from
CDK code in this repo (without re-creating the zone).

**Implementation notes**

- `cdk/lib/hosted-zone-stack.ts` — uses
  `route53.HostedZone.fromHostedZoneAttributes({ hostedZoneId,
  zoneName })` to import the existing zone. Zone ID + name from
  config (Step 1 OPEN #4).
- Exports:
  - `ab-shared-use1-yotta-bot-zone-id`
  - `ab-shared-use1-yotta-bot-zone-name`
- This stack is the seam where future per-record stacks (a
  `bot.yotta.bot` MX, marketing redirect CNAMEs, etc.) plug in.
- It does NOT create records — those land in child-brand repos
  via the cross-account role from Step 8.

**Acceptance criteria**

- `cdk synth` produces the imports + outputs cleanly.
- A test asserts the zone ID matches the configured value.

**Test approach.** `aws-cdk-lib/assertions` on outputs.

---

## Step 7 — `CiOidcStack`

**Goal.** GitHub Actions can assume a read-only role in this
account, same pattern as `yotta-infra`.

**Implementation notes**

- Copy of `yotta-infra/cdk/lib/ci-oidc-stack.ts` with the new
  repo/owner:
  - `githubOrg: alwaysbespoke`
  - `githubRepo: ab-infra`
- Role name: `ab-infra-ci-read`.
- AWS-managed `ReadOnlyAccess`.
- Same 1 h max session, same well-known OIDC thumbprint, same
  trust-policy `sub` pattern.

**Acceptance criteria**

- `npm test` green for ci-oidc-stack assertions (role exists,
  trust scoped to alwaysbespoke/ab-infra, ReadOnlyAccess attached).

**Test approach.** Mirror `yotta-infra`'s ci-oidc-stack tests.

---

## Step 8 — `CrossAccountDnsStack` (the meaty step)

**Goal.** Yotta's `external-dns` controller pod can write records
in the `yotta.bot` zone by assuming a role in this account.

**Implementation notes**

- File: `cdk/lib/cross-account-dns-stack.ts`.
- Creates an IAM role `ab-shared-use1-external-dns-yotta`:
  - **Trust policy:** assumed by exactly
    `arn:aws:iam::461780750330:role/yotta-prod-use1-external-dns`
    (the yotta-side IRSA role; will be created in a yotta-infra PR
    that lands as part of the cross-account DNS plan there).
  - **Permissions** (scoped to the yotta.bot hosted zone):
    ```json
    {
      "Effect": "Allow",
      "Action": ["route53:ChangeResourceRecordSets", "route53:ListResourceRecordSets"],
      "Resource": "arn:aws:route53:::hostedzone/<yotta-bot-zone-id>"
    },
    {
      "Effect": "Allow",
      "Action": ["route53:GetChange"],
      "Resource": "arn:aws:route53:::change/*"
    },
    {
      "Effect": "Allow",
      "Action": ["route53:ListHostedZonesByName", "route53:ListHostedZones"],
      "Resource": "*"
    }
    ```
- Exports:
  - `ab-shared-use1-external-dns-yotta-role-arn`

**Sequencing gotcha.** The trust policy hard-codes a role ARN that
**doesn't yet exist** when this stack first deploys. AWS IAM allows
trust policies to reference non-existent ARNs — the trust silently
becomes effective once the principal is created. **No retry needed**
on the yotta side; the trust is in place before the yotta-side
external-dns IRSA role is created.

**Acceptance criteria**

- `cdk synth` produces an `AWS::IAM::Role` with the trust policy
  above + the scoped Route 53 permissions.
- A test asserts the trust principal is exactly the expected ARN.
- A test asserts the policy resource ARN includes the
  yotta.bot zone ID, not `*`.

**Test approach.** `aws-cdk-lib/assertions` on the role's trust
policy + inline policy + exports.

---

## Step 9 — Tests

**Goal.** All of the above is covered by jest / `terraform test`
running as `make ci`.

**Implementation notes**

- One test file per stack (placeholder, hosted-zone, ci-oidc,
  cross-account-dns).
- Repo-wide tag-coverage test.
- TF tests live under `terraform/bootstrap/tests/` and
  `terraform/modules/tags/tests/`.

**Acceptance criteria**

- `make ci` is green locally.

**Test approach.** The tests are the deliverable.

---

## Step 10 — GitHub Actions CI

**Goal.** Every PR runs lint + test + synth on shared/us-east-1;
`cdk diff` on PRs uses the OIDC role from Step 7.

**Implementation notes**

- `.github/workflows/ci.yaml` mirrors `yotta-infra`'s with the
  matrix collapsed to one `(env, region)` pair:
  `(shared, us-east-1)`.
- `cdk-diff` job assumes the `ab-infra-ci-read` role via OIDC.
- TF jobs identical to yotta-infra's (`fmt`, `validate`, native
  `test` on bootstrap + tags).

**Acceptance criteria**

- A PR with a deliberate broken stack fails CI.
- A PR with a missing tag fails the tag-coverage assertion.

**Test approach.** Throwaway PR per failure mode.

---

## Step 11 — Handoff contract

**Goal.** A single doc that child repos consult to find every
ARN / ID / value they consume from this account.

**Implementation notes**

- `docs/handoff/child-repo-contract.md` modeled on
  `yotta-infra/docs/handoff/yotta-gitops-contract.md`:
  - Stable exports table (zone ID, zone name, cross-account role
    ARN, CI role ARN).
  - How to fetch a value (`aws cloudformation list-exports`).
  - Per-consumer snippets — e.g., the `external-dns` Helm values
    that reference the role ARN.

**Acceptance criteria**

- A `yotta-infra` engineer can wire `external-dns` using only this
  doc + the yotta-side plan.

---

## Step 12 — Bootstrap runbook

**Goal.** A new operator can stand up this account's TF state
backend + CDK toolkit and deploy from scratch.

**Implementation notes**

- `docs/runbooks/bootstrap-ab-prod.md` (or `bootstrap-shared.md` —
  pick in §1) covering:
  - SSO profile setup (`AdministratorAccess-768507067298`).
  - `make bootstrap-tf` — creates S3 state bucket + DDB lock.
  - `make bootstrap-cdk` — installs CDKToolkit.
  - `make deploy` — stack-by-stack order
    (`HostedZone` → `CiOidc` → `CrossAccountDns`).
  - Tear-down warnings (deleting the hosted-zone import is harmless;
    deleting the cross-account role breaks yotta's external-dns).

**Acceptance criteria** — pair-walk before merge.

---

## Step 13 — Apply to AWS

**Goal.** Run the runbook against the live account, verify outputs.

**Implementation notes**

1. `make bootstrap-tf` — TF state bucket exists.
2. `make bootstrap-cdk` — CDKToolkit deployed.
3. `make deploy` — all three stacks (`HostedZone`, `CiOidc`,
   `CrossAccountDns`) deployed.
4. Verify each export is listed in `aws cloudformation
   list-exports`.

**Acceptance criteria**

- All three stacks `CREATE_COMPLETE`.
- The cross-account role's ARN is visible via
  `list-exports` and grep-able from a yotta-side terminal.
- A test `aws sts assume-role` from a (manually-faked) principal
  matching the trust policy succeeds. _(Optional but high-value
  smoke test before the yotta-side wiring goes live.)_

**Test approach.** The smoke test in (4) is the test.

---

## Decision log

| Date | Decision | Rationale | Alternative considered |
|------|----------|-----------|------------------------|
| 2026-05-22 | New repo `ab-infra` (vs. extending `yotta-infra` to also touch the ab account) | Account boundary = repo boundary. Reviewers, IAM, CI auth all align cleanly. Sets the pattern for future sibling brands. | Single `yotta-infra` touching both accounts (mixed reviewers, mixed IAM trust, unclear blast radius). |
| 2026-05-22 | `Environment` tag value `shared` for resources in this account | Account is parent-org, not a per-env footprint. Avoids polluting FinOps groups-by-env. | Reuse `prod` (would confuse cost dashboards). |
| 2026-05-22 | The cross-account IAM role lives **here**, the IRSA role on the cluster side lives in `yotta-infra` | Each side owns the role it trusts/creates. Trust policy ARN is the cross-repo contract. | Both roles in `yotta-infra` (would require yotta deploy to write to the ab account — coupling we don't want). |
| 2026-05-22 | ACM cert for `*.yotta.bot` deploys in `yotta-infra` (not here) | The cert is consumed by ALBs in the yotta cluster, and AWS doesn't support cross-account cert sharing. DNS validation records still go in `yotta.bot` via the role from Step 8. | Cert in `ab-infra` (impossible: would still need to be exported / re-issued in the yotta account). |
| 2026-05-22 | Trust the **specific IRSA role ARN** (not the whole yotta account) on the cross-account role | Tightest trust; minimal blast radius if any other principal in the yotta account is ever compromised. | Trust `arn:aws:iam::461780750330:root` (broader, less work). |

**Pending sub-decisions** from Step 1 (collect here as resolved):
- (8) State-bucket naming — `yotta-tfstate-…` (consistent baggage)
  or `ab-tfstate-…` (cosmetic). Default: keep the yotta-prefixed
  convention for one-time-per-account resources.
