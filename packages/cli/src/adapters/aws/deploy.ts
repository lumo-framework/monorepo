import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { setInterval, clearInterval } from 'timers';
import { glob } from 'glob';
import path from 'path';
import type { config } from '@tsc-run/core';
import type { LogMethods } from '@tsc-run/utils';
import {
  ProgressDisplay,
  showBootstrapProgress,
  showInfrastructureDeploymentProgress,
  DEPLOYMENT_ICONS,
} from '@tsc-run/utils';
import { toPascalCase, generateStackName } from './utils.js';

export interface DomainInfo {
  name: string;
  type: string;
  setupInstructions?: string;
  nameServers?: string[];
  cnameTarget?: string;
}

export interface DeploymentResult {
  provider: string;
  success?: boolean;
  url?: string;
  errors?: string[];
  warnings?: string[];
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
  if (!config.domainName) {
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
  return `https://${config.domainName}`;
}

function addDomainInfo(
  deploymentResult: DeploymentResult,
  result: string,
  config: config.Config,
  projectName: string,
  environment: string
): void {
  if (!config.domainName) {
    return;
  }

  deploymentResult.domain = {
    name: config.domainName,
    type: 'managed',
  };

  const domainStackName = generateStackName(projectName, environment, 'Domain');

  // Add setup instructions for hosted zone
  const nsPattern = `${domainStackName}\\.HostedZoneNameServers = ([^\\s]+)`;
  const nsOutputs = result.match(new RegExp(nsPattern));
  if (nsOutputs) {
    deploymentResult.domain.nameServers = nsOutputs[1].split(',');
    deploymentResult.domain.setupInstructions = `Update nameservers for ${config.domainName} to point to AWS Route 53`;
  }
}

interface FunctionInfo {
  name: string;
  path: string;
}

async function scanBuiltFunctions(): Promise<{
  routes: FunctionInfo[];
  subscribers: FunctionInfo[];
}> {
  const routes: FunctionInfo[] = [];
  const subscribers: FunctionInfo[] = [];

  // Scan for route functions (support both .js and .mjs extensions)
  const routeFiles = await glob('dist/functions/**/index.{js,mjs}');
  for (const filePath of routeFiles) {
    // Skip subscriber functions which are in the subscribers subdirectory
    if (filePath.includes('/subscribers/')) {
      continue;
    }

    // Extract route path from the file path structure
    const relativePath = path.relative('dist/functions', filePath);
    const pathParts = relativePath.split(path.sep);
    // Remove the 'index.mjs' part and join with '/' to match build naming
    const routeName = pathParts.slice(0, -1).join('/');

    routes.push({
      name: routeName,
      path: filePath,
    });
  }

  // Scan for subscriber functions (support both .js and .mjs extensions)
  const subscriberFiles = await glob(
    'dist/functions/subscribers/*/index.{js,mjs}'
  );
  for (const filePath of subscriberFiles) {
    const subscriberName = path.basename(path.dirname(filePath));

    subscribers.push({
      name: subscriberName,
      path: filePath,
    });
  }

  return { routes, subscribers };
}

export async function deployToAws(config: config.Config, _logger?: LogMethods) {
  const progress = new ProgressDisplay();

  try {
    // Scan built functions to show meaningful progress
    const { routes, subscribers } = await scanBuiltFunctions();

    progress.addItem('Bootstrap', 1);
    if (routes.length > 0) {
      progress.addItem('Routes', routes.length);
    }
    if (subscribers.length > 0) {
      progress.addItem('Subscribers', subscribers.length);
    }
    if (
      config.events?.subscribers &&
      Object.keys(config.events.subscribers).length > 0
    ) {
      progress.addItem('Queue', 1);
    }
    progress.render();

    // Run CDK bootstrap if needed
    showBootstrapProgress(progress, 'Bootstrapping CDK environment...');

    await runCdkCommand(['bootstrap'], false);
    progress.updateItem('Bootstrap', 1);
    progress.render();

    // Deploy the stack
    showInfrastructureDeploymentProgress(
      progress,
      'Deploying infrastructure stacks...'
    );

    const result = await runCdkCommand(
      ['deploy', '--require-approval', 'never', '--all'],
      false,
      progress,
      routes.length,
      subscribers.length
    );

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
    const primaryUrl = customDomainUrl || apiGatewayUrl;

    const deploymentResult: DeploymentResult = {
      provider: 'aws',
      url: primaryUrl || undefined,
    };

    // Mark all deployment items as complete
    if (routes.length > 0) {
      progress.updateItem('Routes', routes.length);
    }
    if (subscribers.length > 0) {
      progress.updateItem('Subscribers', subscribers.length);
    }
    if (
      config.events?.subscribers &&
      Object.keys(config.events.subscribers).length > 0
    ) {
      progress.updateItem('Queue', 1);
    }

    // Clear any status message before showing completion
    progress.clearStatus();
    progress.render();

    // Add domain-specific information if domain is configured
    addDomainInfo(deploymentResult, result, config, projectName, environment);

    // Complete progress display
    progress.complete(DEPLOYMENT_ICONS.SUCCESS, 'Deployment complete!');

    return deploymentResult;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    progress.error(`Deployment failed: ${errorMsg}`);
    throw error;
  }
}

async function runCdkCommand(
  args: string[],
  showProgress: boolean = true,
  progressDisplay?: ProgressDisplay,
  _routeCount: number = 0,
  _subscriberCount: number = 0
): Promise<string> {
  // showProgress = true: use built-in spinner and show CDK output
  // showProgress = false: suppress all output (external spinner handles progress)
  return new Promise((resolve, reject) => {
    // Get the path to the adapter's built CDK app
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const cdkApp = join(__dirname, 'app.js');

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
      // Only show CDK output when using built-in progress indicator
      if (showProgress) {
        process.stdout.write(data);
      }
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
      // Only show CDK errors when using built-in progress indicator
      if (showProgress) {
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
        if (code === 0 && showProgress) {
          process.stdout.write(
            `\r✅ ${operationName} completed successfully\n`
          );
        } else if (code !== 0 && showProgress) {
          process.stdout.write(`\r❌ ${operationName} failed\n`);
        }
      }

      if (code === 0) {
        resolve(stdout);
      } else {
        // Show error output when deployment fails
        if (stderr.trim() && showProgress) {
          console.error('\n📋 Error details:');
          console.error(stderr);
        }
        reject(new Error(`CDK command failed with code ${code}: ${stderr}`));
      }
    });
  });
}
