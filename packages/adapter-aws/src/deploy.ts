import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { setInterval, clearInterval, setTimeout, clearTimeout } from 'timers';
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

export interface CdkOutput {
  OutputKey: string;
  OutputValue: string;
  Description?: string;
  ExportName?: string;
}

export interface CdkStackOutput {
  StackId: string;
  StackName: string;
  CreationTime: string;
  StackStatus: string;
  Outputs?: CdkOutput[];
}

export interface CdkConfig {
  timeout?: number; // in milliseconds
}

export async function deployToAws(
  config: config.Config,
  cdkConfig?: CdkConfig
) {
  const defaultCdkConfig: Required<CdkConfig> = {
    timeout: 30 * 60 * 1000, // 30 minutes
  };

  const finalCdkConfig = { ...defaultCdkConfig, ...cdkConfig };

  console.log('🔧 Starting AWS deployment...');
  console.log(`📦 Project: ${config.projectName || 'MyProject'}`);
  console.log(`🌍 Environment: ${config.environment || 'dev'}`);
  console.log(`⚙️  CDK Config: timeout=${finalCdkConfig.timeout}ms`);

  try {
    // Run CDK bootstrap if needed
    console.log('🏗️  Bootstrapping CDK environment...');
    await runCdkCommand(['bootstrap'], finalCdkConfig.timeout);

    // Deploy the stack
    console.log('🚀 Deploying infrastructure stacks...');
    await runCdkCommand(
      ['deploy', '--require-approval', 'never', '--all'],
      finalCdkConfig.timeout
    );

    // Get stack outputs using structured approach
    console.log('📊 Retrieving deployment outputs...');
    const stackOutputs = await getStackOutputs(finalCdkConfig.timeout);
    console.log(`📋 Found ${stackOutputs.length} stack(s) with outputs`);

    // Extract URLs from structured CDK output
    const projectName = config.projectName || 'MyProject';
    const environment = config.environment || 'dev';

    // Extract API Gateway URL using structured output
    console.log('🔍 Extracting API Gateway URL...');
    const apiGatewayUrl = extractApiGatewayUrl(
      stackOutputs,
      projectName,
      environment
    );
    console.log(`🌐 API Gateway URL: ${apiGatewayUrl || 'Not found'}`);

    // Extract custom domain URL using structured output
    let customDomainUrl = null;
    if (config.domain) {
      console.log(
        `🔍 Extracting custom domain URL for ${config.domain.name}...`
      );
      customDomainUrl = extractCustomDomainUrl(
        stackOutputs,
        projectName,
        environment,
        config.domain.name
      );
      console.log(`🌐 Custom Domain URL: ${customDomainUrl || 'Not found'}`);
    }

    // Primary URL (custom domain if available, otherwise API Gateway)
    const primaryUrl = customDomainUrl || apiGatewayUrl || 'URL not found';

    const deploymentResult: DeploymentResult = {
      url: primaryUrl,
      apiGatewayUrl: apiGatewayUrl,
      customDomainUrl: customDomainUrl,
      provider: 'aws',
    };

    // Add domain-specific information using structured output
    if (config.domain) {
      console.log(
        `🔍 Extracting domain configuration for ${config.domain.name}...`
      );
      deploymentResult.domain = extractDomainInfo(
        stackOutputs,
        config.domain,
        projectName,
        environment
      );
    }

    console.log('✅ Deployment completed successfully!');
    return deploymentResult;
  } catch (error) {
    console.error('CDK deployment failed:', error);
    throw error;
  }
}

async function runCdkCommand(
  args: string[],
  timeout: number,
  showProgress: boolean = true
): Promise<string> {
  return new Promise((resolve, reject) => {
    let isResolved = false;

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

    // Set up timeout
    const timeoutId = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        if (loadingInterval) {
          clearInterval(loadingInterval);
        }
        child.kill('SIGKILL');
        reject(new Error(`CDK command timed out after ${timeout}ms`));
      }
    }, timeout);

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
      if (isResolved) return;
      isResolved = true;

      clearTimeout(timeoutId);

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

    child.on('error', (error) => {
      if (isResolved) return;
      isResolved = true;

      clearTimeout(timeoutId);
      if (loadingInterval) {
        clearInterval(loadingInterval);
      }
      reject(new Error(`Failed to spawn CDK process: ${error.message}`));
    });
  });
}

