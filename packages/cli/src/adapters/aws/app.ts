import { App } from 'aws-cdk-lib';
import { AppStack } from './cdk/app-stack.js';
import { NetworkingStack } from './cdk/networking-stack.js';
import { DomainStack } from './cdk/domain-stack.js';
import { type config, loadConfig } from '@lumo-framework/core';
import { generateStackName, normaliseName } from './utils.js';
import { SecretStack } from './cdk/secret-stack.js';

async function main() {
  const app = new App();

  let config: config.Config;
  try {
    config = await loadConfig();
  } catch (error) {
    console.error('Failed to load config:', error);
    process.exit(1);
  }

  // Create a normalised project name and environment name
  const normalisedProjectName = normaliseName(config.projectName);
  const normalisedEnvironment = normaliseName(config.environment);

  // Default environment configuration for all stacks
  const env = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: config.region || process.env.CDK_DEFAULT_REGION || 'us-east-1',
  };

  /**
   * Stacks
   */
  const networkingStack = new NetworkingStack(
    app,
    generateStackName(
      normalisedProjectName,
      normalisedEnvironment,
      'Networking'
    ),
    {
      env,
      projectName: normalisedProjectName,
      environment: normalisedEnvironment,
      natGateways: config.networking?.natGateways ?? 0,
    }
  );

  new SecretStack(
    app,
    generateStackName(normalisedProjectName, normalisedEnvironment, 'Secrets'),
    {
      env,
      projectName: normalisedProjectName,
      environment: normalisedEnvironment,
      secrets: config.secrets,
    }
  );

  const appStack = new AppStack(
    app,
    generateStackName(normalisedProjectName, normalisedEnvironment, 'App'),
    {
      env,
      config,
      networkingExports: networkingStack.networkingDetails,
      projectName: normalisedProjectName,
      environment: normalisedEnvironment,
    }
  );

  // Ensure proper deployment order
  appStack.addDependency(networkingStack);

  // Create DomainStack if domain configuration is provided
  if (config.domainName) {
    const domainStackName = generateStackName(
      config.projectName,
      config.environment,
      'Domain'
    );
    const domainStack = new DomainStack(app, domainStackName, {
      env,
      config,
      api: appStack.api,
    });

    // Domain stack depends on app stack (needs the API)
    domainStack.addDependency(appStack);
  }

  app.synth();
}

main().catch(console.error);
