// Repo-wide tag-coverage test.
//
// Walks every stack the app would synthesize for `(env=shared,
// region=us-east-1)` and asserts that EVERY taggable resource
// carries the full standard tag set. Same pattern as yotta-infra.

import * as cdk from 'aws-cdk-lib';

import { loadEnvironment } from '../../config/environments';
import { CiOidcStack } from '../../lib/ci-oidc-stack';
import { CrossAccountDnsStack } from '../../lib/cross-account-dns-stack';
import { STANDARD_TAG_KEYS, applyStandardTags } from '../../lib/tagging';

const TAGGABLE_TYPES = new Set<string>([
  'AWS::IAM::Role',
  'AWS::IAM::OpenIDConnectProvider',
  'AWS::IAM::OIDCProvider',
  'AWS::S3::Bucket',
  'AWS::Logs::LogGroup',
  'AWS::SecretsManager::Secret',
  'AWS::DynamoDB::Table',
  'AWS::KMS::Key',
]);

const CDK_INTERNAL_LOGICAL_ID_PATTERNS: RegExp[] = [
  /^AWSCDK/,
  /CustomResourceProvider/i,
];

function isCdkInternal(logicalId: string): boolean {
  return CDK_INTERNAL_LOGICAL_ID_PATTERNS.some((re) => re.test(logicalId));
}

function extractTagKeys(tagsProperty: unknown): Set<string> {
  if (Array.isArray(tagsProperty)) {
    return new Set(tagsProperty.map((tag: { Key: string }) => tag.Key));
  }
  if (tagsProperty && typeof tagsProperty === 'object') {
    return new Set(Object.keys(tagsProperty));
  }
  return new Set();
}

function synthAllStacks(env: string, region: string): cdk.cx_api.CloudAssembly {
  const app = new cdk.App();
  const cfg = loadEnvironment(env, region);
  applyStandardTags(app, cfg);

  new CiOidcStack(app, 'Ab-Shared-Use1-CiOidc', {
    env: { account: cfg.account, region: cfg.region },
    githubOrg: cfg.githubOrg,
    githubRepo: cfg.githubRepo,
  });
  new CrossAccountDnsStack(app, 'Ab-Shared-Use1-CrossAccountDns', {
    env: { account: cfg.account, region: cfg.region },
    config: cfg,
  });

  return app.synth();
}

describe('tag coverage — shared/us-east-1', () => {
  const assembly = synthAllStacks('shared', 'us-east-1');

  for (const artifact of assembly.stacks) {
    test(`stack ${artifact.stackName}: every taggable resource carries the standard tag set`, () => {
      const resources: Record<string, { Type: string; Properties?: { Tags?: unknown } }> =
        artifact.template.Resources ?? {};
      const violations: string[] = [];

      for (const [logicalId, resource] of Object.entries(resources)) {
        if (!TAGGABLE_TYPES.has(resource.Type)) continue;
        if (isCdkInternal(logicalId)) continue;
        const tagKeys = extractTagKeys(resource.Properties?.Tags);
        const missing = STANDARD_TAG_KEYS.filter((k) => !tagKeys.has(k));
        if (missing.length > 0) {
          violations.push(`${logicalId} (${resource.Type}): missing [${missing.join(', ')}]`);
        }
      }

      expect(violations).toEqual([]);
    });
  }
});
