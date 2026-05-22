// Shared tagging helper.
//
// `applyStandardTags(app, config)` is called once at the App level
// in bin/ab-infra.ts. CDK propagates `Tags.of(scope)` to all nested
// constructs, so every taggable AWS resource in any stack inherits
// the standard tag set automatically.
//
// Differences from yotta-infra's tagging:
//   - `Environment` is hard-coded `shared` (this account is
//     parent-org, not dev/stage/prod).
//   - `Application` is `alwaysbespoke-shared` (not a single product).

import * as cdk from 'aws-cdk-lib';
import { IConstruct } from 'constructs';

import { EnvironmentConfig } from '../config/environments';

export const STANDARD_TAG_KEYS = [
  'Environment',
  'Application',
  'Team',
  'CostCenter',
  'ManagedBy',
  'Region',
] as const;

export type StandardTagKey = (typeof STANDARD_TAG_KEYS)[number];

export function applyStandardTags(scope: IConstruct, config: EnvironmentConfig): void {
  const tags = cdk.Tags.of(scope);
  tags.add('Environment', config.env);
  tags.add('Application', 'alwaysbespoke-shared');
  tags.add('Team', 'platform-engineering');
  tags.add('CostCenter', 'engineering');
  tags.add('ManagedBy', 'cdk');
  tags.add('Region', config.region);
}
