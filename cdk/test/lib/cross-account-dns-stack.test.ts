// Assertions on the cross-account DNS stack. Trust policy + scoped
// Route 53 permissions are the contract — a regression here either
// hands yotta's external-dns more power than it should have or
// breaks its ability to write at all.

import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';

import { loadEnvironment } from '../../config/environments';
import { CrossAccountDnsStack } from '../../lib/cross-account-dns-stack';
import { applyStandardTags } from '../../lib/tagging';

function synth(): Template {
  const app = new cdk.App();
  const cfg = loadEnvironment('shared', 'us-east-1');
  applyStandardTags(app, cfg);
  const stack = new CrossAccountDnsStack(app, 'Test-CrossAccountDns', {
    env: { account: cfg.account, region: cfg.region },
    config: cfg,
  });
  return Template.fromStack(stack);
}

describe('CrossAccountDnsStack', () => {
  const template = synth();
  const cfg = loadEnvironment('shared', 'us-east-1');

  describe('yotta consumer role', () => {
    it('is named ab-shared-use1-external-dns-yotta', () => {
      template.hasResourceProperties('AWS::IAM::Role', {
        RoleName: 'ab-shared-use1-external-dns-yotta',
      });
    });

    it('trusts the yotta account root, narrowed to the external-dns role via aws:PrincipalArn', () => {
      // Pattern explained in cross-account-dns-stack.ts: account-root
      // principal + condition (vs. role-ARN principal directly) so
      // the trust policy can be applied before the consumer's IRSA
      // role exists.
      const yotta = cfg.dnsConsumers.find((c) => c.name === 'yotta')!;
      template.hasResourceProperties('AWS::IAM::Role', {
        RoleName: 'ab-shared-use1-external-dns-yotta',
        AssumeRolePolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: 'Allow',
              Action: 'sts:AssumeRole',
              Principal: Match.objectLike({
                // CDK renders AccountPrincipal as an Fn::Join that
                // builds `arn:aws:iam::<account>:root` at deploy
                // time — match the structure loosely.
                AWS: Match.anyValue(),
              }),
              Condition: {
                StringEquals: {
                  'aws:PrincipalArn': yotta.principalArn,
                },
              },
            }),
          ]),
        }),
      });
    });

    it('caps the session at 1 hour', () => {
      template.hasResourceProperties('AWS::IAM::Role', {
        RoleName: 'ab-shared-use1-external-dns-yotta',
        MaxSessionDuration: 3600,
      });
    });
  });

  describe('yotta consumer policy', () => {
    it('scopes Route53 mutation to the yotta.bot zone ARN (not `*`)', () => {
      // CFn flattens single-element Resource arrays to a scalar, so
      // we can't use a simple `Match.arrayWith` here. Walk every
      // AWS::IAM::Policy and look for a statement matching our SID;
      // accept either the array or scalar form of Resource.
      const zoneId = cfg.dnsConsumers
        .find((c) => c.name === 'yotta')!
        .allowedZones.find((z) => z.name === 'yotta.bot')!.id;
      const expectedArn = `arn:aws:route53:::hostedzone/${zoneId}`;

      const policies = template.findResources('AWS::IAM::Policy');
      const mutationResources: unknown[] = [];
      for (const policy of Object.values(policies)) {
        const stmts = (policy as {
          Properties: { PolicyDocument: { Statement: Array<{ Sid?: string; Resource?: unknown }> } };
        }).Properties.PolicyDocument.Statement;
        for (const stmt of stmts) {
          if (stmt.Sid === 'Route53ZoneMutation') {
            mutationResources.push(stmt.Resource);
          }
        }
      }
      expect(mutationResources.length).toBeGreaterThan(0);
      // Resource may be a scalar (single zone) or an array (multi).
      // Flatten and assert the expected ARN is present.
      const flattened = mutationResources.flatMap((r) =>
        Array.isArray(r) ? r : [r],
      );
      expect(flattened).toContain(expectedArn);
      // And critically, it does NOT include the wildcard.
      expect(flattened).not.toContain('*');
    });

    it('allows route53:GetChange on change/* (required by external-dns to poll for status)', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Sid: 'Route53ChangePolling',
              Action: 'route53:GetChange',
              Resource: 'arn:aws:route53:::change/*',
            }),
          ]),
        }),
      });
    });

    it('allows zone listing globally (AWS API requires `*` for List*)', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Sid: 'Route53ZoneDiscovery',
              Action: ['route53:ListHostedZones', 'route53:ListHostedZonesByName'],
              Resource: '*',
            }),
          ]),
        }),
      });
    });
  });

  describe('exports for child repos', () => {
    it('exports the yotta role ARN under a stable name', () => {
      template.hasOutput('YottaRoleArn', {
        Export: { Name: 'ab-shared-use1-external-dns-yotta-role-arn' },
      });
    });

    it('exports the allowed zones for the yotta consumer', () => {
      template.hasOutput('YottaAllowedZones', {
        Value: 'yotta.bot',
      });
    });
  });

  describe('one role per dnsConsumer', () => {
    it('creates exactly one IAM Role per entry in config.dnsConsumers', () => {
      const roles = template.findResources('AWS::IAM::Role');
      expect(Object.keys(roles)).toHaveLength(cfg.dnsConsumers.length);
    });
  });
});
