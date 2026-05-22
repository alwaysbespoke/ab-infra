// Resource naming helpers — `ab-<env>-<region-short>[-<purpose>]`.
//
// Differs from yotta-infra only in the prefix (`ab` vs `yotta`).
// The region-short map is identical; consider extracting to a shared
// npm package if a third sibling repo adopts it.

import { EnvironmentConfig } from '../config/environments';

const REGION_SHORT_MAP: Readonly<Record<string, string>> = {
  'us-east-1': 'use1',
  'us-east-2': 'use2',
  'us-west-1': 'usw1',
  'us-west-2': 'usw2',
  'eu-west-1': 'euw1',
  'eu-west-2': 'euw2',
  'eu-west-3': 'euw3',
  'eu-central-1': 'euc1',
  'eu-north-1': 'eun1',
  'ap-northeast-1': 'apne1',
  'ap-northeast-2': 'apne2',
  'ap-southeast-1': 'apse1',
  'ap-southeast-2': 'apse2',
  'ap-south-1': 'aps1',
};

export function regionShortFor(region: string): string {
  const short = REGION_SHORT_MAP[region];
  if (!short) {
    const known = Object.keys(REGION_SHORT_MAP).sort().join(', ');
    throw new Error(
      `Unknown AWS region "${region}". Add it to REGION_SHORT_MAP in cdk/lib/naming.ts. ` +
        `Known regions: ${known}.`,
    );
  }
  return short;
}

export function resourceName(cfg: EnvironmentConfig, purpose?: string): string {
  const base = `ab-${cfg.env}-${cfg.regionShort}`;
  return purpose ? `${base}-${purpose}` : base;
}
