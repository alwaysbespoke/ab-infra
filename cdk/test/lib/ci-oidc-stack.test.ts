// Assertions on the GitHub Actions OIDC stack. Same shape as
// yotta-infra's; trust scope and role name differ.

import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';

import { loadEnvironment } from '../../config/environments';
import { CiOidcStack } from '../../lib/ci-oidc-stack';
import { applyStandardTags } from '../../lib/tagging';

function synth(): Template {
  const app = new cdk.App();
  const cfg = loadEnvironment('shared', 'us-east-1');
  applyStandardTags(app, cfg);
  const stack = new CiOidcStack(app, 'Test-CiOidc', {
    env: { account: cfg.account, region: cfg.region },
    githubOrg: 'alwaysbespoke',
    githubRepo: 'ab-infra',
  });
  return Template.fromStack(stack);
}

describe('CiOidcStack', () => {
  const template = synth();

  describe('OIDC provider', () => {
    it('targets GitHub Actions', () => {
      template.hasResourceProperties('AWS::IAM::OIDCProvider', {
        Url: 'https://token.actions.githubusercontent.com',
        ClientIdList: ['sts.amazonaws.com'],
      });
    });

    it('pins the known DigiCert root thumbprint', () => {
      template.hasResourceProperties('AWS::IAM::OIDCProvider', {
        ThumbprintList: ['6938fd4d98bab03faadb97b34396831e3780aea1'],
      });
    });
  });

  describe('CI read role trust policy', () => {
    it('is named ab-infra-ci-read', () => {
      template.hasResourceProperties('AWS::IAM::Role', {
        RoleName: 'ab-infra-ci-read',
      });
    });

    it('requires sts.amazonaws.com as the aud claim', () => {
      template.hasResourceProperties('AWS::IAM::Role', {
        RoleName: 'ab-infra-ci-read',
        AssumeRolePolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Condition: Match.objectLike({
                StringEquals: {
                  'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
                },
              }),
            }),
          ]),
        }),
      });
    });

    it('scopes the sub claim to alwaysbespoke/ab-infra (any ref / PR)', () => {
      template.hasResourceProperties('AWS::IAM::Role', {
        RoleName: 'ab-infra-ci-read',
        AssumeRolePolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Condition: Match.objectLike({
                StringLike: {
                  'token.actions.githubusercontent.com:sub':
                    'repo:alwaysbespoke/ab-infra:*',
                },
              }),
            }),
          ]),
        }),
      });
    });

    it('caps the session at 1 hour', () => {
      template.hasResourceProperties('AWS::IAM::Role', {
        RoleName: 'ab-infra-ci-read',
        MaxSessionDuration: 3600,
      });
    });
  });

  describe('CI read role permissions', () => {
    it('attaches AWS-managed ReadOnlyAccess', () => {
      template.hasResourceProperties('AWS::IAM::Role', {
        RoleName: 'ab-infra-ci-read',
        ManagedPolicyArns: [
          Match.objectLike({
            'Fn::Join': Match.arrayWith([
              Match.arrayWith([Match.stringLikeRegexp('ReadOnlyAccess')]),
            ]),
          }),
        ],
      });
    });
  });

  describe('outputs', () => {
    it('exports the provider ARN and role ARN', () => {
      template.hasOutput('OidcProviderArn', { Export: Match.anyValue() });
      template.hasOutput('CiReadRoleArn', { Export: Match.anyValue() });
    });
  });
});
