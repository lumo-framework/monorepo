import { log, chalk } from '@lumo-framework/utils';
import { MetricsDisplay } from './metrics-display.js';
import {
  PerformanceTracker,
  PerformanceMetrics,
} from './performance-metrics.js';

export class EnhancedDevLogger {
  private metricsDisplay: MetricsDisplay;
  private performanceTracker: PerformanceTracker;
  private displayInterval?: NodeJS.Timeout;
  private verbose: boolean;
  private port: number = 3000;
  private displayActive: boolean = false;
  private originalConsoleLog?: typeof console.log;
  private originalConsoleError?: typeof console.error;
  private originalConsoleWarn?: typeof console.warn;
  private shutdownCallback?: () => Promise<void>;

  constructor(verbose: boolean = false) {
    this.verbose = verbose;
    this.metricsDisplay = new MetricsDisplay();
    this.performanceTracker = new PerformanceTracker();
    // Assume display will be active by default for dev server
    this.displayActive = true;
  }

  setPort(port: number): void {
    this.port = port;
  }

  setShutdownCallback(callback: () => Promise<void>): void {
    this.shutdownCallback = callback;
    this.metricsDisplay.setShutdownCallback(callback);
  }

  startDisplay(): void {
    // Mark as active FIRST to prevent any more console logs
    this.displayActive = true;

    // Intercept console logs globally
    this.interceptConsole();

    // Set up keyboard input
    this.metricsDisplay.setupKeyboardInput((key: string) => {
      // Handle any additional keys here if needed
      if (key === 'r') {
        // Force immediate refresh
        this.metricsDisplay.updateDisplay(this.port);
      }
    });

    // Clear screen immediately and show initial display
    process.stdout.write('\x1B[2J\x1B[H');
    this.metricsDisplay.updateDisplay(this.port);

    // Update every 1 second
    this.displayInterval = setInterval(() => {
      this.metricsDisplay.updateDisplay(this.port);
    }, 1000);
  }

  stopDisplay(): void {
    this.displayActive = false;

    // Restore original console functions
    this.restoreConsole();

    if (this.displayInterval) {
      clearInterval(this.displayInterval);
      this.displayInterval = undefined;
    }
    this.metricsDisplay.cleanup();
  }

  success(message: string): void {
    // For startup messages, start display immediately
    if (message.includes('Development server started')) {
      console.log(chalk.green('✅'), message);
      // Start display immediately instead of waiting
      setTimeout(() => {
        this.startDisplay();
      }, 500);
    } else {
      if (this.verbose && !this.displayActive) {
        console.log(chalk.green('✅'), message);
      }
    }
  }

  error(message: string): void {
    // Only stop display for critical startup/shutdown errors
    if (
      message.includes('Failed to start dev server') ||
      message.includes('Failed to scan')
    ) {
      this.stopDisplay();
      log.error(message);
    } else {
      // For request handling errors, just log to the metrics display
      this.metricsDisplay.addLog('error', message, [message]);
    }
  }

  warn(message: string): void {
    if (this.verbose && !this.displayActive) {
      console.log(chalk.yellow('⚠️'), message);
    }
  }

  info(message: string): void {
    if (this.verbose && !this.displayActive) {
      console.log(chalk.blue('ℹ️'), message);
    }
  }

  debug(message: string): void {
    if (this.verbose && !this.displayActive) {
      console.log(chalk.blackBright('🔍'), chalk.blackBright(message));
    }
  }

  async spinner<T>(label: string, fn: () => Promise<T>): Promise<T> {
    return log.spinner(label, fn);
  }

