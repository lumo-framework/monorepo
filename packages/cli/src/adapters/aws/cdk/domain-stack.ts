import { Stack, StackProps, CfnOutput, Fn } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HostedZone, ARecord, RecordTarget } from 'aws-cdk-lib/aws-route53';
import {
  Certificate,
  CertificateValidation,
} from 'aws-cdk-lib/aws-certificatemanager';
import { DomainName, RestApi } from 'aws-cdk-lib/aws-apigateway';
import { ApiGatewayDomain } from 'aws-cdk-lib/aws-route53-targets';

import type { config } from '@lumo-framework/core';

interface DomainStackProps extends StackProps {
  config: config.Config;
  api: RestApi;
}

export interface DomainStackExports {
  domainName?: string;
  hostedZoneId?: string;
  certificateArn?: string;
  customDomainUrl?: string;
}

export class DomainStack extends Stack {
  public readonly exports: DomainStackExports = {};

  constructor(scope: Construct, id: string, props: DomainStackProps) {
    super(scope, id, props);

    const domainName = props.config.domainName;
    if (!domainName) {
      return;
    }

    // Validate domain name
    this.validateDomainName(domainName);

    // Create hosted zone for the domain
    const hostedZone = new HostedZone(this, 'HostedZone', {
      zoneName: domainName,
    });
    this.exports.hostedZoneId = hostedZone.hostedZoneId;

    // Output hosted zone information
    new CfnOutput(this, 'HostedZoneOutput', {
      value: hostedZone.hostedZoneId,
      description: `Hosted Zone ID for ${domainName}`,
      exportName: `${props.config.projectName}-${props.config.environment}-hosted-zone-id`,
    });

    new CfnOutput(this, 'HostedZoneNameServers', {
      value: hostedZone.hostedZoneNameServers
        ? Fn.join(',', hostedZone.hostedZoneNameServers)
        : '',
      description: `Name servers for ${domainName} - Update these at your domain registrar`,
      exportName: `${props.config.projectName}-${props.config.environment}-hosted-zone-ns`,
    });

    // Create SSL certificate with automatic DNS validation
    const certificate = new Certificate(this, 'Certificate', {
      domainName,
      validation: CertificateValidation.fromDns(hostedZone),
    });
    this.exports.certificateArn = certificate.certificateArn;

    // Create API Gateway custom domain
    const customDomain = new DomainName(this, 'CustomDomain', {
      domainName,
      certificate: certificate,
      mapping: props.api,
    });

    // Create A record pointing to the custom domain
    new ARecord(this, 'AliasRecord', {
      zone: hostedZone,
      recordName: domainName,
      target: RecordTarget.fromAlias(new ApiGatewayDomain(customDomain)),
    });

    this.exports.domainName = domainName;
    this.exports.customDomainUrl = `https://${domainName}`;

    // Output the custom domain URL
    new CfnOutput(this, 'CustomDomainUrl', {
      value: this.exports.customDomainUrl,
      description: `Custom domain URL for the API`,
      exportName: `${props.config.projectName}-${props.config.environment}-custom-domain-url`,
    });

    new CfnOutput(this, 'CertificateArn', {
      value: certificate.certificateArn,
      description: `SSL Certificate ARN`,
      exportName: `${props.config.projectName}-${props.config.environment}-certificate-arn`,
    });
  }

  private validateDomainName(domainName: string): void {
    // Validate domain name format
    if (!domainName || typeof domainName !== 'string') {
      throw new Error('Domain name is required and must be a string');
    }

    // Basic domain name validation
    const domainRegex =
      /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    if (!domainRegex.test(domainName)) {
      throw new Error(`Invalid domain name format: ${domainName}`);
    }

    // Validate domain length
    if (domainName.length > 253) {
      throw new Error(
        `Domain name too long: ${domainName} (max 253 characters)`
      );
    }
  }
}
