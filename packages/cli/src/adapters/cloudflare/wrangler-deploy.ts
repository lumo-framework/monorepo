import type { config } from '@lumo-framework/core';
import type { LogMethods } from '@lumo-framework/utils';
import {
  log as defaultLog,
  ProgressDisplay,
  showRouteDeploymentProgress,
  showSubscriberDeploymentProgress,
  showRouterDeploymentProgress,
  showQueueSetupProgress,
  DEPLOYMENT_ICONS,
} from '@lumo-framework/utils';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import { fileURLToPath } from 'url';
import { generateRouterWorker } from './router-generator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface FunctionInfo {
  name: string;
  path: string;
  content: string;
  route?: string;
}

async function listExistingWorkers(config: config.Config): Promise<string[]> {
  // Use Cloudflare API to list workers
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !apiToken) {
    console.warn('Missing Cloudflare credentials for listing workers');
    return [];
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts`,
    {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    console.warn(
      'Failed to fetch workers from Cloudflare API:',
      response.statusText
    );
    return [];
  }

  const data = (await response.json()) as {
    result: Array<{ id: string; created_on: string; modified_on: string }>;
    success: boolean;
  };

  if (!data.success || !data.result) {
    console.warn('Invalid response from Cloudflare API');
    return [];
  }

  // Filter workers that belong to this project
  const projectPrefix = `${config.projectName}-${config.environment}-`;

  const workerNames = data.result
    .filter((worker) => worker.id && typeof worker.id === 'string')
    .map((worker) => worker.id)
    .filter((id) => id.startsWith(projectPrefix));

  return workerNames;
}

async function deployRoutesWithConcurrency(
  routes: FunctionInfo[],
  config: config.Config,
  maxConcurrency: number,
  progress: ProgressDisplay,
  routeWorkerUrls: Record<string, string>,
  deploymentResults: CloudflareDeploymentResult,
  onProgressUpdate: (deployed: number) => void,
  routeWorkerNames?: Record<string, string>
): Promise<void> {
  const deployRoute = async (route: FunctionInfo): Promise<void> => {
    try {
      const routePath = convertRouteToPath(route.name);
      const method = extractMethodFromRoute(route.name);
      const routeKey = `${routePath}:${method}`;

      showRouteDeploymentProgress(progress, routePath);

      const result = await deployWithWrangler(route, config, 'route');

      if (result.success) {
        routeWorkerUrls[routeKey] = result.url || '';
        if (routeWorkerNames) {
          routeWorkerNames[routeKey] = result.scriptName;
        }
        deploymentResults.routes.push(result);
        const deployed = deploymentResults.routes.length;
        onProgressUpdate(deployed);
        progress.updateItem('Routes', deployed);
        progress.render();
      } else {
        deploymentResults.success = false;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      deploymentResults.errors.push(`Route ${route.name}: ${errorMsg}`);
      deploymentResults.success = false;
    }
  };

  // Deploy routes with controlled concurrency
  const deployPromises: Promise<void>[] = [];

  for (let i = 0; i < routes.length; i += maxConcurrency) {
    const batch = routes.slice(i, i + maxConcurrency);
    const batchPromises = batch.map((route) => deployRoute(route));
    deployPromises.push(...batchPromises);

    // Wait for current batch to complete before starting next batch
    await Promise.all(batchPromises);
  }
}

async function deploySubscribersWithConcurrency(
  subscribers: FunctionInfo[],
  config: config.Config,
  maxConcurrency: number,
  progress: ProgressDisplay,
  deploymentResults: CloudflareDeploymentResult
): Promise<void> {
  const deploySubscriber = async (subscriber: FunctionInfo): Promise<void> => {
    try {
      showSubscriberDeploymentProgress(progress, subscriber.name);

      const result = await deployWithWrangler(subscriber, config, 'subscriber');
      deploymentResults.subscribers.push(result);

      if (result.success) {
        const deployed = deploymentResults.subscribers.length;
        progress.updateItem('Subscribers', deployed);
        progress.render();
      } else {
        deploymentResults.success = false;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      deploymentResults.errors.push(
        `Subscriber ${subscriber.name}: ${errorMsg}`
      );
      deploymentResults.success = false;
    }
  };

  // Deploy subscribers with controlled concurrency
  for (let i = 0; i < subscribers.length; i += maxConcurrency) {
    const batch = subscribers.slice(i, i + maxConcurrency);
    const batchPromises = batch.map((subscriber) =>
      deploySubscriber(subscriber)
    );

    // Wait for current batch to complete before starting next batch
    await Promise.all(batchPromises);
  }
}

export interface CloudflareDeploymentResult {
  provider: 'cloudflare';
  success: boolean;
  url?: string;
  errors: string[];
  warnings?: string[];
  // Internal tracking for deployment process
  routes: Array<{ scriptName: string; url?: string; success: boolean }>;
  subscribers: Array<{ scriptName: string; url?: string; success: boolean }>;
}

export async function deployToCloudflareWithWrangler(
  config: config.Config,
  logger?: LogMethods
): Promise<CloudflareDeploymentResult> {
  const log = logger || defaultLog;
  const progress = new ProgressDisplay();

  try {
    // Validate environment variables
    if (!process.env.CLOUDFLARE_API_TOKEN) {
      throw new Error('CLOUDFLARE_API_TOKEN environment variable is required');
    }
    if (!process.env.CLOUDFLARE_ACCOUNT_ID) {
      throw new Error('CLOUDFLARE_ACCOUNT_ID environment variable is required');
    }

    // Get existing workers from Cloudflare
    const existingWorkers = await listExistingWorkers(config);

    // Scan for built functions
    const { routes, subscribers } = await scanBuiltFunctions();

    const totalFunctions = routes.length + subscribers.length;
    if (totalFunctions === 0) {
      throw new Error('No built functions found. Run `tsc-run build` first.');
    }

    if (routes.length > 0) {
      progress.addItem('Routes', routes.length + 1); // +1 for router
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

    const deploymentResults: CloudflareDeploymentResult = {
      provider: 'cloudflare',
      success: true,
      routes: [],
      subscribers: [],
      errors: [],
    };

    // Clean up removed workers before deploying new ones
    if (existingWorkers.length > 0) {
      await cleanupRemovedWorkers(
        config,
        existingWorkers,
        routes,
        subscribers,
        progress,
        log
      );
    }

    // Setup event queue if subscribers are configured
    if (
      config.events?.subscribers &&
      Object.keys(config.events.subscribers).length > 0
    ) {
      showQueueSetupProgress(progress);
      await ensureEventQueueExists(config, log);
      progress.updateItem('Queue', 1);
      progress.render();
    }

    // Deploy individual route workers first (for both custom domain and non-custom domain)
    const routeWorkerUrls: Record<string, string> = {};
    const routeWorkerNames: Record<string, string> = {}; // Store script names for service bindings
    let routesDeployed = 0;

    if (routes.length > 0) {
      await deployRoutesWithConcurrency(
        routes,
        config,
        4, // Max 4 concurrent deployments
        progress,
        routeWorkerUrls,
        deploymentResults,
        (deployed) => {
          routesDeployed = deployed;
        },
        routeWorkerNames // Pass this to store script names
      );
    }

    // Deploy router worker with service bindings
    let routerResult: { url: string; scriptName: string } | null = null;

    if (routes.length > 0) {
      try {
        showRouterDeploymentProgress(progress, 'Deploying router worker...');

        routerResult = await deployRouterWithWrangler(
          routes,
          routeWorkerUrls,
          config,
          log,
          routeWorkerNames // Pass script names for service bindings
        );

        routesDeployed++;
        progress.updateItem('Routes', routesDeployed);
        progress.render();
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        deploymentResults.errors.push(`Router deployment failed: ${errorMsg}`);
        deploymentResults.success = false;
      }
    }

    // Deploy subscribers (async with concurrency control)
    if (subscribers.length > 0) {
      await deploySubscribersWithConcurrency(
        subscribers,
        config,
        4, // Max 4 concurrent deployments
        progress,
        deploymentResults
      );
    }

    // Set the main API URL
    if (routes.length > 0 && routerResult) {
      const baseUrl = config.domainName
        ? `https://${config.domainName}`
        : routerResult.url;
      deploymentResults.url = baseUrl;
      deploymentResults.routes = deploymentResults.routes.map((route) => ({
        ...route,
        url: baseUrl,
      }));
    }

    // Complete progress display
    if (deploymentResults.success) {
      progress.complete(DEPLOYMENT_ICONS.SUCCESS, 'Deployment complete!');
    } else {
      progress.error('Deployment completed with errors');
    }

    return deploymentResults;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    progress.error(`Deployment failed: ${errorMsg}`);

    return {
      provider: 'cloudflare',
      success: false,
      routes: [],
      subscribers: [],
      errors: [errorMsg],
    };
  }
}