  async logRequestWithMetrics(
    method: string,
    path: string,
    requestHandler: () => Promise<unknown>
  ): Promise<unknown> {
    const routeKey = `${method}:${path}`;
    let statusCode = 200;

    // Set the route context for log capture
    this.metricsDisplay.setRouteContext(routeKey);

    // Add a debug log to test if context is working
    this.metricsDisplay.addLog(
      'log',
      `Route ${routeKey} started`,
      [],
      undefined,
      routeKey
    );

    try {
      const { result, metrics } =
        await this.performanceTracker.executeWithMetrics(
          requestHandler,
          routeKey
        );

      // Extract status code from result if available
      if (result && typeof result === 'object' && 'statusCode' in result) {
        statusCode = (result as { statusCode: number }).statusCode;
      }

      // Clear the route context
      this.metricsDisplay.setRouteContext(undefined);

      // Update metrics display
      this.metricsDisplay.updateRouteMetrics(method, path, metrics, statusCode);

      // Legacy verbose logging (only when display is not active)
      if (this.verbose && !this.displayActive) {
        const methodColor = this.getMethodColor(method);
        const statusColor = this.getStatusColor(statusCode);
        const prefix = chalk.blue('[API]');

        console.log(
          `${prefix} ${methodColor(method.padEnd(6))} ${path} -> ${statusColor(String(statusCode))} ${chalk.blackBright(`(${Math.round(metrics.wallTime)}ms)`)}`
        );
      }

      return result;
    } catch (error) {
      statusCode = 500;

      // Clear the route context
      this.metricsDisplay.setRouteContext(undefined);

      // Create error metrics for display
      const errorMetrics = {
        wallTime: 0,
        memoryUsed: 0,
        cpuTime: 0,
        cpuEfficiency: 0,
        estimatedLambdaCost: 0,
        estimatedLambdaTime: '~0ms',
        timestamp: new Date(),
      };

      // Update metrics display with error status
      this.metricsDisplay.updateRouteMetrics(
        method,
        path,
        errorMetrics,
        statusCode
      );

      // Log the error to metrics display
      this.metricsDisplay.addLog(
        'error',
        `Error in ${routeKey}: ${error instanceof Error ? error.message : String(error)}`,
        [error],
        undefined,
        routeKey
      );

      throw error;
    }
  }

  async logEventWithMetrics(
    type: string,
    subscriberCount: number,
    eventHandler: () => Promise<void>
  ): Promise<void> {
    const { metrics } = await this.performanceTracker.executeWithMetrics(
      eventHandler,
      `event:${type}`
    );

    // Update metrics display
    this.metricsDisplay.updateEventMetrics(type, metrics);

    // Legacy verbose logging (only when display is not active)
    if (this.verbose && !this.displayActive) {
      const prefix = chalk.magenta('[EVENT]');
      console.log(
        `${prefix} ${chalk.cyan(type)} -> ${chalk.yellow(`${subscriberCount} subscribers queued`)}`
      );
    }
  }

