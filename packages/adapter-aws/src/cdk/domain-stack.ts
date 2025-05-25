import { Stack, StackProps, CfnOutput, Fn } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  HostedZone,
  IHostedZone,
  RecordType,
  ARecord,
  RecordTarget,
} from 'aws-cdk-lib/aws-route53';
import {
  Certificate,
  CertificateValidation,
  ICertificate,
} from 'aws-cdk-lib/aws-certificatemanager';
import { DomainName, RestApi } from 'aws-cdk-lib/aws-apigateway';
import { ApiGatewayDomain } from 'aws-cdk-lib/aws-route53-targets';

interface DomainStackProps extends StackProps {
  config: any;
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

    const domainConfig = props.config.domain;
    if (!domainConfig) {
      return;
    }

    // Validate domain configuration
    this.validateDomainConfig(domainConfig);

    const { name: domainName, type: domainType } = domainConfig;

    let hostedZone: IHostedZone;
    let certificate: ICertificate;

    // Handle different domain types
    if (domainType === 'hosted-zone') {
      // Create a new hosted zone for the entire domain
      hostedZone = new HostedZone(this, 'HostedZone', {
        zoneName: domainName,
      });
      this.exports.hostedZoneId = hostedZone.hostedZoneId;

      new CfnOutput(this, 'HostedZoneOutput', {
        value: hostedZone.hostedZoneId,
        description: `Hosted Zone ID for ${domainName}`,
        exportName: `${props.config.projectName}-${props.config.environment}-hosted-zone-id`,
      });
    } else if (domainType === 'subdomain') {
      // Create a hosted zone for the subdomain
      hostedZone = new HostedZone(this, 'SubdomainHostedZone', {
        zoneName: domainName,
      });
      this.exports.hostedZoneId = hostedZone.hostedZoneId;

      new CfnOutput(this, 'SubdomainHostedZoneOutput', {
        value: hostedZone.hostedZoneId,
        description: `Subdomain Hosted Zone ID for ${domainName}`,
        exportName: `${props.config.projectName}-${props.config.environment}-subdomain-hosted-zone-id`,
      });

      new CfnOutput(this, 'SubdomainNameServers', {
        value: hostedZone.hostedZoneNameServers
          ? Fn.join(',', hostedZone.hostedZoneNameServers)
          : '',
        description: `Name servers for ${domainName} - Add these NS records to your parent domain`,
        exportName: `${props.config.projectName}-${props.config.environment}-subdomain-ns`,
      });
    } else if (domainType === 'external') {
      // For external DNS, we don't create a hosted zone
      // User manages DNS externally, we just need the certificate
      hostedZone = HostedZone.fromLookup(this, 'ExternalHostedZone', {
        domainName: this.getParentDomain(domainName),
      });
    }

    // Handle certificate creation or import
    if (
      'create' in domainConfig.certificate &&
      domainConfig.certificate.create
    ) {
      // Create a new ACM certificate using DNS validation
      certificate = new Certificate(this, 'Certificate', {
        domainName,
        validation:
          domainType === 'external'
            ? CertificateValidation.fromDns() // DNS validation for external DNS
            : CertificateValidation.fromDns(hostedZone!), // DNS validation for managed hosted zones
      });
      this.exports.certificateArn = certificate.certificateArn;
    } else if ('arn' in domainConfig.certificate) {
      // Import existing certificate
      certificate = Certificate.fromCertificateArn(
        this,
        'ImportedCertificate',
        domainConfig.certificate.arn
      );
      this.exports.certificateArn = domainConfig.certificate.arn;
    }

    // Create API Gateway custom domain
    const customDomain = new DomainName(this, 'CustomDomain', {
      domainName,
      certificate: certificate!,
      mapping: props.api,
    });

    // Create A record pointing to the custom domain (only if we manage the hosted zone)
    if (domainType !== 'external' && hostedZone!) {
      new ARecord(this, 'AliasRecord', {
        zone: hostedZone,
        recordName: domainName,
        target: RecordTarget.fromAlias(new ApiGatewayDomain(customDomain)),
      });
    }

    this.exports.domainName = domainName;
    this.exports.customDomainUrl = `https://${domainName}`;

    // Output the custom domain URL
    new CfnOutput(this, 'CustomDomainUrl', {
      value: this.exports.customDomainUrl,
      description: `Custom domain URL for the API`,
      exportName: `${props.config.projectName}-${props.config.environment}-custom-domain-url`,
    });

    new CfnOutput(this, 'CertificateArn', {
      value: certificate!.certificateArn,
      description: `SSL Certificate ARN`,
      exportName: `${props.config.projectName}-${props.config.environment}-certificate-arn`,
    });

    // For external DNS, output the CNAME target
    if (domainType === 'external') {
      new CfnOutput(this, 'CNAMETarget', {
        value: customDomain.domainNameAliasDomainName,
        description: `CNAME target for ${domainName} - Configure this in your external DNS`,
        exportName: `${props.config.projectName}-${props.config.environment}-cname-target`,
      });
    }
  }

  private validateDomainConfig(domainConfig: any): void {
    const { name: domainName, type: domainType, certificate } = domainConfig;

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

    // Validate domain type
    const validTypes = ['subdomain', 'hosted-zone', 'external'];
    if (!validTypes.includes(domainType)) {
      throw new Error(
        `Invalid domain type: ${domainType}. Must be one of: ${validTypes.join(', ')}`
      );
    }

    // Validate certificate configuration
    if (certificate) {
      if ('create' in certificate && 'arn' in certificate) {
        throw new Error(
          'Certificate configuration cannot have both "create" and "arn" properties'
        );
      }

      if (
        'arn' in certificate &&
        (!certificate.arn || typeof certificate.arn !== 'string')
      ) {
        throw new Error('Certificate ARN must be a non-empty string');
      }

      if ('arn' in certificate && !certificate.arn.startsWith('arn:aws:acm:')) {
        throw new Error('Certificate ARN must be a valid ACM certificate ARN');
      }
    }

    // Warn about subdomain vs hosted-zone choice
    const parts = domainName.split('.');
    if (domainType === 'hosted-zone' && parts.length > 2) {
      console.warn(
        `Warning: Using hosted-zone type for subdomain ${domainName}. Consider using type: 'subdomain' for better isolation.`
      );
    }

    if (domainType === 'subdomain' && parts.length <= 2) {
      console.warn(
        `Warning: Using subdomain type for root domain ${domainName}. Consider using type: 'hosted-zone' to manage the entire domain.`
      );
    }
  }

  private getParentDomain(domain: string): string {
    const parts = domain.split('.');
    if (parts.length <= 2) {
      return domain; // Already a root domain
    }
    return parts.slice(1).join('.'); // Remove subdomain part
  }
}