async function getWorkerUrl(scriptName: string, cwd: string): Promise<string> {
  try {
    // First try to get deployments list (without --format flag)
    try {
      const deploymentOutput = await runWrangler(
        ['deployments', 'list', '--name', scriptName],
        cwd
      );
      // Look for URLs in the deployment list output
      const urlMatch = deploymentOutput.match(/https:\/\/[^\s]+\.workers\.dev/);
      if (urlMatch) {
        return urlMatch[0];
      }
    } catch (deployError) {
      console.log(
        'Deployments list failed:',
        deployError instanceof Error ? deployError.message : String(deployError)
      );
    }

    // Alternative: use wrangler whoami and construct URL with subdomain
    try {
      const subdomainOutput = await runWrangler(['subdomain', 'get'], cwd);

      // Parse subdomain from output like "my-subdomain"
      const lines = subdomainOutput.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        // Look for just the subdomain name (without additional text)
        if (
          trimmed &&
          !trimmed.includes(' ') &&
          trimmed.match(/^[a-zA-Z0-9-]+$/)
        ) {
          return `https://${scriptName}.${trimmed}.workers.dev`;
        }
      }
    } catch (subdomainError) {
      console.log(
        'Subdomain get failed:',
        subdomainError instanceof Error
          ? subdomainError.message
          : String(subdomainError)
      );
    }

    // Last resort: try to list all workers and find this one
    try {
      const listOutput = await runWrangler(['list'], cwd);
      const lines = listOutput.split('\n');
      for (const line of lines) {
        if (line.includes(scriptName) && line.includes('.workers.dev')) {
          const urlMatch = line.match(/https:\/\/[^\s]+\.workers\.dev/);
          if (urlMatch) {
            return urlMatch[0];
          }
        }
      }
    } catch (listError) {
      console.log(
        'List failed:',
        listError instanceof Error ? listError.message : String(listError)
      );
    }

    // If all else fails, throw error
    throw new Error('Could not determine worker URL');
  } catch (error) {
    throw new Error(`Failed to get worker URL for ${scriptName}: ${error}`);
  }
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

    // Skip router function - it will be handled separately
    if (filePath.includes('/router/')) {
      continue;
    }

    const content = await fs.readFile(filePath, 'utf-8');
    // Extract route path from the file path structure
    // e.g., dist/lambdas/users/route-get/index.mjs -> users/route-get
    const relativePath = path.relative('dist/functions', filePath);
    const pathParts = relativePath.split(path.sep);
    // Remove the 'index.mjs' part and join with '/' to match build naming
    const routeName = pathParts.slice(0, -1).join('/');

    routes.push({
      name: routeName,
      path: filePath,
      content,
      route: routeName,
    });
  }

  // Scan for subscriber functions (support both .js and .mjs extensions)
  const subscriberFiles = await glob(
    'dist/functions/subscribers/*/index.{js,mjs}'
  );
  for (const filePath of subscriberFiles) {
    const content = await fs.readFile(filePath, 'utf-8');
    const subscriberName = path.basename(path.dirname(filePath));

    subscribers.push({
      name: `subscriber-${subscriberName}`,
      path: filePath,
      content,
    });
  }

  return { routes, subscribers };
}

