// Cross-account IAM roles allowing child-brand clusters to write
// records in Route 53 zones hosted in this (alwaysbespoke parent)
// account.
//
// One role per consumer (child brand). Each role's trust policy
// points at the consumer's IRSA role ARN, and its inline policy
// scopes Route 53 writes to that consumer's allowed zones only.
//
// **Sequencing gotcha.** A consumer's IRSA role typically lives in
// the consumer's repo (e.g. yotta-infra) and may not exist when
// this stack first deploys. IAM trust policies tolerate
// non-existent principals — the trust activates once the principal
// is created. No retry needed on either side.

import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

import { EnvironmentConfig } from '../config/environments';
import { resourceName } from './naming';

export interface CrossAccountDnsStackProps extends cdk.StackProps {
  readonly config: EnvironmentConfig;
}

export class CrossAccountDnsStack extends cdk.Stack {
  /** Map of consumer name → the IAM role created for them. */
  public readonly consumerRoles: ReadonlyMap<string, iam.Role>;

  constructor(scope: Construct, id: string, props: CrossAccountDnsStackProps) {
    super(scope, id, props);

    const { config } = props;
    const roleMap = new Map<string, iam.Role>();

    for (const consumer of config.dnsConsumers) {
      const role = this.makeConsumerRole(consumer);
      roleMap.set(consumer.name, role);

      // Stable per-consumer export so child repos can pull this
      // role ARN by name (e.g. `aws cloudformation list-exports`
      // → `ab-shared-use1-external-dns-yotta-role-arn`).
      const exportBase = resourceName(config, `external-dns-${consumer.name}`);
      new cdk.CfnOutput(this, `${pascalCase(consumer.name)}RoleArn`, {
        value: role.roleArn,
        description:
          `Cross-account DNS role for the ${consumer.name} cluster. Annotate the cluster's external-dns SA with this ARN.`,
        exportName: `${exportBase}-role-arn`,
      });
      new cdk.CfnOutput(this, `${pascalCase(consumer.name)}AllowedZones`, {
        value: consumer.allowedZones.map((z) => z.name).join(','),
        description: `Comma-separated zone names the ${consumer.name} role may write.`,
      });
    }

    this.consumerRoles = roleMap;
  }

  private makeConsumerRole(consumer: EnvironmentConfig['dnsConsumers'][number]): iam.Role {
    const roleName = `ab-shared-use1-external-dns-${consumer.name}`;

    // Extract the consumer's AWS account from the principalArn we'll
    // trust. ARN format: arn:aws:iam::<account>:role/<name>.
    const consumerAccount = consumer.principalArn.split(':')[4];

    // Trust pattern: account-root + `aws:PrincipalArn` condition.
    //
    // Why not trust the role ARN directly: AWS IAM validates that
    // role-ARN principals EXIST at create time. The consumer's
    // IRSA role is created in the consumer's repo (e.g. yotta-infra)
    // and may not exist when we first deploy this stack. Trusting
    // the *account root* always validates (the root exists by
    // definition), and `aws:PrincipalArn` narrows the effective
    // trust at runtime to exactly the role we intended.
    //
    // Effective security is equivalent: only the specified role
    // can assume, even though the trust formally permits the whole
    // account.
    const assumedBy = new iam.PrincipalWithConditions(
      new iam.AccountPrincipal(consumerAccount),
      {
        StringEquals: {
          'aws:PrincipalArn': consumer.principalArn,
        },
      },
    );

    const role = new iam.Role(this, `${pascalCase(consumer.name)}DnsRole`, {
      roleName,
      description:
        `Cross-account role for the ${consumer.name} cluster's external-dns to write Route 53 records in: ${consumer.allowedZones.map((z) => z.name).join(', ')}.`,
      assumedBy,
      maxSessionDuration: cdk.Duration.hours(1),
    });

    // Permissions — scoped per zone, not `*`. The wide-open
    // ListHostedZones* on `*` is unavoidable: external-dns
    // discovers zones at startup and the AWS API requires `*` for
    // the listing calls. Mutation is still scoped to the specific
    // zones below.
    const zoneArns = consumer.allowedZones.map(
      (z) => `arn:aws:route53:::hostedzone/${z.id}`,
    );

    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'Route53ZoneMutation',
        effect: iam.Effect.ALLOW,
        actions: [
          'route53:ChangeResourceRecordSets',
          'route53:ListResourceRecordSets',
        ],
        resources: zoneArns,
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'Route53ChangePolling',
        effect: iam.Effect.ALLOW,
        actions: ['route53:GetChange'],
        resources: ['arn:aws:route53:::change/*'],
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'Route53ZoneDiscovery',
        effect: iam.Effect.ALLOW,
        actions: [
          'route53:ListHostedZones',
          'route53:ListHostedZonesByName',
        ],
        resources: ['*'],
      }),
    );

    return role;
  }
}

function pascalCase(s: string): string {
  return s
    .split(/[-_]/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
}
