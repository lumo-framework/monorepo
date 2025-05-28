import type { CommandModule } from 'yargs';
import { loadConfig, config } from '@tsc-run/core';
import { deploy } from '../deploy/deploy.js';
import { formatDeploymentOutput } from '../deploy/util.js';
import { log } from '@tsc-run/utils';
import * as readline from 'readline';
import { spawn } from 'child_process';
import { setTimeout, clearTimeout } from 'timers';
import fs from 'fs/promises';

async function checkDomainReady(domainName: string): Promise<boolean> {
  return new Promise((resolve) => {
    // Quick DNS lookup to see if domain resolves
    const child = spawn('nslookup', [domainName], { stdio: 'pipe' });

    let output = '';
    child.stdout?.on('data', (data) => {
      output += data.toString();
    });

    child.on('close', () => {
      clearTimeout(timeout);
      // If nslookup succeeds and finds an address, domain is likely ready
      const hasAddress =
        output.includes('Address:') && !output.includes("can't find");
      resolve(hasAddress);
    });

    // Timeout after 3 seconds
    const timeout = setTimeout(() => {
      child.kill();
      resolve(false);
    }, 3000);
  });
}

async function promptForDomainSetup(config: config.Config): Promise<boolean> {
  // Check if domain configuration exists and requires DNS setup
  if (!config.domain || config.domain.type === 'external') {
    return true; // No prompt needed
  }

  const domainName = config.domain.name;
  const domainType = config.domain.type;

  // Check if domain is already resolving (likely already configured)
  const isDomainReady = await checkDomainReady(domainName);
  if (isDomainReady) {
    log.success(`Domain ${domainName} appears to be already configured`);
    return true; // Skip prompt if domain is working
  }

  log.heading('\nDomain & SSL Certificate Setup Required');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (domainType === 'subdomain') {
    log.info(`🌐 Subdomain: ${domainName}`);
    log.warn('During deployment, you will need to:');
    console.log(
      '   1. Copy the NS (Name Server) records from the deployment output or during deployment'
    );
    console.log("   2. Add these NS records to your domain's DNS settings");
    console.log('   3. Wait for DNS propagation (may take a few minutes)');
    console.log(
      '   4. SSL certificate will be automatically validated via DNS once NS records are active'
    );
  } else if (domainType === 'hosted-zone') {
    log.info(`🌐 Domain: ${domainName}`);
    log.warn('During deployment, you will need to:');
    console.log(
      "   1. Update your domain's name servers to point to AWS Route 53"
    );
    console.log('   2. Use the NS records from the deployment output');
    console.log(
      '   3. Update these at your domain registrar (GoDaddy, Namecheap, etc.)'
    );
    console.log(
      '   4. SSL certificate will be automatically validated via DNS once NS records are active'
    );
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(
      '\n✅ Do you want to continue with deployment? (y/N): ',
      (answer) => {
        rl.close();
        const shouldContinue =
          answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
        if (!shouldContinue) {
          log.warn('Deployment cancelled by user.');
        }
        resolve(shouldContinue);
      }
    );
  });
}

export const deployCommand: CommandModule = {
  command: 'deploy',
  describe: 'Deploy the project',
  builder: (yargs) => {
    return yargs.option('force', {
      alias: 'f',
      type: 'boolean',
      description: 'Skip domain setup confirmation prompt (useful for CI/CD)',
      default: false,
    });
  },
  handler: async (argv) => {
    try {
      const config = await log.spinner('Loading configuration', () =>
        loadConfig()
      );

      // Check if build exists before attempting deployment
      try {
        await fs.access('dist/lambdas');
      } catch {
        log.error('No build found!');
        log.warn('You need to build your project before deploying.');
        log.info('Run: tsc-run build');
        process.exit(1);
      }

      // Show domain setup prompt if needed (unless --force is used)
      if (!argv.force) {
        const shouldContinue = await promptForDomainSetup(config);
        if (!shouldContinue) {
          process.exit(0);
        }
      } else if (config.domain && config.domain.type !== 'external') {
        // Show informational message when using --force with domain config
        log.info('⚡ Using --force flag: Skipping domain setup confirmation');
        log.info('📋 Remember to configure DNS settings after deployment');
      }

      const result = await deploy(config, log);

      // Display formatted deployment results
      formatDeploymentOutput(result);
    } catch (error) {
      log.error('Deployment Failed!');
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  },
};
