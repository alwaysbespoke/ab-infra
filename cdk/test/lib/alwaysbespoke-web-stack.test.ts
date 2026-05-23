// Structural tests for AlwaysBespokeWebStack.

import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';

import { loadEnvironment } from '../../config/environments';
import { AlwaysBespokeWebStack } from '../../lib/alwaysbespoke-web-stack';
import { applyStandardTags } from '../../lib/tagging';

function buildStack(): Template {
  const app = new cdk.App();
  const cfg = loadEnvironment('shared', 'us-east-1');
  applyStandardTags(app, cfg);

  const stack = new AlwaysBespokeWebStack(app, 'TestWeb', {
    env: { account: cfg.account, region: cfg.region },
    config: cfg,
  });

  return Template.fromStack(stack);
}

describe('AlwaysBespokeWebStack', () => {
  const template = buildStack();

  test('S3 bucket blocks all public access', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  test('S3 bucket has versioning enabled', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      VersioningConfiguration: {
        Status: 'Enabled',
      },
    });
  });

  test('CloudFront distribution exists with correct domain names', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        Aliases: Match.arrayWith(['alwaysbespoke.com', 'www.alwaysbespoke.com']),
        DefaultRootObject: 'index.html',
      }),
    });
  });

  test('CloudFront distribution uses HTTPS redirect', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        DefaultCacheBehavior: Match.objectLike({
          ViewerProtocolPolicy: 'redirect-to-https',
        }),
      }),
    });
  });

  test('CloudFront Function exists for URL rewrites', () => {
    template.hasResourceProperties('AWS::CloudFront::Function', {
      AutoPublish: true,
      FunctionConfig: Match.objectLike({
        Runtime: 'cloudfront-js-2.0',
      }),
    });
  });

  test('ACM certificate covers apex and wildcard', () => {
    template.hasResourceProperties('AWS::CertificateManager::Certificate', {
      DomainName: 'alwaysbespoke.com',
      SubjectAlternativeNames: Match.arrayWith(['*.alwaysbespoke.com']),
    });
  });

  test('Route 53 A record exists for apex', () => {
    template.hasResourceProperties('AWS::Route53::RecordSet', {
      Type: 'A',
      Name: 'alwaysbespoke.com.',
    });
  });

  test('exports bucket name and distribution ID', () => {
    template.hasOutput('WebBucketName', {
      Export: { Name: 'ab-shared-use1-web-bucket-name' },
    });
    template.hasOutput('WebDistributionId', {
      Export: { Name: 'ab-shared-use1-web-distribution-id' },
    });
  });
});
