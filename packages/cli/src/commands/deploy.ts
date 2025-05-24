import type { CommandModule } from 'yargs';
import {loadConfig} from "../config/loader.js";
import {deploy} from "../deploy/deploy.js";
import {formatDeploymentOutput} from "../deploy/util.js";
import * as readline from 'readline';
import { spawn } from 'child_process';

async function checkDomainReady(domainName: string): Promise<boolean> {
  return new Promise((resolve) => {
    // Quick DNS lookup to see if domain resolves
    const child = spawn('nslookup', [domainName], { stdio: 'pipe' });
    
    let output = '';
    child.stdout?.on('data', (data) => {
      output += data.toString();
    });
    
    child.on('close', (code) => {
      // If nslookup succeeds and finds an address, domain is likely ready
      const hasAddress = output.includes('Address:') && !output.includes('can\'t find');
      resolve(hasAddress);
    });
    
    // Timeout after 3 seconds
    setTimeout(() => {
      child.kill();
      resolve(false);
    }, 3000);
  });
}

async function promptForDomainSetup(config: any): Promise<boolean> {
  // Check if domain configuration exists and requires DNS setup
  if (!config.domain || config.domain.type === 'external') {
    return true; // No prompt needed
  }

  const domainName = config.domain.name;
  const domainType = config.domain.type;
  
  // Check if domain is already resolving (likely already configured)
  const isDomainReady = await checkDomainReady(domainName);
  if (isDomainReady) {
    console.log(`✅ Domain ${domainName} appears to be already configured`);
    return true; // Skip prompt if domain is working
  }

  console.log('\n📋 \x1b[1m\x1b[33mDomain & SSL Certificate Setup Required\x1b[0m');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  if (domainType === 'subdomain') {
    console.log(`🌐 Subdomain: \x1b[1m${domainName}\x1b[0m`);
    console.log('\n⚠️  \x1b[1m\x1b[33mIMPORTANT:\x1b[0m After deployment, you will need to:');
    console.log('   1. Copy the NS (Name Server) records from the deployment output');
    console.log('   2. Add these NS records to your parent domain\'s DNS settings');
    console.log('   3. Wait for DNS propagation (can take up to 48 hours)');
    console.log('   4. SSL certificate will be automatically validated via DNS once NS records are active');
  } else if (domainType === 'hosted-zone') {
    console.log(`🌐 Domain: \x1b[1m${domainName}\x1b[0m`);
    console.log('\n⚠️  \x1b[1m\x1b[33mIMPORTANT:\x1b[0m After deployment, you will need to:');
    console.log('   1. Update your domain\'s name servers to point to AWS Route 53');
    console.log('   2. Use the NS records from the deployment output');
    console.log('   3. Update these at your domain registrar (GoDaddy, Namecheap, etc.)');
    console.log('   4. SSL certificate will be automatically validated via DNS once NS records are active');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('\n✅ Do you want to continue with deployment? (y/N): ', (answer) => {
      rl.close();
      const shouldContinue = answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
      if (!shouldContinue) {
        console.log('\n🚫 Deployment cancelled by user.\n');
      }
      resolve(shouldContinue);
    });
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
      default: false
    });
  },
  handler: async (argv) => {
    try {
      console.log('🔧 Loading configuration...');
      const config = await loadConfig();

      // Show domain setup prompt if needed (unless --force is used)
      if (!argv.force) {
        const shouldContinue = await promptForDomainSetup(config);
        if (!shouldContinue) {
          process.exit(0);
        }
      } else if (config.domain && config.domain.type !== 'external') {
        // Show informational message when using --force with domain config
        console.log('⚡ Using --force flag: Skipping domain setup confirmation');
        console.log('📋 Remember to configure DNS settings after deployment\n');
      }

      console.log('🚀 Deploying project...');
      const result = await deploy(config);
      
      // Display formatted deployment results
      console.log(formatDeploymentOutput(result));
    } catch (error) {
      console.error('\n❌ \x1b[1m\x1b[31mDeployment Failed!\x1b[0m');
      console.error(`\x1b[31m${error instanceof Error ? error.message : String(error)}\x1b[0m\n`);
      process.exit(1);
    }
  }
};