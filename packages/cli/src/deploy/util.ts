export function validateDeployment(config: any) {
  if (!config.provider) {
    throw new Error('Provider is required for deployment');
  }
}

export function formatDeploymentOutput(result: any): string {
  const lines: string[] = [];

  // Header
  lines.push('\n🚀 \x1b[1m\x1b[32mDeployment Successful!\x1b[0m\n');

  // API URLs
  if (result.customDomainUrl) {
    lines.push(
      `📡 \x1b[1mCustom Domain:\x1b[0m \x1b[36m${result.customDomainUrl}\x1b[0m`
    );
    if (result.apiGatewayUrl) {
      lines.push(
        `🔗 \x1b[1mAPI Gateway:\x1b[0m \x1b[90m${result.apiGatewayUrl}\x1b[0m`
      );
    }
  } else if (result.apiGatewayUrl) {
    lines.push(
      `📡 \x1b[1mAPI URL:\x1b[0m \x1b[36m${result.apiGatewayUrl}\x1b[0m`
    );
  } else {
    const displayUrl =
      result.url === 'URL not found'
        ? '\x1b[33mCheck CloudFormation outputs for API Gateway URL\x1b[0m'
        : result.url;
    lines.push(`📡 \x1b[1mAPI URL:\x1b[0m \x1b[36m${displayUrl}\x1b[0m`);
  }
  lines.push(`🔧 \x1b[1mProvider:\x1b[0m ${result.provider.toUpperCase()}`);

  // Domain configuration info
  if (result.domain) {
    lines.push('\n🌐 \x1b[1mDomain Configuration:\x1b[0m');
    lines.push(
      `   \x1b[1mDomain:\x1b[0m \x1b[36mhttps://${result.domain.name}\x1b[0m`
    );
    lines.push(`   \x1b[1mType:\x1b[0m ${result.domain.type}`);

    // DNS Setup Instructions
    if (result.domain.setupInstructions) {
      lines.push('\n⚙️  \x1b[1m\x1b[33mSetup Required:\x1b[0m');

      // Certificate validation notice for subdomains
      if (result.domain.type === 'subdomain') {
        lines.push('\n   \x1b[1m📧 Certificate Validation:\x1b[0m');
        lines.push(
          '   Check your email for AWS certificate validation messages'
        );
        lines.push(
          '   \x1b[33m💡 Validate the certificate first, then set up DNS\x1b[0m'
        );
      }

      lines.push(`\n   \x1b[1m🌐 DNS Configuration:\x1b[0m`);
      lines.push(`   ${result.domain.setupInstructions}`);

      if (result.domain.nameServers) {
        lines.push('\n   \x1b[1mName Servers to add:\x1b[0m');
        result.domain.nameServers.forEach((ns: string, index: number) => {
          lines.push(`   ${index + 1}. ${ns.trim()}`);
        });
        lines.push(
          '\n   \x1b[33m💡 Add these NS records to your parent domain after validating certificate\x1b[0m'
        );
      }

      if (result.domain.cnameTarget) {
        lines.push(
          `\n   \x1b[1mCNAME Target:\x1b[0m ${result.domain.cnameTarget}`
        );
        lines.push(
          '   \x1b[33m💡 Create this CNAME record in your external DNS provider\x1b[0m'
        );
      }
    }
  }

  lines.push('\n✨ \x1b[1mYour API is ready!\x1b[0m\n');

  return lines.join('\n');
}
