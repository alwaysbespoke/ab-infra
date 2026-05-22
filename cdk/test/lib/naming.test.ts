// Tests for the naming helpers.

import { loadEnvironment } from '../../config/environments';
import { regionShortFor, resourceName } from '../../lib/naming';

describe('regionShortFor', () => {
  it.each([
    ['us-east-1', 'use1'],
    ['us-west-2', 'usw2'],
    ['eu-west-1', 'euw1'],
  ])('returns "%s" for known region "%s"', (region, expected) => {
    expect(regionShortFor(region)).toBe(expected);
  });

  it('throws with a helpful message for an unknown region', () => {
    expect(() => regionShortFor('mars-west-1')).toThrow(/Unknown AWS region/);
  });
});

describe('resourceName', () => {
  it('builds the base name for shared/us-east-1', () => {
    const cfg = loadEnvironment('shared', 'us-east-1');
    expect(resourceName(cfg)).toBe('ab-shared-use1');
  });

  it('appends a purpose suffix', () => {
    const cfg = loadEnvironment('shared', 'us-east-1');
    expect(resourceName(cfg, 'external-dns-yotta')).toBe(
      'ab-shared-use1-external-dns-yotta',
    );
  });
});

describe('config + naming agree on region-short', () => {
  it('shared/us-east-1', () => {
    const cfg = loadEnvironment('shared', 'us-east-1');
    expect(cfg.regionShort).toBe(regionShortFor(cfg.region));
  });
});
