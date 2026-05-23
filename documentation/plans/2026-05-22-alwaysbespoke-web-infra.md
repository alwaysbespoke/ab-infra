# 2026-05-22 — `AlwaysBespokeWebStack` CDK infrastructure

> **Owner:** platform-engineering
> **Status:** Not started
> **Parent plan:** `ab-cross-repo/documentation/plans/2026-05-22-alwaysbespoke-web-s3-cloudfront.md`
> **Target account:** `768507067298`, `us-east-1`.

---

## Summary

CDK stack in TypeScript that provisions the S3 + CloudFront + ACM +
Route 53 infrastructure for `alwaysbespoke.com`. This plan covers
Steps 3–6 from the cross-repo plan.

## Steps

| #  | Status      | Difficulty | Description                                                                              |
|----|-------------|------------|------------------------------------------------------------------------------------------|
| 1  | Not started | S          | Audit existing resources — list ACM certs, Route 53 zones, bucket policies               |
| 2  | Not started | S          | Add `AlwaysBespokeWebStack` to `cdk/lib/`                                                |
| 3  | Not started | S          | S3 bucket — private, OAC, versioning, naming-standard compliant                          |
| 4  | Not started | S          | ACM certificate — `alwaysbespoke.com` + wildcard, DNS validation                         |
| 5  | Not started | M          | CloudFront distribution — OAC origin, ACM cert, custom domains, default root object      |
| 6  | Not started | S          | CloudFront Function — clean-URL rewrite for `/case-study`                                |
| 7  | Not started | S          | Route 53 — A + AAAA alias records for apex; www redirect                                 |
| 8  | Not started | S          | CloudFormation exports — bucket name, distribution ID                                    |
| 9  | Not started | S          | Wire stack into `cdk/bin/app.ts`                                                         |
| 10 | Not started | S          | CDK tests — bucket not public, OAC attached, tags pass walker                            |
| 11 | Not started | S          | `cdk synth` + `cdk diff` clean; `make ci` green                                         |

---

## Step details

### Step 1 — Audit

Run with `AWS_PROFILE=AdministratorAccess-768507067298`:

```bash
# ACM certs (must be us-east-1 for CloudFront)
aws acm list-certificates --region us-east-1

# Route 53 zones
aws route53 list-hosted-zones

# Existing bucket policy
aws s3api get-bucket-policy --bucket alwaysbespoke.com --region us-west-1
```

Record results and update this plan before proceeding.

### Step 2 — Stack file

Create `cdk/lib/alwaysbespoke-web-stack.ts`. Use the shared tagging
helper from `cdk/lib/tagging.ts`.

### Step 3 — S3 bucket

```typescript
const bucket = new s3.Bucket(this, 'WebBucket', {
  bucketName: 'ab-shared-use1-web-alwaysbespoke',
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  versioned: true,
  encryption: s3.BucketEncryption.S3_MANAGED,
  removalPolicy: cdk.RemovalPolicy.RETAIN,
});
```

### Step 4 — ACM certificate

```typescript
const cert = new acm.Certificate(this, 'WebCert', {
  domainName: 'alwaysbespoke.com',
  subjectAlternativeNames: ['*.alwaysbespoke.com'],
  validation: acm.CertificateValidation.fromDns(hostedZone),
});
```

Requires a Route 53 hosted zone for `alwaysbespoke.com` in this
account. If the zone is external, use `acm.CertificateValidation.fromEmail()` or import
the zone.

`OPEN` — Confirm where the `alwaysbespoke.com` hosted zone lives.

### Step 5 — CloudFront distribution

- Origin: S3 via OAC (not the legacy S3 website endpoint).
- Default root object: `index.html`.
- Custom error response: 403/404 → `/index.html` with 200 (so
  direct-nav to `/case-study` works).
- Price class: `PriceClass.PRICE_CLASS_100` (NA + EU).

### Step 6 — CloudFront Function

Viewer-request function. Code in Step 4 of the cross-repo plan.

### Step 7 — Route 53

- `ARecord` alias → CloudFront distribution (apex).
- `AaaaRecord` alias → CloudFront distribution (apex).
- `www.alwaysbespoke.com` — either a second CloudFront distribution
  that 301-redirects to apex, or a simple S3 redirect bucket. S3
  redirect bucket is simpler and cheaper.

### Step 8 — Exports

```typescript
new cdk.CfnOutput(this, 'WebBucketName', {
  value: bucket.bucketName,
  exportName: 'ab-shared-use1-web-bucket-name',
});
new cdk.CfnOutput(this, 'WebDistributionId', {
  value: distribution.distributionId,
  exportName: 'ab-shared-use1-web-distribution-id',
});
```

### Step 9 — Wire into app

Add to `cdk/bin/app.ts` alongside existing stacks.

### Step 10 — Tests

In `cdk/test/alwaysbespoke-web-stack.test.ts`:
- `Template.fromStack(stack).hasResourceProperties('AWS::S3::Bucket', { PublicAccessBlockConfiguration: ... })`.
- Assert OAC resource exists.
- Tag-coverage walker passes.

### Step 11 — CI

`make synth` and `make ci` must be green before merging.
