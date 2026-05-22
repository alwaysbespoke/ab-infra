// Tests for the standard-tag helper. The tag set is a contract with
// FinOps + on-call tooling — these tests prevent an accidental
// rename from silently breaking downstream consumers.

import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as iam from 'aws-cdk-lib/aws-iam';

import { loadEnvironment } from '../../config/environments';
import { STANDARD_TAG_KEYS, applyStandardTags } from '../../lib/tagging';

function freshStack(): { template: () => Template } {
  const app = new cdk.App();
  const cfg = loadEnvironment('shared', 'us-east-1');
  const stack = new cdk.Stack(app, 'TestStack', {
    env: { account: cfg.account, region: cfg.region },
  });
  applyStandardTags(stack, cfg);
  // Need one taggable resource to read merged tags from the
  // synthed template. IAM Role is the most commonly used resource
  // here.
  new iam.Role(stack, 'ProbeRole', {
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  });
  return { template: () => Template.fromStack(stack) };
}

describe('applyStandardTags', () => {
  it('applies every key in STANDARD_TAG_KEYS', () => {
    const t = freshStack();
    const json = t.template().toJSON();
    const role = json.Resources.ProbeRole2A5F6F46 ?? Object.values(json.Resources).find(
      (r: any) => r.Type === 'AWS::IAM::Role',
    );
    const tagKeys = new Set<string>(
      ((role as { Properties: { Tags?: Array<{ Key: string }> } }).Properties.Tags ?? []).map(
        (tag) => tag.Key,
      ),
    );
    for (const key of STANDARD_TAG_KEYS) {
      expect(tagKeys.has(key)).toBe(true);
    }
  });

  it('sets Application=alwaysbespoke-shared (the ab-specific value)', () => {
    const t = freshStack();
    const json = t.template().toJSON();
    const role = Object.values(json.Resources).find(
      (r: any) => r.Type === 'AWS::IAM::Role',
    ) as { Properties: { Tags: Array<{ Key: string; Value: string }> } };
    const app = role.Properties.Tags.find((tag) => tag.Key === 'Application');
    expect(app?.Value).toBe('alwaysbespoke-shared');
  });

  it('sets Environment=shared and ManagedBy=cdk', () => {
    const t = freshStack();
    const json = t.template().toJSON();
    const role = Object.values(json.Resources).find(
      (r: any) => r.Type === 'AWS::IAM::Role',
    ) as { Properties: { Tags: Array<{ Key: string; Value: string }> } };
    const map: Record<string, string> = Object.fromEntries(
      role.Properties.Tags.map((tag) => [tag.Key, tag.Value]),
    );
    expect(map.Environment).toBe('shared');
    expect(map.ManagedBy).toBe('cdk');
    expect(map.Region).toBe('us-east-1');
    expect(map.Team).toBe('platform-engineering');
    expect(map.CostCenter).toBe('engineering');
  });
});
