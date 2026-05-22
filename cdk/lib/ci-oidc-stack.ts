// GitHub Actions → AWS authentication via OIDC for ab-infra.
//
// Direct port of yotta-infra's CiOidcStack — the pattern doesn't
// vary between accounts; only the trust scope and role name do.
// Trust is bound to `repo:<githubOrg>/<githubRepo>:*`; role grants
// AWS-managed ReadOnlyAccess for `cdk diff` / `terraform plan`.

import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface CiOidcStackProps extends cdk.StackProps {
  readonly githubOrg: string;
  readonly githubRepo: string;
}

export class CiOidcStack extends cdk.Stack {
  public readonly provider: iam.CfnOIDCProvider;
  public readonly ciReadRole: iam.Role;

  constructor(scope: Construct, id: string, props: CiOidcStackProps) {
    super(scope, id, props);

    const { githubOrg, githubRepo } = props;

    this.provider = new iam.CfnOIDCProvider(this, 'GitHubOidcProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIdList: ['sts.amazonaws.com'],
      // Well-known DigiCert root thumbprint; AWS validates via OIDC
      // discovery anyway, but omitting breaks older clients.
      thumbprintList: ['6938fd4d98bab03faadb97b34396831e3780aea1'],
    });

    this.ciReadRole = new iam.Role(this, 'CiReadRole', {
      roleName: 'ab-infra-ci-read',
      description:
        `Role assumed by GitHub Actions in ${githubOrg}/${githubRepo} for read-only checks (cdk synth/diff, terraform fmt/validate/plan).`,
      maxSessionDuration: cdk.Duration.hours(1),
      assumedBy: new iam.FederatedPrincipal(
        this.provider.attrArn,
        {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          },
          StringLike: {
            // Any ref / any PR on this specific repo. Fork PRs
            // have a different sub claim and won't match.
            'token.actions.githubusercontent.com:sub': `repo:${githubOrg}/${githubRepo}:*`,
          },
        },
        'sts:AssumeRoleWithWebIdentity',
      ),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('ReadOnlyAccess'),
      ],
    });

    new cdk.CfnOutput(this, 'OidcProviderArn', {
      value: this.provider.attrArn,
      description: 'GitHub OIDC provider ARN. One per AWS account.',
      exportName: `${this.stackName}-oidc-provider-arn`,
    });
    new cdk.CfnOutput(this, 'CiReadRoleArn', {
      value: this.ciReadRole.roleArn,
      description: 'IAM role ARN to put in .github/workflows/ci.yaml `role-to-assume`.',
      exportName: `${this.stackName}-ci-read-role-arn`,
    });
  }
}
