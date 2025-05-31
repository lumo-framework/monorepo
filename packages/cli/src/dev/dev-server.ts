import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import { createServer, type Server } from 'http';
import * as chokidar from 'chokidar';
import path from 'path';
import { build } from 'esbuild';
import { promises as fs } from 'fs';
import { loadConfig, http } from '@tsc-run/core';
import type { config } from '@tsc-run/core';
import {
  scanRoutes,
  expandRoutesToMethods,
  scanSubscribers,
} from '../project/route-scanner.js';
import { LocalEventSystem, LocalEventAdapter } from './local-event-system.js';
import { EnhancedDevLogger } from './enhanced-dev-logger.js';
import { RequestAdapter } from './request-adapter.js';
import type { RouteHandlers } from './types.js';

export interface DevServerOptions {
  port: number;
  verbose: boolean;
}

export class DevServer {
  private app: express.Application;
  private server?: Server;
  private eventSystem: LocalEventSystem;
  private logger: EnhancedDevLogger;
  private watcher?: chokidar.FSWatcher;
  private routeHandlers: Map<string, RouteHandlers> = new Map();
  private subscriberHandlers: Map<string, (...args: unknown[]) => unknown> =
    new Map();
  private subscriberNameMap: Map<(...args: unknown[]) => unknown, string> =
    new Map();
  private compiledFiles: Set<string> = new Set();
  private config?: config.Config;

  constructor(private options: DevServerOptions) {
    this.app = express();
    this.logger = new EnhancedDevLogger(options.verbose);
    this.eventSystem = new LocalEventSystem(this.logger);

    this.setupMiddleware();
  }

  async start(): Promise<void> {
    try {
      // Load configuration
      this.config = await this.logger.spinner('Loading configuration', () =>
        loadConfig()
      );

      // Clean up dev cache before starting
      await this.cleanupDevCache();

      // Setup secrets from config for local development
      await this.setupLocalSecrets();

      // Setup event system with config
      this.eventSystem.setConfig(this.config);

      try {
        LocalEventAdapter.setup(this.eventSystem);
      } catch (adapterError) {
        this.logger.warn(
          'Event system adapter setup failed, events may not work properly'
        );
        if (this.options.verbose) {
          this.logger.error(`Adapter error: ${adapterError}`);
        }
      }

      // Initial scan and setup
      await this.scanAndRegisterRoutes();
      await this.scanAndRegisterSubscribers();

      // Setup file watching
      this.setupFileWatching();

      // Start server
      await this.startServer();

      // Set port for metrics display
      this.logger.setPort(this.options.port);

      this.logger.success(
        `🚀 Development server started on http://localhost:${this.options.port}`
      );
      this.logger.info('Press Ctrl+C to stop');
    } catch (error) {
      this.logger.error('Failed to start dev server');
      if (this.options.verbose && error instanceof Error) {
        this.logger.error(`Detailed error: ${error.message}`);
        this.logger.error(`Stack trace: ${error.stack}`);
      }
      throw error;
    }
  }

  async stop(): Promise<void> {
    // Stop metrics display
    this.logger.stopDisplay();

    // Restore original event system
    LocalEventAdapter.restore();

    if (this.watcher) {
      await this.watcher.close();
    }

    if (this.server) {
      this.server.close();
    }
  }