async function getStackOutputs(timeout: number): Promise<CdkStackOutput[]> {
  try {
    const result = await runCdkCommand(['list', '--json'], timeout, false);
    const stackNames = JSON.parse(result) as string[];

    const outputs: CdkStackOutput[] = [];

    for (const stackName of stackNames) {
      try {
        const describeResult = await runCdkCommand(
          ['describe', stackName, '--json'],
          timeout,
          false
        );
        const stackInfo = JSON.parse(describeResult);
        outputs.push(stackInfo);
      } catch (error) {
        console.warn(
          `⚠️  Could not describe stack ${stackName}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return outputs;
  } catch {
    console.warn(
      '⚠️  Could not get structured stack outputs, falling back to text parsing'
    );
    return [];
  }
}

function extractApiGatewayUrl(
  stackOutputs: CdkStackOutput[],
  _projectName: string,
  _environment: string
): string | null {
  console.log('🔍 Scanning stack outputs for API Gateway URL...');

  for (const stack of stackOutputs) {
    console.log(`📋 Checking stack: ${stack.StackName}`);
    if (!stack.Outputs) {
      console.log('   ⚠️  No outputs found in stack');
      continue;
    }

    for (const output of stack.Outputs) {
      const key = output.OutputKey.toLowerCase();
      const value = output.OutputValue;
      console.log(`   🔑 Output: ${output.OutputKey} = ${value}`);

      // Look for API Gateway endpoint patterns
      if (
        (key.includes('restapi') || key.includes('api')) &&
        key.includes('endpoint') &&
        value.includes('execute-api')
      ) {
        console.log(`   ✅ Found API Gateway URL: ${value}`);
        return value;
      }
    }
  }

  console.log('   ⚠️  No API Gateway URL found in stack outputs');
  return null;
}

function extractCustomDomainUrl(
  stackOutputs: CdkStackOutput[],
  projectName: string,
  environment: string,
  domainName: string
): string | null {
  console.log('🔍 Scanning stack outputs for custom domain URL...');

  for (const stack of stackOutputs) {
    console.log(`📋 Checking stack: ${stack.StackName}`);
    if (!stack.Outputs) {
      console.log('   ⚠️  No outputs found in stack');
      continue;
    }

    for (const output of stack.Outputs) {
      const key = output.OutputKey.toLowerCase();
      const value = output.OutputValue;
      console.log(`   🔑 Output: ${output.OutputKey} = ${value}`);

      // Look for custom domain URL patterns
      if (key.includes('customdomain') && key.includes('url')) {
        console.log(`   ✅ Found custom domain URL: ${value}`);
        return value;
      }
    }
  }

  // Fallback: construct URL from domain name
  console.log(`   📝 Using fallback URL construction: https://${domainName}`);
  return `https://${domainName}`;
}

function extractDomainInfo(
  stackOutputs: CdkStackOutput[],
  domain: NonNullable<config.Config['domain']>,
  _projectName: string,
  _environment: string
): DomainInfo {
  console.log('🔍 Scanning stack outputs for domain configuration...');

  const domainInfo: DomainInfo = {
    name: domain.name,
    type: domain.type,
  };

  for (const stack of stackOutputs) {
    console.log(`📋 Checking stack: ${stack.StackName}`);
    if (!stack.Outputs) {
      console.log('   ⚠️  No outputs found in stack');
      continue;
    }

    for (const output of stack.Outputs) {
      const key = output.OutputKey.toLowerCase();
      const value = output.OutputValue;
      console.log(`   🔑 Output: ${output.OutputKey} = ${value}`);

      // Look for name servers
      if (
        key.includes('nameserver') ||
        (key.includes('subdomain') && key.includes('ns'))
      ) {
        console.log(`   ✅ Found name servers: ${value}`);
        domainInfo.nameServers = value.split(',').map((ns) => ns.trim());
        domainInfo.setupInstructions = `Add these NS records for ${domain.name} in your parent domain's DNS`;
      }

      // Look for CNAME target
      if (key.includes('cname') && key.includes('target')) {
        console.log(`   ✅ Found CNAME target: ${value}`);
        domainInfo.cnameTarget = value;
        domainInfo.setupInstructions = `Create a CNAME record for ${domain.name} pointing to ${value}`;
      }
    }
  }

  return domainInfo;
}
