import { App } from 'aws-cdk-lib';
import { AppStack } from './cdk/app-stack.js';
import { NetworkingStack } from './cdk/networking-stack.js';
import { DomainStack } from './cdk/domain-stack.js';
import { type config, loadConfig } from '@lumo-framework/core';
import { generateStackName } from './utils.js';
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

  // Generate stack name in format: <ProjectName><Env><Domain>
  const env = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  };

  // Create NetworkingStack first
  const networkingStackName = generateStackName(
    config.projectName,
    config.environment,
    'Networking'
  );
  const networkingStack = new NetworkingStack(app, networkingStackName, {
    env,
    projectName: config.projectName,
    environment: config.environment,
    natGateways: config.networking?.natGateways ?? 0,
  });

  // Create a SecretStack
  new SecretStack(
    app,
    generateStackName(config.projectName, config.environment, 'Secret'),
    {
      env,
      config,
    }
  );

  // Create AppStack with networking dependencies
  const appStackName = generateStackName(
    config.projectName,
    config.environment,
    'App'
  );
  const appStack = new AppStack(app, appStackName, {
    env,
    config,
    networkingExports: networkingStack.exports,
  });

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
