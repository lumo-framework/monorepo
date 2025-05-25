import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { setInterval, clearInterval } from 'timers';
import type { config } from '@tsc-run/core';

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

export async function deployToAws(config: config.Config) {
  try {
    await runBuildCommand();

    // Generate stack name in format: <ProjectName><Env><Domain>
    function generateStackName(
      projectName: string,
      environment: string,
      domain: string
    ): string {
      const toPascalCase = (str: string) =>
        str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
      return `${toPascalCase(projectName)}${toPascalCase(environment)}${toPascalCase(domain)}Stack`;
    }

    // Run CDK bootstrap if needed
    await runCdkCommand(['bootstrap']);

    // Deploy the stack
    const result = await runCdkCommand([
      'deploy',
      '--require-approval',
      'never',
      '--all',
    ]);

    // Extract URLs from CDK output
    const toPascalCase = (str: string) =>
      str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    const projectName = config.projectName || 'MyProject';
    const environment = config.environment || 'dev';

    // Extract API Gateway URL (always available)
    // Try multiple patterns to find the API Gateway URL
    let apiGatewayUrl = null;

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

    apiGatewayUrl = apiGatewayOutputs ? apiGatewayOutputs[1] : null;

    // Try to get custom domain URL (if domain is configured)
    let customDomainUrl = null;
    if (config.domain) {
      const domainStackName = generateStackName(
        projectName,
        environment,
        'Domain'
      );
      const customDomainPattern = `${domainStackName}\\.CustomDomainUrl = (https:\\/\\/[^\\s]+)`;
      let domainOutputs = result.match(new RegExp(customDomainPattern));

      if (!domainOutputs) {
        // Fallback: try to find the custom domain directly
        domainOutputs = result.match(
          new RegExp(`CustomDomainUrl = (https:\\/\\/[^\\s]+)`)
        );
      }

      if (!domainOutputs && config.domain.name) {
        // If we have the domain name, construct the URL
        customDomainUrl = `https://${config.domain.name}`;
      } else if (domainOutputs) {
        customDomainUrl = domainOutputs[1];
      }
    }

    // Primary URL (custom domain if available, otherwise API Gateway)
    const primaryUrl = customDomainUrl || apiGatewayUrl || 'URL not found';

    const deploymentResult: DeploymentResult = {
      url: primaryUrl,
      apiGatewayUrl: apiGatewayUrl,
      customDomainUrl: customDomainUrl,
      provider: 'aws',
    };

    // Add domain-specific information if domain is configured
    if (config.domain) {
      deploymentResult.domain = {
        name: config.domain.name,
        type: config.domain.type,
      };

      // Add setup instructions for subdomain delegation
      if (config.domain.type === 'subdomain') {
        const domainStackName = generateStackName(
          projectName,
          environment,
          'Domain'
        );
        const nsPattern = `${domainStackName}\\.SubdomainNameServers = ([^\\s]+)`;
        const nsOutputs = result.match(new RegExp(nsPattern));
        if (nsOutputs) {
          deploymentResult.domain.nameServers = nsOutputs[1].split(',');
          deploymentResult.domain.setupInstructions = `Add these NS records for ${config.domain.name} in your parent domain's DNS`;
        }
      }

      // Add external DNS setup instructions
      if (config.domain.type === 'external') {
        const domainStackName = generateStackName(
          projectName,
          environment,
          'Domain'
        );
        const cnamePattern = `${domainStackName}\\.CNAMETarget = ([^\\s]+)`;
        const cnameOutputs = result.match(new RegExp(cnamePattern));
        if (cnameOutputs) {
          deploymentResult.domain.cnameTarget = cnameOutputs[1];
          deploymentResult.domain.setupInstructions = `Create a CNAME record for ${config.domain.name} pointing to ${cnameOutputs[1]}`;
        }
      }
    }

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

async function runBuildCommand(): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['tsc-run', 'build'], {
      stdio: 'inherit',
      cwd: process.cwd(),
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Build command failed with code ${code}`));
      }
    });
  });
}
