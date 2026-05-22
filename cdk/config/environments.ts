// Single source of truth for per-(env, region) configuration in
// the alwaysbespoke parent-org account.
//
// Today there is exactly one populated context: `shared/us-east-1`,
// the only AWS account this repo deploys to. Stay parameterized
// anyway — the muscle memory of "look it up via config" is what
// keeps us from hard-coding account IDs in stack code.

/** Environments this repo supports. `shared` = the parent-org account. */
export type EnvName = 'shared';

/**
 * A consumer brand cluster that may assume cross-account roles
 * here. Today we have one (yotta). Add a new entry when a new
 * brand's cluster needs to write DNS records / read shared assets.
 */
export interface ConsumerPrincipal {
  /** Short name used in resource names and outputs. */
  readonly name: string;
  /** The IAM role ARN in the consumer's AWS account that trusts will allow. */
  readonly principalArn: string;
  /**
   * Route 53 zones in THIS account that the consumer is allowed to
   * write. Each entry produces an entry in the cross-account role's
   * inline policy.
   */
  readonly allowedZones: ReadonlyArray<{
    readonly name: string;
    readonly id: string;
  }>;
}

export interface EnvironmentConfig {
  readonly env: EnvName;
  /** Full AWS region (most resources here are global; this anchors the stack). */
  readonly region: string;
  /** Short region code used in resource names. */
  readonly regionShort: string;
  /** 12-digit AWS account ID. */
  readonly account: string;
  /** GitHub org/repo this CDK lives in — used for OIDC trust. */
  readonly githubOrg: string;
  readonly githubRepo: string;
  /** Cross-account DNS consumers (child brand clusters). */
  readonly dnsConsumers: ReadonlyArray<ConsumerPrincipal>;
}

const CONFIGS: Readonly<Record<string, EnvironmentConfig>> = {
  'shared/us-east-1': {
    env: 'shared',
    region: 'us-east-1',
    regionShort: 'use1',
    account: '768507067298',
    githubOrg: 'alwaysbespoke',
    githubRepo: 'ab-infra',
    dnsConsumers: [
      {
        // Yotta cluster (account 461780750330). The principalArn
        // below points at the IRSA role that yotta-infra will
        // create for external-dns. The role does not need to exist
        // yet — IAM trust policies tolerate non-existent
        // principals; the trust activates once the role is created.
        name: 'yotta',
        principalArn:
          'arn:aws:iam::461780750330:role/yotta-prod-use1-external-dns',
        allowedZones: [
          { name: 'yotta.bot', id: 'Z065929010FUKCSLSAW7P' },
        ],
      },
    ],
  },
};

export function loadEnvironment(env: string, region: string): EnvironmentConfig {
  const key = `${env}/${region}`;
  const cfg = CONFIGS[key];
  if (!cfg) {
    const available = Object.keys(CONFIGS).sort().join(', ');
    throw new Error(
      `Unknown environment/region pair "${key}". ` +
        `Known pairs: ${available}. ` +
        `Add a new entry in cdk/config/environments.ts to support a new pair.`,
    );
  }
  return cfg;
}

/**
 * Read the required `env` and `region` context values from a CDK
 * App. Both are mandatory — no defaults. An accidental `cdk synth`
 * (no flags) fails fast with guidance.
 */
export function readContextEnvAndRegion(node: {
  tryGetContext: (k: string) => unknown;
}): { env: string; region: string } {
  const env = node.tryGetContext('env');
  const region = node.tryGetContext('region');
  if (typeof env !== 'string' || typeof region !== 'string' || !env || !region) {
    throw new Error(
      'Both --context env=<shared> and --context region=<aws-region> are required. ' +
        'Example: npx cdk synth --context env=shared --context region=us-east-1',
    );
  }
  return { env, region };
}
