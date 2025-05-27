import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { setInterval, clearInterval } from 'timers';
import type { config } from '@tsc-run/core';
import { toPascalCase, generateStackName } from './utils.js';

export interface DomainInfo {
  name: string;
  type: string;
  setupInstructions?: string;
  nameServers?: string[];
  cnameTarget?: string;
}

export interface DeploymentResult {
  url: string;
  apiGatewayUrl: string | null;
  customDomainUrl: string | null;
  provider: string;
  domain?: DomainInfo;
}

function extractApiGatewayUrl(
  result: string,
  projectName: string,
  environment: string
): string | null {
  // Pattern 1: Standard stack output format
  const appStackName = generateStackName(projectName, environment, 'App');
  const apiOutputPattern = `${toPascalCase(projectName)}${toPascalCase(environment)}RestAPIEndpoint[A-Z0-9]+`;
  let apiGatewayOutputs = result.match(
    new RegExp(`${appStackName}\\.${apiOutputPattern} = (https://[^\\s]+)`)
  );

  if (!apiGatewayOutputs) {
    // Pattern 2: Generic RestApi endpoint pattern
    apiGatewayOutputs = result.match(
      /RestAPI.*Endpoint.*? = (https:\/\/[^\s]+)/
    );
  }

  if (!apiGatewayOutputs) {
    // Pattern 3: Any https URL that looks like API Gateway
    apiGatewayOutputs = result.match(
      /(https:\/\/[a-z0-9]+\.execute-api\.[a-z0-9-]+\.amazonaws\.com[^\s]*)/
    );
  }

  return apiGatewayOutputs ? apiGatewayOutputs[1] : null;
}

function extractCustomDomainUrl(
  result: string,
  config: config.Config,
  projectName: string,
  environment: string
): string | null {
  if (!config.domain) {
    return null;
  }

  const domainStackName = generateStackName(projectName, environment, 'Domain');
  const customDomainPattern = `${domainStackName}\\.CustomDomainUrl = (https:\\/\\/[^\\s]+)`;
  let domainOutputs = result.match(new RegExp(customDomainPattern));

  if (!domainOutputs) {
    // Fallback: try to find the custom domain directly
    domainOutputs = result.match(
      new RegExp(`CustomDomainUrl = (https:\\/\\/[^\\s]+)`)
    );
  }

  // Return actual CDK output if found, otherwise construct URL from config
  if (domainOutputs) {
    return domainOutputs[1];
  }

  // Fallback: construct URL from config if domain name is available
  return config.domain.name ? `https://${config.domain.name}` : null;
}

function addDomainInfo(
  deploymentResult: DeploymentResult,
  result: string,
  config: config.Config,
  projectName: string,
  environment: string
): void {
  if (!config.domain) {
    return;
  }

  deploymentResult.domain = {
    name: config.domain.name,
    type: config.domain.type,
  };

  const domainStackName = generateStackName(projectName, environment, 'Domain');

  // Add setup instructions for subdomain delegation
  if (config.domain.type === 'subdomain') {
    const nsPattern = `${domainStackName}\\.SubdomainNameServers = ([^\\s]+)`;
    const nsOutputs = result.match(new RegExp(nsPattern));
    if (nsOutputs) {
      deploymentResult.domain.nameServers = nsOutputs[1].split(',');
      deploymentResult.domain.setupInstructions = `Add these NS records for ${config.domain.name} in your parent domain's DNS`;
    }
  }

  // Add external DNS setup instructions
  if (config.domain.type === 'external') {
    const cnamePattern = `${domainStackName}\\.CNAMETarget = ([^\\s]+)`;
    const cnameOutputs = result.match(new RegExp(cnamePattern));
    if (cnameOutputs) {
      deploymentResult.domain.cnameTarget = cnameOutputs[1];
      deploymentResult.domain.setupInstructions = `Create a CNAME record for ${config.domain.name} pointing to ${cnameOutputs[1]}`;
    }
  }
}

export async function deployToAws(config: config.Config) {
  try {
    // Run CDK bootstrap if needed
    await runCdkCommand(['bootstrap']);

    // Deploy the stack
    const result = await runCdkCommand([
      'deploy',
      '--require-approval',
      'never',
      '--all',
    ]);

    const projectName = config.projectName;
    const environment = config.environment;

    // Extract URLs from CDK output
    const apiGatewayUrl = extractApiGatewayUrl(
      result,
      projectName,
      environment
    );
    const customDomainUrl = extractCustomDomainUrl(
      result,
      config,
      projectName,
      environment
    );

    // Primary URL (custom domain if available, otherwise API Gateway)
    const primaryUrl = customDomainUrl || apiGatewayUrl || 'URL not found';

    const deploymentResult: DeploymentResult = {
      url: primaryUrl,
      apiGatewayUrl,
      customDomainUrl,
      provider: 'aws',
    };

    // Add domain-specific information if domain is configured
    addDomainInfo(deploymentResult, result, config, projectName, environment);

    return deploymentResult;
  } catch (error) {
    console.error('CDK deployment failed:', error);
    throw error;
  }
}

async function runCdkCommand(
  args: string[],
  showProgress: boolean = true
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Get the path to the adapter's built CDK app
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const adapterDir = join(__dirname, '..');
    const cdkApp = join(adapterDir, 'dist/app.js');

    // Add --app parameter to specify the CDK app location
    const cdkArgs = ['cdk', '--app', `node ${cdkApp}`, ...args];

    const child = spawn('npx', cdkArgs, {
      stdio: ['inherit', 'pipe', 'pipe'],
      cwd: process.cwd(),
    });

    let stdout = '';
    let stderr = '';
    let loadingInterval: ReturnType<typeof setInterval> | null = null;

    // Show loading indicator if enabled
    if (showProgress) {
      const loadingChars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
      let loadingIndex = 0;
      const operationName = args.includes('bootstrap')
        ? 'Bootstrapping CDK'
        : 'Deploying infrastructure';

      loadingInterval = setInterval(() => {
        process.stdout.write(
          `\r${loadingChars[loadingIndex]} ${operationName}...`
        );
        loadingIndex = (loadingIndex + 1) % loadingChars.length;
      }, 80);
    }

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
      // Don't write to stdout when showing progress indicator
      if (!showProgress) {
        process.stdout.write(data);
      }
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
      // Don't write to stderr when showing progress indicator
      if (!showProgress) {
        process.stderr.write(data);
      }
    });

    child.on('close', (code) => {
      // Clear loading indicator
      if (loadingInterval) {
        clearInterval(loadingInterval);
        const operationName = args.includes('bootstrap')
          ? 'Bootstrap'
          : 'Deploy';
        if (code === 0) {
          process.stdout.write(
            `\r✅ ${operationName} completed successfully\n`
          );
        } else {
          process.stdout.write(`\r❌ ${operationName} failed\n`);
        }
      }

      if (code === 0) {
        resolve(stdout);
      } else {
        // Show error output when deployment fails
        if (stderr.trim()) {
          console.error('\n📋 Error details:');
          console.error(stderr);
        }
        reject(new Error(`CDK command failed with code ${code}: ${stderr}`));
      }
    });
  });
}
