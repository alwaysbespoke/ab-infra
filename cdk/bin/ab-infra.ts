#!/usr/bin/env node
// Entry point for the ab-infra CDK app.
//
// Tiny on purpose: read --context, look up config, apply standard
// tags at the App level, instantiate stacks. Stack composition
// lives under lib/.

import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';

import {
  loadEnvironment,
  readContextEnvAndRegion,
} from '../config/environments';
import { CiOidcStack } from '../lib/ci-oidc-stack';
import { CrossAccountDnsStack } from '../lib/cross-account-dns-stack';
import { applyStandardTags } from '../lib/tagging';

const app = new cdk.App();

const { env, region } = readContextEnvAndRegion(app.node);
const config = loadEnvironment(env, region);

applyStandardTags(app, config);

// Stack naming: `Ab-<Env>-<RegionShort>-<Purpose>`. Resource Name
// tags follow the kebab-case `ab-<env>-<short>[-<purpose>]`
// convention from lib/naming.ts.
const envTitle = config.env.charAt(0).toUpperCase() + config.env.slice(1);
const regionTitle =
  config.regionShort.charAt(0).toUpperCase() + config.regionShort.slice(1);
const stackBase = `Ab-${envTitle}-${regionTitle}`;

new CiOidcStack(app, `${stackBase}-CiOidc`, {
  env: { account: config.account, region: config.region },
  githubOrg: config.githubOrg,
  githubRepo: config.githubRepo,
  description: `GitHub Actions OIDC provider + CI read role for ${config.githubOrg}/${config.githubRepo}.`,
});

new CrossAccountDnsStack(app, `${stackBase}-CrossAccountDns`, {
  env: { account: config.account, region: config.region },
  config,
  description: `Cross-account IAM roles allowing child-brand clusters to write records in zones hosted in this account.`,
});

app.synth();
