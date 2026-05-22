// Tests for the env/region config loader.

import {
  loadEnvironment,
  readContextEnvAndRegion,
} from '../../config/environments';

describe('loadEnvironment', () => {
  it('returns the shared/us-east-1 config', () => {
    const cfg = loadEnvironment('shared', 'us-east-1');
    expect(cfg.env).toBe('shared');
    expect(cfg.region).toBe('us-east-1');
    expect(cfg.regionShort).toBe('use1');
    expect(cfg.account).toBe('768507067298');
    expect(cfg.githubOrg).toBe('alwaysbespoke');
    expect(cfg.githubRepo).toBe('ab-infra');
  });

  it('exposes the yotta cross-account DNS consumer with the right principal + zone', () => {
    const cfg = loadEnvironment('shared', 'us-east-1');
    const yotta = cfg.dnsConsumers.find((c) => c.name === 'yotta');
    expect(yotta).toBeDefined();
    expect(yotta!.principalArn).toBe(
      'arn:aws:iam::461780750330:role/yotta-prod-use1-external-dns',
    );
    expect(yotta!.allowedZones).toEqual([
      { name: 'yotta.bot', id: 'Z065929010FUKCSLSAW7P' },
    ]);
  });

  it('throws with a helpful message for an unknown env/region pair', () => {
    expect(() => loadEnvironment('shared', 'eu-west-1')).toThrow(
      /Unknown environment\/region pair "shared\/eu-west-1"/,
    );
    expect(() => loadEnvironment('prod', 'us-east-1')).toThrow(
      /Unknown environment\/region pair "prod\/us-east-1"/,
    );
  });

  it('lists the available pairs in the error message', () => {
    expect(() => loadEnvironment('shared', 'us-west-2')).toThrow(
      /Known pairs:.*shared\/us-east-1/,
    );
  });
});

describe('readContextEnvAndRegion', () => {
  function stubNode(values: Record<string, unknown>) {
    return {
      tryGetContext: (k: string): unknown => values[k],
    };
  }

  it('returns both values when present and strings', () => {
    const node = stubNode({ env: 'shared', region: 'us-east-1' });
    expect(readContextEnvAndRegion(node)).toEqual({
      env: 'shared',
      region: 'us-east-1',
    });
  });

  it('throws when either is missing or empty', () => {
    expect(() => readContextEnvAndRegion(stubNode({ region: 'us-east-1' }))).toThrow(
      /--context env/,
    );
    expect(() => readContextEnvAndRegion(stubNode({ env: 'shared' }))).toThrow(
      /--context env/,
    );
    expect(() =>
      readContextEnvAndRegion(stubNode({ env: '', region: 'us-east-1' })),
    ).toThrow();
  });
});
