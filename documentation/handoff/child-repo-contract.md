# `ab-infra` → child-brand repos handoff contract

What `ab-infra` provides to brand repos (`yotta-infra`, `yotta-gitops`,
and future siblings). If you're a brand-repo engineer who needs a
role ARN, a zone ID, or any cross-account value, this is the source
of truth.

Values are exposed in two places:

1. **CloudFormation exports** — stable names, pullable from any
   session with `cloudformation:ListExports`.
2. **This document** — copy-paste-ready snippets for the most
   common consumers.

If the doc and an export ever disagree, **trust the export and fix
the doc** in a PR.

---

## 1. Stable exports

Look up the current value with:

```bash
aws cloudformation list-exports \
  --profile AdministratorAccess-768507067298 \
  --query "Exports[?Name=='<export-name>'].Value" --output text
```

| Export name                                              | Stack                              | What it is                                              |
|----------------------------------------------------------|------------------------------------|---------------------------------------------------------|
| `Ab-Shared-Use1-CiOidc-oidc-provider-arn`                | `Ab-Shared-Use1-CiOidc`            | GitHub OIDC provider ARN in the ab account              |
| `Ab-Shared-Use1-CiOidc-ci-read-role-arn`                 | `Ab-Shared-Use1-CiOidc`            | `ab-infra-ci-read` role ARN (for ab-infra's own CI)     |
| `ab-shared-use1-external-dns-yotta-role-arn`             | `Ab-Shared-Use1-CrossAccountDns`   | Cross-account role yotta's external-dns assumes         |

## 2. What `ab-infra` does NOT provide (and where to find it)

- **The `yotta.bot` Route 53 hosted zone**: created out-of-band by
  the Route 53 Registrar; not managed by this repo today. Zone ID
  is `Z065929010FUKCSLSAW7P`. If we ever import it into CDK, it'll
  show up as an export here.
- **ACM certificates for `*.yotta.bot`**: live in the cluster
  account (`yotta-infra`). AWS doesn't support cross-account cert
  sharing — the certs must be issued where the ALB lives. DNS
  validation records get written to `yotta.bot` via the role above.
- **Per-zone DNS records**: written by the consuming cluster's
  `external-dns` using the cross-account role above. `ab-infra`
  does not create individual records.

## 3. Copy-paste snippets

### external-dns Helm values (for the yotta cluster)

```yaml
# In yotta-gitops/charts/external-dns/values-yotta-prod-use1.yaml
provider:
  name: aws

aws:
  region: us-east-1
  # external-dns will assume this cross-account role to write
  # records in the yotta.bot zone hosted in the ab account.
  assumeRoleArn: <paste ab-shared-use1-external-dns-yotta-role-arn export here>

domainFilters:
  - yotta.bot

policy: sync       # safe to delete records external-dns owns

serviceAccount:
  create: true
  name: external-dns
  annotations:
    # The IRSA role in the yotta account that lets the pod assume
    # the cross-account role above. Created by yotta-infra's
    # external-dns IAM stack.
    eks.amazonaws.com/role-arn: arn:aws:iam::461780750330:role/yotta-prod-use1-external-dns
```

### IRSA role in yotta-infra (the principal the cross-account role trusts)

```typescript
// In yotta-infra/cdk/lib/external-dns-stack.ts (to be created in a
// yotta-infra plan). The cross-account role here trusts THIS role.
new iam.Role(this, 'ExternalDnsRole', {
  roleName: 'yotta-prod-use1-external-dns',                   // ← must match the trust
  assumedBy: new iam.FederatedPrincipal(/* … OIDC, system:serviceaccount:external-dns:external-dns … */),
  inlinePolicies: {
    AssumeAbDnsRole: new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          actions: ['sts:AssumeRole'],
          resources: ['arn:aws:iam::768507067298:role/ab-shared-use1-external-dns-yotta'],
        }),
      ],
    }),
  },
  // Standard IRSA service-account trust...
});
```

## 4. Adding a new consumer (new brand cluster)

When a new brand cluster needs cross-account DNS:

1. In `ab-infra`: add a new entry to `dnsConsumers` in
   `cdk/config/environments.ts` with the new brand's IRSA role ARN
   and the zones it should be allowed to write. PR + deploy →
   creates `ab-shared-use1-external-dns-<brand>` + corresponding
   export.
2. In `<brand>-infra`: create the IRSA role that this stack trusts.
   Inline policy grants `sts:AssumeRole` on the cross-account role
   above. PR + deploy.
3. In `<brand>-gitops`: configure external-dns with the
   `assumeRoleArn` from the export above. PR + sync.

Order matters only for the *first* deploy — the trust policy
references a not-yet-existent principal until step 2, which IAM
accepts (the trust becomes effective once the principal exists).

## 5. Breaking changes

A rename of a role / export / zone ID is a **breaking change** for
child repos. Process:

1. `ab-infra` PR introduces the *new* role/export alongside the
   old (additive).
2. Child-repo PRs switch consumers to the new export.
3. `ab-infra` PR removes the old.

Two-PR dance avoids "external-dns silently broken" pages.
