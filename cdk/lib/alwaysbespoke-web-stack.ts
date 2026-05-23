// Static-site infrastructure for alwaysbespoke.com.
//
// Provisions: S3 bucket (private, OAC-only), CloudFront distribution
// with OAC, a viewer-request CloudFront Function for clean-URL
// rewrites, ACM certificate (DNS-validated via Route 53), and
// Route 53 A/AAAA alias records for the apex domain. A separate
// S3 redirect bucket handles www → apex.
//
// The existing alwaysbespoke.com hosted zone (Z3NYF2RN71Y9A1) and
// ACM cert (27a15cb9-…) were created manually. This stack imports
// the hosted zone by ID and creates a NEW certificate so CDK fully
// owns the cert lifecycle (the old cert can be deleted once this
// stack is live). The old S3 bucket + CloudFront distributions are
// replaced, not imported — see the cross-repo plan for the cutover
// sequence.

import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

import { EnvironmentConfig } from '../config/environments';
import { resourceName } from './naming';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AlwaysBespokeWebStackProps extends cdk.StackProps {
  readonly config: EnvironmentConfig;
}

// ---------------------------------------------------------------------------
// CloudFront Function — clean-URL rewrites
// ---------------------------------------------------------------------------

const CF_REWRITE_FUNCTION_CODE = `
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // /case-study (no extension) → /case-study.html
  if (uri === '/case-study') {
    request.uri = '/case-study.html';
  }

  // Trailing-slash → index.html (except root)
  if (uri.endsWith('/') && uri !== '/') {
    request.uri = uri + 'index.html';
  }

  return request;
}
`;

// ---------------------------------------------------------------------------
// Stack
// ---------------------------------------------------------------------------

export class AlwaysBespokeWebStack extends cdk.Stack {
  public readonly bucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: AlwaysBespokeWebStackProps) {
    super(scope, id, props);

    const { config } = props;
    const domainName = 'alwaysbespoke.com';
    const wwwDomain = `www.${domainName}`;

    // ----- Hosted zone (existing, imported by ID) -----
    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', {
      hostedZoneId: 'Z3NYF2RN71Y9A1',
      zoneName: domainName,
    });

    // ----- ACM certificate (new, DNS-validated) -----
    // Covers apex + wildcard. CDK auto-creates the validation
    // CNAME records in the zone above.
    const certificate = new acm.Certificate(this, 'Cert', {
      domainName,
      subjectAlternativeNames: [`*.${domainName}`],
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // ----- S3 origin bucket -----
    const bucketName = resourceName(config, 'web-alwaysbespoke');
    this.bucket = new s3.Bucket(this, 'WebBucket', {
      bucketName,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });

    // ----- CloudFront Function -----
    const rewriteFunction = new cloudfront.Function(this, 'RewriteFn', {
      functionName: resourceName(config, 'web-rewrite'),
      code: cloudfront.FunctionCode.fromInline(CF_REWRITE_FUNCTION_CODE),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      comment: 'Clean-URL rewrite: /case-study → /case-study.html',
    });

    // ----- CloudFront distribution -----
    this.distribution = new cloudfront.Distribution(this, 'Cdn', {
      comment: `${domainName} static site`,
      domainNames: [domainName, wwwDomain],
      certificate,
      defaultRootObject: 'index.html',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        functionAssociations: [
          {
            function: rewriteFunction,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      // SPA-style fallback: 403/404 → /index.html with 200 so
      // direct-nav to clean URLs works even if the rewrite function
      // misses an edge case.
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
      ],
    });

    // ----- Route 53 alias records (apex) -----
    const target = new route53Targets.CloudFrontTarget(this.distribution);

    new route53.ARecord(this, 'ApexA', {
      zone: hostedZone,
      target: route53.RecordTarget.fromAlias(target),
      comment: 'alwaysbespoke.com → CloudFront',
    });

    new route53.AaaaRecord(this, 'ApexAaaa', {
      zone: hostedZone,
      target: route53.RecordTarget.fromAlias(target),
      comment: 'alwaysbespoke.com (IPv6) → CloudFront',
    });

    // www CNAME → apex (CloudFront handles both domains via SANs)
    new route53.CnameRecord(this, 'WwwCname', {
      zone: hostedZone,
      recordName: 'www',
      domainName,
      comment: 'www.alwaysbespoke.com → alwaysbespoke.com',
    });

    // ----- CloudFormation exports -----
    new cdk.CfnOutput(this, 'WebBucketName', {
      value: this.bucket.bucketName,
      exportName: 'ab-shared-use1-web-bucket-name',
      description: 'S3 bucket for alwaysbespoke.com static site.',
    });

    new cdk.CfnOutput(this, 'WebDistributionId', {
      value: this.distribution.distributionId,
      exportName: 'ab-shared-use1-web-distribution-id',
      description: 'CloudFront distribution ID for alwaysbespoke.com.',
    });

    new cdk.CfnOutput(this, 'WebDistributionDomain', {
      value: this.distribution.distributionDomainName,
      description: 'CloudFront domain name (for verification before DNS cutover).',
    });
  }
}