  async logSubscriberWithMetrics(
    name: string,
    eventType: string,
    subscriberHandler: () => Promise<void>
  ): Promise<{ success: boolean; duration: number; error?: string }> {
    let error: string | undefined;
    const subscriberKey = `subscriber:${name}`;

    try {
      // Set the route context for log capture right before execution
      this.metricsDisplay.setRouteContext(subscriberKey);

      // Add a debug log to test if context is working
      this.metricsDisplay.addLog(
        'log',
        `Subscriber ${name} started for event ${eventType}`,
        [],
        undefined,
        subscriberKey
      );

      const { metrics } = await this.performanceTracker.executeWithMetrics(
        subscriberHandler,
        subscriberKey
      );

      // Update metrics display
      this.metricsDisplay.updateSubscriberMetrics(
        name,
        eventType,
        metrics,
        true
      );

      // Legacy verbose logging (only when display is not active)
      if (this.verbose && !this.displayActive) {
        const prefix = chalk.green('[SUBSCRIBER]');
        const status = chalk.green('completed');
        console.log(
          `${prefix} ${chalk.cyan(name)} -> ${status} ${chalk.blackBright(`(${Math.round(metrics.wallTime)}ms)`)}`
        );
      }

      // Clear the route context
      this.metricsDisplay.setRouteContext(undefined);

      return { success: true, duration: metrics.wallTime };
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);

      // Create error metrics for display
      const errorMetrics: PerformanceMetrics = {
        wallTime: 0,
        memoryUsed: 0,
        cpuTime: 0,
        cpuEfficiency: 0,
        estimatedLambdaCost: 0,
        estimatedLambdaTime: '~0ms',
        timestamp: new Date(),
      };

      // Update metrics display
      this.metricsDisplay.updateSubscriberMetrics(
        name,
        eventType,
        errorMetrics,
        false
      );

      // Legacy verbose logging (only when display is not active)
      if (this.verbose && !this.displayActive) {
        const prefix = chalk.green('[SUBSCRIBER]');
        const status = chalk.red('failed');
        let message = `${prefix} ${chalk.cyan(name)} -> ${status}`;
        if (error) {
          message += `\n${chalk.red('  Error:')} ${error}`;
        }
        console.log(message);
      }

      // Clear the route context
      this.metricsDisplay.setRouteContext(undefined);

      return { success: false, duration: 0, error };
    }
  }

  logFileChange(event: string, filePath: string): void {
    // Mark hot reloaded routes/subscribers
    if (filePath.includes('functions/api')) {
      // Mark all routes as hot reloaded - we'll clear this flag on next refresh
      this.metricsDisplay.refresh();
    } else if (filePath.includes('functions/subscribers')) {
      // Mark all subscribers as hot reloaded
      this.metricsDisplay.refresh();
    }

    // Legacy verbose logging (only when display is not active)
    if (this.verbose && !this.displayActive) {
      const prefix = chalk.yellow('[WATCH]');
      const eventColor =
        event === 'added'
          ? chalk.green
          : event === 'removed'
            ? chalk.red
            : chalk.blue;

      console.log(`${prefix} ${filePath} -> ${eventColor(event)}`);
    }
  }

  private getMethodColor(method: string): (text: string) => string {
    switch (method.toUpperCase()) {
      case 'GET':
        return chalk.green;
      case 'POST':
        return chalk.yellow;
      case 'PUT':
        return chalk.blue;
      case 'PATCH':
        return chalk.cyan;
      case 'DELETE':
        return chalk.red;
      default:
        return chalk.blackBright;
    }
  }

  private getStatusColor(statusCode: number): (text: string) => string {
    if (statusCode >= 200 && statusCode < 300) {
      return chalk.green;
    } else if (statusCode >= 300 && statusCode < 400) {
      return chalk.yellow;
    } else if (statusCode >= 400 && statusCode < 500) {
      return chalk.red;
    } else {
      return chalk.magenta;
    }
  }

  private interceptConsole(): void {
    // Store original console functions
    this.originalConsoleLog = console.log;
    this.originalConsoleError = console.error;
    this.originalConsoleWarn = console.warn;

    // Replace console functions to capture logs when display is active
    console.log = (...args: unknown[]) => {
      // Capture function logs for metrics display
      this.metricsDisplay.addLog('log', this.formatLogMessage(args), args);

      // Check if this is an event dispatch call that the LocalEventAdapter needs
      if (
        args.length >= 3 &&
        args[0] === 'Event dispatched' &&
        typeof args[1] === 'string'
      ) {
        // Allow event dispatch messages through for the LocalEventAdapter
        if (this.originalConsoleLog) {
          this.originalConsoleLog.apply(console, args);
        }
        return;
      }

      // Capture error messages but don't display them directly
      const message = args.join(' ');
      if (
        message.includes('Error:') ||
        message.includes('error') ||
        message.includes('Error handling')
      ) {
        // Log to metrics display instead of console
        this.metricsDisplay.addLog('error', this.formatLogMessage(args), args);
        return;
      }

      // Suppress everything else (including [API], [EVENT], [SUBSCRIBER] logs) from terminal
    };

    console.error = (...args: unknown[]) => {
      // Capture error logs for metrics display
      this.metricsDisplay.addLog('error', this.formatLogMessage(args), args);

      // Don't let errors leak outside the table display when active
      // They will be shown in logs mode or when display is stopped
    };

    console.warn = (...args: unknown[]) => {
      // Capture warning logs for metrics display
      this.metricsDisplay.addLog('warn', this.formatLogMessage(args), args);

      // Suppress warnings from terminal when display is active
    };
  }

  private formatLogMessage(args: unknown[]): string {
    return args
      .map((arg) => {
        if (typeof arg === 'string') return arg;
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, null, 2);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      })
      .join(' ');
  }

  private restoreConsole(): void {
    if (this.originalConsoleLog) {
      console.log = this.originalConsoleLog;
    }
    if (this.originalConsoleError) {
      console.error = this.originalConsoleError;
    }
    if (this.originalConsoleWarn) {
      console.warn = this.originalConsoleWarn;
    }
  }
}