function generateWorkerName(funcName: string, config: config.Config): string {
  // Create Cloudflare-safe script name by replacing invalid characters
  const safeFuncName = funcName
    .replace(/[{}]/g, '') // Remove curly braces
    .replace(/\[|\]/g, '') // Remove square brackets
    .replace(/\//g, '-') // Replace slashes with dashes
    .replace(/[^a-zA-Z0-9-]/g, '-') // Replace any other invalid chars with dashes
    .replace(/-+/g, '-') // Replace multiple consecutive dashes with single dash
    .replace(/^-|-$/g, ''); // Remove leading/trailing dashes

  return `${config.projectName}-${config.environment}-${safeFuncName}`;
}

async function deployWithWrangler(
  func: FunctionInfo,
  config: config.Config,
  type: 'route' | 'subscriber' | 'router',
  serviceBindings?: Record<string, string>
): Promise<{ scriptName: string; url?: string; success: boolean }> {
  const scriptName = generateWorkerName(func.name, config);

  // Generate wrangler.toml for this function
  const wranglerConfig = generateWranglerConfig(
    scriptName,
    func,
    config,
    type,
    serviceBindings
  );
  const wranglerPath = path.join(path.dirname(func.path), 'wrangler.toml');

  await fs.writeFile(wranglerPath, wranglerConfig);

  try {
    // Deploy using wrangler and capture output
    const deployOutput = await runWrangler(['deploy'], path.dirname(func.path));

    // Deploy secrets after the worker is deployed
    await deploySecrets(scriptName, config, path.dirname(func.path));

    // Clean up wrangler.toml
    await fs.unlink(wranglerPath);

    // Extract URL from deployment output
    let workerUrl: string | undefined;

    // Try to extract URL from wrangler deploy output
    const urlMatch = deployOutput.match(/https:\/\/[^\s]+\.workers\.dev/);
    if (urlMatch) {
      workerUrl = urlMatch[0];
    } else {
      // Construct URL manually using the script name pattern
      // We know from successful individual worker deployments that the pattern is:
      // https://scriptname.subdomain.workers.dev
      if (type !== 'router') {
        // For individual routes, we still try to get the URL
        try {
          workerUrl = await getWorkerUrl(scriptName, path.dirname(func.path));
        } catch (urlError) {
          console.warn(
            'Failed to get individual worker URL, but continuing:',
            urlError
          );
        }
      }
    }

    return {
      scriptName,
      url: workerUrl,
      success: true,
    };
  } catch (error) {
    // Clean up wrangler.toml even on failure
    try {
      await fs.unlink(wranglerPath);
    } catch {
      // Ignore cleanup errors
    }

    throw error;
  }
}

function generateWranglerConfig(
  scriptName: string,
  func: FunctionInfo,
  config: config.Config,
  type: 'route' | 'subscriber' | 'router',
  serviceBindings?: Record<string, string>
): string {
  const toml = [
    `name = "${scriptName}"`,
    `main = "./index.${func.path.endsWith('.mjs') ? 'mjs' : 'js'}"`,
    `compatibility_date = "2023-12-01"`,
    '',
    `[env.${config.environment}]`,
    `account_id = "${process.env.CLOUDFLARE_ACCOUNT_ID}"`,
    'logpush = true',
  ];

  // Add domain configuration for router worker only
  if (type === 'router' && config.domainName) {
    if (type === 'router' && config.domainName) {
      if (process.env.CLOUDFLARE_ZONE_ID) {
        // Option A: Domain is managed by Cloudflare - use zone routing
        toml.push(`zone_id = "${process.env.CLOUDFLARE_ZONE_ID}"`);
        toml.push(`route = "${config.domainName}/*"`);
      } else {
        // Option B: External domain - use custom domain
        toml.push(`custom_domain = "${config.domainName}"`);
      }
    }
  }

  toml.push('');
  toml.push(`[observability]`);
  toml.push(`enabled = true`);
  toml.push(`head_sampling_rate = 1`);
  toml.push('');

  // Add queue bindings for event dispatch
  if (
    config.events?.subscribers &&
    Object.keys(config.events.subscribers).length > 0
  ) {
    const queueName = `${config.projectName}-${config.environment}-events`;
    toml.push('');
    toml.push('[[queues.producers]]');
    toml.push(`queue = "${queueName}"`);
    toml.push('binding = "EVENT_QUEUE"');

    // For subscriber Workers, add queue consumers
    if (type === 'subscriber') {
      toml.push('');
      toml.push('[[queues.consumers]]');
      toml.push(`queue = "${queueName}"`);
      toml.push('max_batch_size = 10');
      toml.push('max_batch_timeout = 5');
    }
  }

  // Add environment variables and project metadata in a single [vars] section
  toml.push('');
  toml.push('[vars]');

  // Add project metadata
  toml.push(`TSC_RUN_PROJECT_NAME = "${config.projectName}"`);
  toml.push(`TSC_RUN_ENVIRONMENT = "${config.environment}"`);

  // Add service bindings for router worker
  if (
    type === 'router' &&
    serviceBindings &&
    Object.keys(serviceBindings).length > 0
  ) {
    toml.push('');
    toml.push('[[services]]');

    for (const [bindingName, serviceName] of Object.entries(serviceBindings)) {
      toml.push(`binding = "${bindingName}"`);
      toml.push(`service = "${serviceName}"`);
      toml.push('');
      toml.push('[[services]]');
    }

    // Remove the last [[services]] entry
    toml.pop();
  }

  return toml.join('\n');
}

async function deploySecrets(
  scriptName: string,
  config: config.Config,
  cwd: string
): Promise<void> {
  if (!config.secrets) {
    return;
  }

  for (const [key, secretConfig] of Object.entries(config.secrets)) {
    if (typeof secretConfig.value === 'string') {
      try {
        await runWranglerWithInput(
          ['secret', 'put', key, '--name', scriptName],
          secretConfig.value,
          cwd
        );
      } catch (error) {
        throw new Error(
          `Failed to deploy secret ${key}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }
}

async function ensureEventQueueExists(
  config: config.Config,
  _logger: LogMethods
): Promise<void> {
  const queueName = `${config.projectName}-${config.environment}-events`;

  try {
    // Create the queue using wrangler
    await runWrangler(['queues', 'create', queueName], process.cwd());
  } catch (error) {
    // Queue might already exist, which is fine
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (
      errorMsg.includes('already exists') ||
      errorMsg.includes('duplicate') ||
      errorMsg.includes('already taken') ||
      errorMsg.includes('code: 11009')
    ) {
      // Queue already exists, this is fine
    } else {
      throw new Error(`Failed to setup event queue: ${errorMsg}`);
    }
  }
}

function runWrangler(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Find the wrangler binary in the CLI package's node_modules
    const cliPackagePath = path.resolve(__dirname, '../../..');
    const wranglerBin = path.join(cliPackagePath, 'node_modules/.bin/wrangler');

    const child = spawn(wranglerBin, args, {
      cwd,
      stdio: 'pipe',
      env: {
        ...process.env,
        CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
        CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
      },
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(
          new Error(`Wrangler failed with code ${code}:\n${stderr || stdout}`)
        );
      }
    });

    child.on('error', (error) => {
      reject(new Error(`Failed to spawn wrangler: ${error.message}`));
    });
  });
}

function runWranglerWithInput(
  args: string[],
  input: string,
  cwd: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Find the wrangler binary in the CLI package's node_modules
    const cliPackagePath = path.resolve(__dirname, '../../..');
    const wranglerBin = path.join(cliPackagePath, 'node_modules/.bin/wrangler');

    const child = spawn(wranglerBin, args, {
      cwd,
      stdio: 'pipe',
      env: {
        ...process.env,
        CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
        CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
      },
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(
          new Error(`Wrangler failed with code ${code}:\n${stderr || stdout}`)
        );
      }
    });

    child.on('error', (error) => {
      reject(new Error(`Failed to spawn wrangler: ${error.message}`));
    });

    // Write the input (secret value) to stdin
    if (child.stdin) {
      child.stdin.write(input);
      child.stdin.end();
    }
  });
}

function extractMethodFromRoute(routeName: string): string {
  const parts = routeName.split('-');
  return parts[parts.length - 1]?.toUpperCase() || 'GET';
}

function convertRouteToPath(routeName: string): string {
  // Convert route name like "users/route-get" to "/users"
  // This should match the logic in extractRouteInfo
  const parts = routeName.split('-');
  parts.pop(); // Remove method (e.g., "get", "post")

  // Join the remaining parts back together
  let routePath = parts.join('-');

  // Handle the case where routePath contains slashes (from directory structure)
  // e.g., "users/route" -> "users"
  if (routePath.includes('/route')) {
    routePath = routePath.replace('/route', '');
  }

  // Handle the case where routePath ends with just "route" (root routes)
  // e.g., "route" -> ""
  if (routePath === 'route') {
    routePath = '';
  }

  // Remove leading slashes and build path
  routePath = routePath.replace(/^\/+/, '');

  // Convert dynamic segments from {id} to :id format to match router expectations
  // (Build process converts [id] to {id} for filesystem safety)
  routePath = routePath.replace(/\{([^}]+)\}/g, ':$1');

  // Build the final path
  return routePath === '' || routePath === '/' ? '/' : `/${routePath}`;
}

async function deployRouterWithWrangler(
  routes: FunctionInfo[],
  routeWorkerUrls: Record<string, string>,
  config: config.Config,
  _log: LogMethods,
  routeWorkerNames?: Record<string, string>
): Promise<{ url: string; scriptName: string }> {
  const routerName = `${config.projectName}-${config.environment}-router`;

  // Write router to dist/functions/router like other handlers
  const routerDir = path.join(process.cwd(), 'dist', 'functions', 'router');
  await fs.mkdir(routerDir, { recursive: true });

  // Extract route information using the same logic as deployment
  const routeInfo = routes.map((route) => {
    const routePath = convertRouteToPath(route.name);
    const method = extractMethodFromRoute(route.name);

    // Extract parameter names from the route path
    const paramNames: string[] = [];
    let pathPattern = routePath;

    // Convert dynamic segments from {id} to :id format and extract param names
    pathPattern = pathPattern.replace(/\{([^}]+)\}/g, (_, paramName) => {
      paramNames.push(paramName);
      return `:${paramName}`;
    });

    return {
      path: routePath,
      pathPattern: pathPattern,
      method: method,
      functionName: route.name,
      handlerFunction: `${route.name.replace(/-/g, '_')}_handler`,
      paramNames: paramNames,
    };
  });

  // Generate router worker code with service bindings
  const routerPath = path.join(routerDir, 'index.js');

  // Create service bindings mapping
  const serviceBindings: Record<string, string> = {};
  if (routeWorkerNames) {
    for (const [routeKey, scriptName] of Object.entries(routeWorkerNames)) {
      // Create a safe binding name from the route key
      const bindingName = `ROUTE_${routeKey.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}`;
      serviceBindings[bindingName] = scriptName;
    }
  }

  await generateRouterWorker(
    routeInfo,
    routeWorkerUrls,
    config,
    routerPath,
    serviceBindings
  );

  // Create router function info for deployment
  const routerContent = await fs.readFile(routerPath, 'utf-8');
  const routerFunction: FunctionInfo = {
    name: 'router',
    path: routerPath,
    content: routerContent,
  };

  // Deploy router using existing function with service bindings
  const result = await deployWithWrangler(
    routerFunction,
    config,
    'router',
    serviceBindings
  );

  if (!result.success) {
    throw new Error(`Router deployment failed`);
  }

  // Get the actual URL from deployment result or construct it
  let routerUrl: string;
  if (config.domainName) {
    routerUrl = `https://${config.domainName}`;
  } else {
    // Get the actual worker URL from deployment result
    routerUrl = result.url || '';
    if (!routerUrl) {
      // Construct URL using the pattern from successful individual worker deployments
      // Extract subdomain from any successful worker URL we have
      const anyWorkerUrl = Object.values(routeWorkerUrls)[0];
      if (anyWorkerUrl) {
        // Extract subdomain from URL like: https://scriptname.subdomain.workers.dev
        const urlMatch = anyWorkerUrl.match(
          /https:\/\/[^.]+\.([^.]+)\.workers\.dev/
        );
        if (urlMatch) {
          const subdomain = urlMatch[1];
          routerUrl = `https://${routerName}.${subdomain}.workers.dev`;
        } else {
          throw new Error(
            'Could not extract subdomain pattern from worker URLs'
          );
        }
      } else {
        throw new Error(
          'No worker URLs available to determine subdomain pattern'
        );
      }
    }
  }

  return {
    url: routerUrl,
    scriptName: routerName,
  };
}

async function cleanupRemovedWorkers(
  config: config.Config,
  existingWorkers: string[],
  currentRoutes: FunctionInfo[],
  currentSubscribers: FunctionInfo[],
  progress: ProgressDisplay,
  log: LogMethods
): Promise<void> {
  // Generate current worker names that should exist
  const currentWorkerNames = new Set<string>();

  // Add route worker names
  currentRoutes.forEach((route) => {
    const workerName = generateWorkerName(route.name, config);
    currentWorkerNames.add(workerName);
  });

  // Add subscriber worker names
  currentSubscribers.forEach((subscriber) => {
    const workerName = generateWorkerName(subscriber.name, config);
    currentWorkerNames.add(workerName);
  });

  // Add router worker name if routes exist
  if (currentRoutes.length > 0) {
    const routerName = `${config.projectName}-${config.environment}-router`;
    currentWorkerNames.add(routerName);
  }

  // Find workers to remove (exist in Cloudflare but not in current build)
  const workersToRemove = existingWorkers.filter(
    (workerName) => !currentWorkerNames.has(workerName)
  );

  if (workersToRemove.length === 0) {
    return;
  }

  log.info(
    `Found ${workersToRemove.length} worker(s) to remove from Cloudflare`
  );

  // Add cleanup progress item
  progress.addItem('Cleanup', workersToRemove.length);
  progress.render();

  let cleanedUp = 0;

  // Delete removed workers
  for (const workerName of workersToRemove) {
    try {
      await runWrangler(
        ['delete', '--name', workerName, '--force'],
        process.cwd()
      );
      cleanedUp++;
      progress.updateItem('Cleanup', cleanedUp);
      progress.render();
    } catch (error) {
      // Log but don't fail deployment if cleanup fails
      log.warn(
        `Failed to delete worker ${workerName}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