  private setupMiddleware(): void {
    // Disable ETag generation to prevent 304 responses in development
    this.app.set('etag', false);

    // Parse JSON bodies
    this.app.use(express.json());

    // Parse URL-encoded bodies
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging middleware - handled in handleRequest with metrics
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      next();
    });

    // Setup catch-all route handler - use a more specific pattern
    this.app.all('*', this.handleRequest.bind(this));
  }

  private async handleRequest(req: Request, res: Response): Promise<void> {
    const { method } = req;
    // Use originalUrl and parse it to get the clean path
    const requestPath = req.originalUrl.split('?')[0]; // Remove query params
    let statusCode = 200;

    const requestHandler = async () => {
      // Find matching route
      const { handler, params } = this.findMatchingRoute(method, requestPath);

      if (!handler) {
        statusCode = 404;
        res.status(404).json({ error: 'Route not found', path: requestPath });
        return;
      }

      // Convert Express request to tsc-run request
      const tscRequest = RequestAdapter.fromExpress(req, params);

      // Call the handler
      const response = await handler(tscRequest);

      // Get status code from tsc-run response
      if (
        response &&
        typeof response === 'object' &&
        'statusCode' in response
      ) {
        const typedResponse = response as http.Response;
        statusCode = typedResponse.statusCode || 200;
      }

      // Convert tsc-run response to Express response
      RequestAdapter.toExpress(response as http.Response, res);
    };

    try {
      await this.logger.logRequestWithMetrics(
        method,
        requestPath,
        statusCode,
        requestHandler
      );
    } catch (error) {
      statusCode = 500;
      this.logger.error(`Error handling ${method} ${requestPath}: ${error}`);
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private findMatchingRoute(
    method: string,
    requestPath: string
  ): {
    handler?: (...args: unknown[]) => unknown;
    params: Record<string, string>;
  } {
    if (this.options.verbose) {
      this.logger.debug(`Looking for route: ${method} ${requestPath}`);
      this.logger.debug(
        `Available routes: ${Array.from(this.routeHandlers.keys()).join(', ')}`
      );
    }

    // Try exact method match first
    const methodKey = `${method}:${requestPath}`;
    let handlers = this.routeHandlers.get(methodKey);

    if (handlers && handlers[method]) {
      if (this.options.verbose) {
        this.logger.debug(`Found exact match: ${methodKey}`);
      }
      return { handler: handlers[method], params: {} };
    }

    // Try with parameter matching
    for (const [routeKey, routeHandlers] of this.routeHandlers.entries()) {
      const [routeMethod, routePath] = routeKey.split(':', 2);

      if (routeMethod === method || routeMethod === 'ALL') {
        const { match, params } = this.matchRoute(routePath, requestPath);
        if (match) {
          const handler = routeHandlers[method] || routeHandlers['ALL'];
          if (typeof handler === 'function') {
            if (this.options.verbose) {
              this.logger.debug(`Found parameterized match: ${routeKey}`);
            }
            return { handler, params };
          }
        }
      }
    }

    if (this.options.verbose) {
      this.logger.debug(`No matching route found for ${method} ${requestPath}`);
    }
    return { params: {} };
  }

  private matchRoute(
    routePath: string,
    requestPath: string
  ): { match: boolean; params: Record<string, string> } {
    const routeParts = routePath.split('/').filter(Boolean);
    const requestParts = requestPath.split('/').filter(Boolean);

    if (routeParts.length !== requestParts.length) {
      return { match: false, params: {} };
    }

    const params: Record<string, string> = {};

    for (let i = 0; i < routeParts.length; i++) {
      const routePart = routeParts[i];
      const requestPart = requestParts[i];

      if (routePart.startsWith('[') && routePart.endsWith(']')) {
        // Dynamic parameter
        const paramName = routePart.slice(1, -1);
        params[paramName] = requestPart;
      } else if (routePart !== requestPart) {
        return { match: false, params: {} };
      }
    }

    return { match: true, params };
  }

  private async scanAndRegisterRoutes(): Promise<void> {
    try {
      const routes = await scanRoutes();
      const methodRoutes = expandRoutesToMethods(routes);

      this.routeHandlers.clear();

      // Clean up old compiled files
      await this.cleanupOldCompiledFiles();

      for (const methodRoute of methodRoutes) {
        await this.registerRoute(methodRoute);
      }

      this.logger.info(`📁 Loaded ${methodRoutes.length} route handlers`);

      if (this.options.verbose && methodRoutes.length > 0) {
        this.logger.debug('Registered routes:');
        for (const [routeKey] of this.routeHandlers.entries()) {
          this.logger.debug(`  ${routeKey}`);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to scan routes: ${error}`);
    }
  }

  private async registerRoute(methodRoute: {
    file: string;
    exportName: string;
    method: string;
    route: string;
  }): Promise<void> {
    try {
      // Compile TypeScript file on-the-fly for development
      const handler = await this.loadHandler(
        methodRoute.file,
        methodRoute.exportName
      );

      if (typeof handler !== 'function') {
        this.logger.warn(
          `No valid handler found for ${methodRoute.method} ${methodRoute.route}`
        );
        return;
      }

      // Store handler
      const routeKey = `${methodRoute.method}:${methodRoute.route}`;
      const handlers = this.routeHandlers.get(routeKey) || {};
      handlers[methodRoute.method] = handler;
      this.routeHandlers.set(routeKey, handlers);

      if (this.options.verbose) {
        this.logger.debug(
          `Registered ${methodRoute.method} ${methodRoute.route} -> ${methodRoute.file}`
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to register route ${methodRoute.route}: ${error}`
      );
    }
  }

  private async loadHandler(
    filePath: string,
    exportName: string
  ): Promise<((...args: unknown[]) => unknown) | undefined> {
    const resolvedPath = path.resolve(filePath);

    try {
      // Use the EXACT same approach as the working build command
      const tempDir = path.join(process.cwd(), '.tsc-run', 'dev-cache');
      await fs.mkdir(tempDir, { recursive: true });

      // Generate wrapper using the same pattern as build.ts generateLambdaWrapper
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2, 8);
      const wrapperPath = path.join(
        tempDir,
        `temp-${path.basename(filePath, '.ts')}-${exportName}-${timestamp}-${random}-wrapper.ts`
      );
      const outputPath = path.join(
        tempDir,
        `temp-${path.basename(filePath, '.ts')}-${exportName}-${timestamp}-${random}-wrapper.js`
      );

      const wrapperContent = `
import {${exportName} as handler} from '${resolvedPath}';
export { handler };
`;

      await fs.writeFile(wrapperPath, wrapperContent);

      // Get external modules from config only (no default externals for dev server)
      const externalModules = this.config?.build?.exclude || [];

      // Use our own bundler with ESM format for dev server
      await build({
        entryPoints: [wrapperPath],
        bundle: true,
        outfile: outputPath,
        platform: 'node',
        target: 'node18',
        format: 'esm',
        external: externalModules,
        // Use absolute path resolution for @tsc-run packages in workspace
        alias: {
          '@tsc-run/core': path.resolve(
            __dirname,
            '../../../core/dist/index.js'
          ),
        },
        logLevel: 'error',
      });

      // Clean up wrapper file
      await fs.unlink(wrapperPath);

      // Load the compiled module using import
      const module = await import(path.resolve(outputPath));

      // Track compiled files for later cleanup
      this.compiledFiles.add(outputPath);

      return module.handler;
    } catch (error) {
      if (this.options.verbose) {
        this.logger.error(`Failed to load ${filePath}: ${error}`);
      }
      throw error;
    }
  }

  private async scanAndRegisterSubscribers(): Promise<void> {
    try {
      const subscribers = await scanSubscribers();

      // Clear all existing subscriber handlers and event system registrations
      this.subscriberHandlers.clear();
      this.eventSystem.clearSubscribers();

      // Clean up old compiled files
      await this.cleanupOldCompiledFiles();

      for (const subscriber of subscribers) {
        await this.registerSubscriber(subscriber);
      }

      if (subscribers.length > 0) {
        this.logger.info(`📡 Loaded ${subscribers.length} event subscribers`);
      }
    } catch (error) {
      this.logger.error(`Failed to scan subscribers: ${error}`);
    }
  }

  private async registerSubscriber(subscriber: {
    name: string;
    file: string;
  }): Promise<void> {
    try {
      // Compile TypeScript file on-the-fly for development
      const handler =
        (await this.loadHandler(subscriber.file, 'listen')) ||
        (await this.loadHandler(subscriber.file, 'default'));

      if (typeof handler !== 'function') {
        this.logger.warn(
          `No valid listen function found for subscriber ${subscriber.name}`
        );
        return;
      }

      // Store handler and register with event system
      this.subscriberHandlers.set(subscriber.name, handler);
      this.subscriberNameMap.set(handler, subscriber.name);
      this.eventSystem.registerSubscriber(subscriber.name, handler);

      if (this.options.verbose) {
        this.logger.debug(
          `Registered subscriber ${subscriber.name} -> ${subscriber.file}`
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to register subscriber ${subscriber.name}: ${error}`
      );
    }
  }

  private async setupLocalSecrets(): Promise<void> {
    if (!this.config?.secrets) {
      return;
    }

    let secretCount = 0;
    for (const [secretName, secretConfig] of Object.entries(
      this.config.secrets
    )) {
      try {
        // Resolve the secret value (could be string or function)
        const secretValue =
          typeof secretConfig.value === 'function'
            ? await secretConfig.value()
            : secretConfig.value;

        // Set environment variable in uppercase format (matching default resolver)
        const envVarName = secretName.toUpperCase();
        process.env[envVarName] = secretValue;
        secretCount++;

        if (this.options.verbose) {
          this.logger.debug(`Set local secret: ${secretName} -> ${envVarName}`);
        }
      } catch (error) {
        this.logger.warn(`Failed to resolve secret '${secretName}': ${error}`);
      }
    }

    if (secretCount > 0) {
      this.logger.info(`🔐 Set ${secretCount} secrets for local development`);
    }
  }

  private async cleanupDevCache(): Promise<void> {
    try {
      const tempDir = path.join(process.cwd(), '.tsc-run', 'dev-cache');
      await fs.rm(tempDir, { recursive: true, force: true });
      await fs.mkdir(tempDir, { recursive: true });
      this.compiledFiles.clear();
      if (this.options.verbose) {
        this.logger.info('🧹 Cleaned dev cache');
      }
    } catch (error) {
      // Ignore cleanup errors - cache directory might not exist
      if (this.options.verbose) {
        this.logger.warn(`Cache cleanup warning: ${error}`);
      }
    }
  }

  private async cleanupOldCompiledFiles(): Promise<void> {
    try {
      for (const filePath of this.compiledFiles) {
        await fs.unlink(filePath).catch(() => {
          // Ignore errors - file might already be deleted
        });
      }
      this.compiledFiles.clear();
    } catch (error) {
      if (this.options.verbose) {
        this.logger.warn(`Error cleaning up compiled files: ${error}`);
      }
    }
  }

  private setupFileWatching(): void {
    // Use relative paths with cwd option for proper glob pattern support
    const watchPaths = [
      './functions/api/',
      './functions/subscribers/',
      './events/',
    ];

    this.watcher = chokidar
      .watch(watchPaths, {
        ignored: /(^|[\\/\\\\])\\../, // ignore dotfiles
        persistent: true,
        ignoreInitial: true,
        followSymlinks: true,
        awaitWriteFinish: true,
        depth: 5,
      })
      .on('add', (filePath: string) => this.handleFileChange('added', filePath))
      .on('change', (filePath: string) =>
        this.handleFileChange('changed', filePath)
      )
      .on('unlink', (filePath: string) =>
        this.handleFileChange('removed', filePath)
      );

    this.logger.info('👀 Watching for file changes...');
  }

  private async handleFileChange(
    event: string,
    filePath: string
  ): Promise<void> {
    this.logger.logFileChange(event, filePath);

    try {
      if (filePath.includes('functions/api') && filePath.endsWith('.ts')) {
        await this.scanAndRegisterRoutes();
      } else if (
        filePath.includes('functions/subscribers') &&
        filePath.endsWith('.ts')
      ) {
        await this.scanAndRegisterSubscribers();
      } else if (filePath.includes('tsc-run.config')) {
        // Reload config
        this.config = await loadConfig();
        await this.setupLocalSecrets();
        this.eventSystem.setConfig(this.config);
        await this.scanAndRegisterSubscribers();
      }
    } catch (error) {
      this.logger.error(`Error reloading after file change: ${error}`);
    }
  }

  private startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer(this.app);

      this.server.listen(this.options.port, (error?: Error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });

      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        this.logger.info('\n👋 Shutting down development server...');
        await this.stop();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        await this.stop();
        process.exit(0);
      });
    });
  }
}
