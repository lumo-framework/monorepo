import { log } from '@tsc-run/utils';

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
  provider: string;
  success?: boolean;
  url?: string;
  errors?: string[];
  warnings?: string[];
  domain?: DomainInfo;
}

export function validateDeployment(config: DeploymentConfig) {
  if (!config.provider) {
    throw new Error('Provider is required for deployment');
  }
}

function isDeploymentSuccessful(result: DeploymentResult): boolean {
  // Check explicit success flag first (Cloudflare)
  if (result.success !== undefined) {
    return result.success;
  }

  // For AWS or other providers, assume success if no errors
  return !result.errors || result.errors.length === 0;
}

export function formatDeploymentOutput(result: DeploymentResult): void {
  log.newline();

  // Check if deployment actually succeeded
  const deploymentSucceeded = isDeploymentSuccessful(result);

  if (deploymentSucceeded) {
    log.boxed('🚀 Deployment Successful!');
    log.newline();

    // Show API URL if available
    if (result.url) {
      log.info(`📡 API URL: ${result.url}`);
    }

    // Show domain configuration if available
    if (result.domain) {
      log.newline();
      log.heading('🌐 Domain Configuration');
      log.info(`   Domain: https://${result.domain.name}`);
      log.info(`   Type: ${result.domain.type}`);

      // DNS Setup Instructions
      if (result.domain.setupInstructions) {
        log.newline();
        log.warn('⚙️ Setup Required:');

        // Certificate validation notice for subdomains
        if (result.domain.type === 'subdomain') {
          log.newline();
          log.info('   📧 Certificate Validation:');
          log.info(
            '   Check your email for AWS certificate validation messages'
          );
          log.warn('   💡 Validate the certificate first, then set up DNS');
        }

        log.newline();
        log.info('   🌐 DNS Configuration:');
        log.info(`   ${result.domain.setupInstructions}`);

        if (result.domain.nameServers) {
          log.newline();
          log.info('   Name Servers to add:');
          result.domain.nameServers.forEach((ns: string, index: number) => {
            log.info(`   ${index + 1}. ${ns.trim()}`);
          });
          log.newline();
          log.warn(
            '   💡 Add these NS records to your parent domain after validating certificate'
          );
        }

        if (result.domain.cnameTarget) {
          log.newline();
          log.info(`   CNAME Target: ${result.domain.cnameTarget}`);
          log.warn(
            '   💡 Create this CNAME record in your external DNS provider'
          );
        }
      }
    }

    // Show warnings if any
    if (result.warnings && result.warnings.length > 0) {
      log.newline();
      log.heading('⚠️ Deployment Warnings:');
      result.warnings.forEach((warning) => {
        log.warn(`${warning}`);
      });
    }
  }

  // Don't show anything for failed deployments - the progress display already handled the error
  log.newline();
}
