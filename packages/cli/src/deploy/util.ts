import { log } from '../cli-ui.js';

interface DeploymentConfig {
  provider?: string;
}

interface DomainInfo {
  name: string;
  type: string;
  setupInstructions?: string;
  nameServers?: string[];
  cnameTarget?: string;
}

interface DeploymentResult {
  url?: string;
  apiGatewayUrl?: string | null;
  customDomainUrl?: string | null;
  provider: string;
  domain?: DomainInfo;
}

export function validateDeployment(config: DeploymentConfig) {
  if (!config.provider) {
    throw new Error('Provider is required for deployment');
  }
}

export function formatDeploymentOutput(result: DeploymentResult): void {
  console.log();
  log.success('🚀 Deployment Successful!');
  console.log();

  // API URLs
  if (result.customDomainUrl) {
    log.info(`📡 Custom Domain: ${result.customDomainUrl}`);
    if (result.apiGatewayUrl) {
      console.log(`🔗 API Gateway: ${result.apiGatewayUrl}`);
    }
  } else if (result.apiGatewayUrl) {
    log.info(`📡 API URL: ${result.apiGatewayUrl}`);
  } else {
    const displayUrl =
      result.url === 'URL not found'
        ? 'Check CloudFormation outputs for API Gateway URL'
        : result.url;
    log.info(`📡 API URL: ${displayUrl}`);
  }
  console.log(`🔧 Provider: ${result.provider.toUpperCase()}`);

  // Domain configuration info
  if (result.domain) {
    console.log();
    log.heading('🌐 Domain Configuration');
    console.log(`   Domain: https://${result.domain.name}`);
    console.log(`   Type: ${result.domain.type}`);

    // DNS Setup Instructions
    if (result.domain.setupInstructions) {
      console.log();
      log.warn('⚙️ Setup Required:');

      // Certificate validation notice for subdomains
      if (result.domain.type === 'subdomain') {
        console.log();
        console.log('   📧 Certificate Validation:');
        console.log(
          '   Check your email for AWS certificate validation messages'
        );
        log.warn('   💡 Validate the certificate first, then set up DNS');
      }

      console.log();
      console.log('   🌐 DNS Configuration:');
      console.log(`   ${result.domain.setupInstructions}`);

      if (result.domain.nameServers) {
        console.log();
        console.log('   Name Servers to add:');
        result.domain.nameServers.forEach((ns: string, index: number) => {
          console.log(`   ${index + 1}. ${ns.trim()}`);
        });
        console.log();
        log.warn(
          '   💡 Add these NS records to your parent domain after validating certificate'
        );
      }

      if (result.domain.cnameTarget) {
        console.log();
        console.log(`   CNAME Target: ${result.domain.cnameTarget}`);
        log.warn(
          '   💡 Create this CNAME record in your external DNS provider'
        );
      }
    }
  }

  console.log();
  log.success('✨ Your API is ready!');
  console.log();
}
