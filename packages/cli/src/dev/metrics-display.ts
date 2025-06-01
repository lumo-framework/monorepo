import Table from 'cli-table3';
import chalk from 'chalk';
import {
  RouteMetrics,
  EventMetrics,
  SubscriberMetrics,
  PerformanceMetrics,
} from './performance-metrics.js';

export interface MetricsDisplayOptions {
  maxRoutes?: number;
  maxEvents?: number;
  maxSubscribers?: number;
  maxRecentRequests?: number;
  maxLogs?: number;
  showHelp?: boolean;
}

export interface RecentRequest {
  method: string;
  path: string;
  statusCode: number;
  duration: number;
  timestamp: Date;
  warningIndicator?: string;
}

export interface LogEntry {
  timestamp: Date;
  level: 'log' | 'error' | 'warn';
  functionName?: string;
  routeKey?: string;
  message: string;
  args: unknown[];
}

export class MetricsDisplay {
  private routeMetrics: Map<string, RouteMetrics> = new Map();
  private eventMetrics: Map<string, EventMetrics> = new Map();
  private subscriberMetrics: Map<string, SubscriberMetrics> = new Map();
  private recentRequests: RecentRequest[] = [];
  private logs: LogEntry[] = [];
  private options: Required<MetricsDisplayOptions>;
  private helpMode: boolean = false;
  private logsMode: boolean = false;
  private currentRouteContext?: string;
  private lastDisplayHeight: number = 0;
  private lastDisplayContent: string = '';
  private shutdownCallback?: () => Promise<void>;

  constructor(options: MetricsDisplayOptions = {}) {
    this.options = {
      maxRoutes: options.maxRoutes ?? 10,
      maxEvents: options.maxEvents ?? 10,
      maxSubscribers: options.maxSubscribers ?? 10,
      maxRecentRequests: options.maxRecentRequests ?? 5,
      maxLogs: options.maxLogs ?? 100,
      showHelp: options.showHelp ?? false,
    };
  }

  updateRouteMetrics(
    method: string,
    path: string,
    metrics: PerformanceMetrics,
    statusCode: number,
    hotReloaded: boolean = false
  ): void {
    const routeKey = `${method}:${path}`;
    const existing = this.routeMetrics.get(routeKey);

    const requestCount = (existing?.requestCount ?? 0) + 1;
    const prevAvgTime = existing?.averageMetrics.responseTime ?? 0;
    const prevAvgMemory = existing?.averageMetrics.memoryUsage ?? 0;
    const prevAvgCpu = existing?.averageMetrics.cpuUsage ?? 0;

    // Calculate rolling averages
    const avgResponseTime =
      requestCount === 1
        ? metrics.wallTime
        : (prevAvgTime * (requestCount - 1) + metrics.wallTime) / requestCount;
    const avgMemoryUsage =
      requestCount === 1
        ? metrics.memoryUsed
        : (prevAvgMemory * (requestCount - 1) + metrics.memoryUsed) /
          requestCount;
    const avgCpuUsage =
      requestCount === 1
        ? metrics.cpuEfficiency
        : (prevAvgCpu * (requestCount - 1) + metrics.cpuEfficiency) /
          requestCount;

    this.routeMetrics.set(routeKey, {
      path,
      method,
      lastStatus: statusCode,
      lastResponseTime: metrics.wallTime,
      lastMemoryUsage: metrics.memoryUsed,
      lastCpuUsage: metrics.cpuEfficiency,
      estimatedLambdaCost: metrics.estimatedLambdaCost,
      estimatedLambdaTime: metrics.estimatedLambdaTime,
      lastCalled: metrics.timestamp,
      hotReloaded,
      averageMetrics: {
        responseTime: avgResponseTime,
        memoryUsage: avgMemoryUsage,
        cpuUsage: avgCpuUsage,
      },
      requestCount,
    });

    // Also add to recent requests
    this.addRecentRequest(
      method,
      path,
      statusCode,
      metrics.wallTime,
      metrics.timestamp
    );
  }

  updateEventMetrics(eventType: string, metrics: PerformanceMetrics): void {
    const existing = this.eventMetrics.get(eventType);
    const count = (existing?.count ?? 0) + 1;

    const avgTime =
      count === 1
        ? metrics.wallTime
        : ((existing?.averageTime ?? 0) * (count - 1) + metrics.wallTime) /
          count;
    const avgMemory =
      count === 1
        ? metrics.memoryUsed
        : ((existing?.averageMemory ?? 0) * (count - 1) + metrics.memoryUsed) /
          count;

    this.eventMetrics.set(eventType, {
      type: eventType,
      count,
      averageTime: avgTime,
      averageMemory: avgMemory,
      totalEstimatedCost:
        (existing?.totalEstimatedCost ?? 0) + metrics.estimatedLambdaCost,
      lastEmitted: metrics.timestamp,
    });
  }

  updateSubscriberMetrics(
    name: string,
    eventType: string,
    metrics: PerformanceMetrics,
    success: boolean,
    hotReloaded: boolean = false
  ): void {
    this.subscriberMetrics.set(name, {
      name,
      eventType,
      lastStatus: success ? 'success' : 'error',
      lastExecutionTime: metrics.wallTime,
      lastMemoryUsage: metrics.memoryUsed,
      lastCpuUsage: metrics.cpuEfficiency,
      estimatedCost: metrics.estimatedLambdaCost,
      lastRun: metrics.timestamp,
      hotReloaded,
    });
  }

  markRouteHotReloaded(method: string, path: string): void {
    const routeKey = `${method}:${path}`;
    const existing = this.routeMetrics.get(routeKey);
    if (existing) {
      existing.hotReloaded = true;
      this.routeMetrics.set(routeKey, existing);
    }
  }

  markSubscriberHotReloaded(name: string): void {
    const existing = this.subscriberMetrics.get(name);
    if (existing) {
      existing.hotReloaded = true;
      this.subscriberMetrics.set(name, existing);
    }
  }

  addRecentRequest(
    method: string,
    path: string,
    statusCode: number,
    duration: number,
    timestamp: Date
  ): void {
    const warningIndicator = this.getRequestWarning(duration, statusCode);

    this.recentRequests.unshift({
      method,
      path,
      statusCode,
      duration,
      timestamp,
      warningIndicator,
    });

    // Keep only the last N requests
    if (this.recentRequests.length > this.options.maxRecentRequests) {
      this.recentRequests = this.recentRequests.slice(
        0,
        this.options.maxRecentRequests
      );
    }
  }

  private getRequestWarning(duration: number, statusCode: number): string {
    if (statusCode >= 500) return '❌';
    if (statusCode >= 400) return '⚠️';
    if (duration > 2500) return '⚠️';
    if (duration > 500) return '🐌';
    return '';
  }

  addLog(
    level: 'log' | 'error' | 'warn',
    message: string,
    args: unknown[] = [],
    functionName?: string,
    routeKey?: string
  ): void {
    const logEntry: LogEntry = {
      timestamp: new Date(),
      level,
      functionName: functionName || this.currentRouteContext,
      routeKey: routeKey || this.currentRouteContext,
      message,
      args,
    };

    this.logs.unshift(logEntry);

    // Keep only the last N logs
    if (this.logs.length > this.options.maxLogs) {
      this.logs = this.logs.slice(0, this.options.maxLogs);
    }
  }

  setRouteContext(routeKey?: string): void {
    this.currentRouteContext = routeKey;
  }

  toggleLogsMode(): void {
    this.logsMode = !this.logsMode;
    // Force content change to trigger redraw
    this.lastDisplayContent = '';
  }

  clear(): void {
    this.routeMetrics.clear();
    this.eventMetrics.clear();
    this.subscriberMetrics.clear();
    this.recentRequests = [];
    this.logs = [];
    // Force content change to trigger redraw
    this.lastDisplayContent = '';
  }

  refresh(): void {
    // Reset hot reload flags
    for (const [key, route] of this.routeMetrics.entries()) {
      route.hotReloaded = false;
      this.routeMetrics.set(key, route);
    }
    for (const [key, subscriber] of this.subscriberMetrics.entries()) {
      subscriber.hotReloaded = false;
      this.subscriberMetrics.set(key, subscriber);
    }
    // Clear recent requests on refresh
    this.recentRequests = [];
    // Force content change to trigger redraw
    this.lastDisplayContent = '';
  }

  updateDisplay(port: number): void {
    let newContent: string;

    if (this.helpMode) {
      newContent = this.buildHelpContent();
    } else if (this.logsMode) {
      newContent = this.buildLogsContent(port);
    } else {
      newContent = this.buildDisplayContent(port);
    }

    // Only update if content has changed
    if (newContent !== this.lastDisplayContent) {
      // Move cursor to top and clear only what we need
      if (this.lastDisplayHeight > 0) {
        // Move cursor to top
        process.stdout.write('\x1B[H');
        // Clear from cursor to end of screen
        process.stdout.write('\x1B[J');
      } else {
        // First time, clear entire screen
        process.stdout.write('\x1B[2J\x1B[H');
      }

      // Write new content
      process.stdout.write(newContent);

      // Update tracking variables
      this.lastDisplayContent = newContent;
      this.lastDisplayHeight = newContent.split('\n').length;
    }
  }

  private buildDisplayContent(port: number): string {
    let content = '';

    // Header
    content += chalk.cyan.bold(
      `🚀 tsc.run dev server running on http://localhost:${port}\n\n`
    );

    // Recent Requests (live activity)
    content += this.buildRecentRequestsTable() + '\n';

    // Tables
    content += this.buildRoutesTable() + '\n';
    content += this.buildEventsTable() + '\n';
    content += this.buildSubscribersTable() + '\n';

    // Footer
    content += chalk.blackBright(
      'Lambda time estimates are approximate and vary by CPU architecture, memory allocation, and runtime environment\n\n'
    );
    content += chalk.blackBright(
      '💡 Development Metrics - Use for relative comparison and optimization guidance\n'
    );
    content += chalk.blackBright(
      "📋 Press 'l' for logs • 'r' to refresh • 'c' to clear • 'q' to quit • 'h' for help"
    );

    return content;
  }

  private buildRecentRequestsTable(): string {
    const table = new Table({
      head: [
        chalk.green.bold('Recent Requests'),
        chalk.green.bold('Method'),
        chalk.green.bold('Status'),
        chalk.green.bold('Duration'),
        chalk.green.bold('Time'),
        chalk.green.bold(''),
      ],
      colWidths: [35, 8, 8, 12, 12, 8],
      style: { head: [] },
    });

    if (this.recentRequests.length === 0) {
      table.push([
        { colSpan: 6, content: chalk.blackBright('No requests yet') },
      ]);
    } else {
      this.recentRequests.forEach((request) => {
        const statusColor = this.getStatusColor(request.statusCode);
        const methodColor = this.getMethodColor(request.method);
        const timeColor = request.duration > 500 ? chalk.yellow : chalk.white;

        table.push([
          this.truncate(request.path, 33),
          methodColor(request.method),
          statusColor(request.statusCode.toString()),
          timeColor(`${Math.round(request.duration)}ms`),
          chalk.blackBright(this.formatTime(request.timestamp)),
          request.warningIndicator || '',
        ]);
      });
    }

    return table.toString();
  }

  private buildRoutesTable(): string {
    const table = new Table({
      head: [
        chalk.cyan.bold('Path'),
        chalk.cyan.bold('Method'),
        chalk.cyan.bold('Status'),
        chalk.cyan.bold('Time'),
        chalk.cyan.bold('Memory'),
        chalk.cyan.bold('CPU%'),
        chalk.cyan.bold('Est. Lambda*'),
        chalk.cyan.bold('Last Called'),
        chalk.cyan.bold(''),
      ],
      colWidths: [25, 8, 8, 10, 10, 8, 15, 15, 12],
      style: { head: [] },
    });

    const routes = Array.from(this.routeMetrics.values())
      .sort((a, b) => b.lastCalled.getTime() - a.lastCalled.getTime())
      .slice(0, this.options.maxRoutes);

    if (routes.length === 0) {
      table.push([
        { colSpan: 9, content: chalk.blackBright('No routes called yet') },
      ]);
    } else {
      routes.forEach((route) => {
        const warning = this.getRouteWarning(route);
        const statusColor = this.getStatusColor(route.lastStatus);
        const timeColor =
          route.lastResponseTime > 500 ? chalk.yellow : chalk.white;
        const memoryColor =
          route.lastMemoryUsage > 100 ? chalk.yellow : chalk.white;
        const cpuColor = route.lastCpuUsage > 80 ? chalk.yellow : chalk.white;

        table.push([
          this.truncate(route.path, 23),
          this.getMethodColor(route.method)(route.method),
          statusColor(route.lastStatus.toString()),
          timeColor(`${Math.round(route.lastResponseTime)}ms`),
          memoryColor(`${Math.round(route.lastMemoryUsage)}MB`),
          cpuColor(`${Math.round(route.lastCpuUsage)}%`),
          chalk.cyan(route.estimatedLambdaTime),
          chalk.blackBright(this.formatTime(route.lastCalled)),
          route.hotReloaded ? '🔄' : warning || '',
        ]);
      });
    }

    return table.toString();
  }

  private buildEventsTable(): string {
    const table = new Table({
      head: [
        chalk.cyan.bold('Event Type'),
        chalk.cyan.bold('Count'),
        chalk.cyan.bold('Avg Time'),
        chalk.cyan.bold('Avg Memory'),
        chalk.cyan.bold('Last Emitted'),
      ],
      colWidths: [25, 8, 12, 12, 20],
      style: { head: [] },
    });

    const events = Array.from(this.eventMetrics.values())
      .sort((a, b) => b.lastEmitted.getTime() - a.lastEmitted.getTime())
      .slice(0, this.options.maxEvents);

    if (events.length === 0) {
      table.push([
        { colSpan: 5, content: chalk.blackBright('No events emitted yet') },
      ]);
    } else {
      events.forEach((event) => {
        table.push([
          chalk.cyan(this.truncate(event.type, 23)),
          chalk.white(event.count.toString()),
          chalk.white(`${Math.round(event.averageTime)}ms`),
          chalk.white(`${Math.round(event.averageMemory)}MB`),
          chalk.blackBright(this.formatTime(event.lastEmitted)),
        ]);
      });
    }

    return table.toString();
  }

  private buildSubscribersTable(): string {
    const table = new Table({
      head: [
        chalk.cyan.bold('Subscriber'),
        chalk.cyan.bold('Event'),
        chalk.cyan.bold('Status'),
        chalk.cyan.bold('Time'),
        chalk.cyan.bold('Memory'),
        chalk.cyan.bold('CPU%'),
        chalk.cyan.bold('Last Run'),
        chalk.cyan.bold(''),
      ],
      colWidths: [20, 20, 8, 10, 10, 8, 15, 10],
      style: { head: [] },
    });

    const subscribers = Array.from(this.subscriberMetrics.values())
      .sort((a, b) => b.lastRun.getTime() - a.lastRun.getTime())
      .slice(0, this.options.maxSubscribers);

    if (subscribers.length === 0) {
      table.push([
        {
          colSpan: 8,
          content: chalk.blackBright('No subscribers executed yet'),
        },
      ]);
    } else {
      subscribers.forEach((subscriber) => {
        const warning = this.getSubscriberWarning(subscriber);
        const statusIcon = subscriber.lastStatus === 'success' ? '✅' : '❌';
        const timeColor =
          subscriber.lastExecutionTime > 500 ? chalk.yellow : chalk.white;
        const memoryColor =
          subscriber.lastMemoryUsage > 100 ? chalk.yellow : chalk.white;
        const cpuColor =
          subscriber.lastCpuUsage > 80 ? chalk.yellow : chalk.white;

        table.push([
          chalk.cyan(this.truncate(subscriber.name, 18)),
          this.truncate(subscriber.eventType, 18),
          statusIcon,
          timeColor(`${Math.round(subscriber.lastExecutionTime)}ms`),
          memoryColor(`${Math.round(subscriber.lastMemoryUsage)}MB`),
          cpuColor(`${Math.round(subscriber.lastCpuUsage)}%`),
          chalk.blackBright(this.formatTime(subscriber.lastRun)),
          subscriber.hotReloaded ? '🔄' : warning || '',
        ]);
      });
    }

    return table.toString();
  }

  private buildHelpContent(): string {
    const helpTable = new Table({
      style: { head: [], border: [] },
      colWidths: [80],
    });

    helpTable.push(
      [
        chalk.cyan.bold(
          '┌─ HELP: Performance Metrics ─────────────────────────────────────────────┐'
        ),
      ],
      [
        chalk.cyan.bold(
          '│                                                                          │'
        ),
      ],
      [
        chalk.cyan.bold(
          '│ 📊 METRICS EXPLAINED                                                     │'
        ),
      ],
      [
        chalk.white(
          '│ • Time: Local execution time (actual Lambda may vary ±30%)              │'
        ),
      ],
      [
        chalk.white(
          '│ • Memory: Heap memory usage delta during execution                      │'
        ),
      ],
      [
        chalk.white(
          '│ • CPU%: CPU utilization during execution                                │'
        ),
      ],
      [
        chalk.white(
          '│ • Est. Lambda: Estimated range based on your system                     │'
        ),
      ],
      [
        chalk.white(
          '│ • Cost: Approximate AWS Lambda cost per request                         │'
        ),
      ],
      [
        chalk.cyan.bold(
          '│                                                                          │'
        ),
      ],
      [
        chalk.cyan.bold(
          '│ ⚠️  WARNING INDICATORS                                                   │'
        ),
      ],
      [
        chalk.yellow(
          '│ • 🔥 Expensive: >$0.01 per request                                      │'
        ),
      ],
      [
        chalk.yellow(
          '│ • ⚠️ Timeout: >2.5s (risks 3s Lambda timeout)                          │'
        ),
      ],
      [
        chalk.yellow(
          '│ • 💧 Memory: >100MB usage                                               │'
        ),
      ],
      [
        chalk.yellow(
          '│ • 🐌 Slow: >500ms response time                                         │'
        ),
      ],
      [
        chalk.blue(
          '│ • 🔄 Hot reload: Function recently reloaded                             │'
        ),
      ],
      [
        chalk.cyan.bold(
          '│                                                                          │'
        ),
      ],
      [
        chalk.cyan.bold(
          '│ 💡 OPTIMIZATION TIPS                                                     │'
        ),
      ],
      [
        chalk.white(
          '│ • High memory: Check for memory leaks, large objects                    │'
        ),
      ],
      [
        chalk.white(
          '│ • High CPU: Consider caching, algorithm optimization                    │'
        ),
      ],
      [
        chalk.white(
          '│ • Slow responses: Profile bottlenecks, add async processing             │'
        ),
      ],
      [
        chalk.white(
          '│ • Expensive functions: Optimize or consider usage-based pricing         │'
        ),
      ],
      [
        chalk.cyan.bold(
          '│                                                                          │'
        ),
      ],
      [
        chalk.blackBright(
          '│ Press any key to return to metrics view                                 │'
        ),
      ],
      [
        chalk.cyan.bold(
          '└──────────────────────────────────────────────────────────────────────┘'
        ),
      ]
    );

    return helpTable.toString();
  }

  private buildLogsContent(port: number): string {
    let content = '';

    // Header
    content += chalk.cyan.bold(
      `📋 tsc.run logs - http://localhost:${port} (${this.logs.length} logs)`
    );
    content += chalk.blackBright(
      " • Press 'l' to toggle • 'r' refresh • 'c' clear • 'q' quit\n\n"
    );

    // Show logs as a clean stream
    if (this.logs.length === 0) {
      content += chalk.blackBright('No logs captured yet\n');
    } else {
      this.logs.slice(0, 40).forEach((log) => {
        const levelColor = this.getLogLevelColor(log.level);
        const timeStr = this.formatLogTime(log.timestamp);
        const functionName = log.routeKey || log.functionName || 'system';

        content += chalk.blackBright(`[${timeStr}] `);
        content += levelColor(`${log.level.toUpperCase().padEnd(5)} `);
        content += chalk.cyan(`${this.truncate(functionName, 20).padEnd(20)} `);
        content += `${log.message}\n`;
      });
    }

    return content;
  }

  private buildLogsTable(): string {
    const table = new Table({
      head: [
        chalk.yellow.bold('Time'),
        chalk.yellow.bold('Level'),
        chalk.yellow.bold('Function'),
        chalk.yellow.bold('Message'),
      ],
      colWidths: [12, 8, 25, 60],
      style: { head: [] },
    });

    if (this.logs.length === 0) {
      table.push([
        { colSpan: 4, content: chalk.blackBright('No logs captured yet') },
      ]);
    } else {
      this.logs.slice(0, 30).forEach((log) => {
        const levelColor = this.getLogLevelColor(log.level);
        const timeStr = this.formatTime(log.timestamp);
        const functionName = log.routeKey || log.functionName || 'system';

        table.push([
          chalk.blackBright(timeStr),
          levelColor(log.level.toUpperCase()),
          chalk.cyan(this.truncate(functionName, 23)),
          this.truncate(log.message, 58),
        ]);
      });
    }

    return table.toString();
  }

  private getLogLevelColor(level: string): (text: string) => string {
    switch (level) {
      case 'error':
        return chalk.red;
      case 'warn':
        return chalk.yellow;
      case 'log':
      default:
        return chalk.white;
    }
  }

  setShutdownCallback(callback: () => Promise<void>): void {
    this.shutdownCallback = callback;
  }

  setupKeyboardInput(onKeyPress?: (key: string) => void): void {
    // Only setup keyboard input if we're in a TTY
    if (!process.stdin.isTTY) {
      return;
    }

    try {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');

      process.stdin.on('data', (key: string) => {
        const handled = this.handleKeyPress(key);
        if (!handled && onKeyPress) {
          onKeyPress(key);
        }
      });
    } catch {
      // Silently ignore keyboard setup errors in non-interactive environments
    }
  }

  private handleKeyPress(key: string): boolean {
    switch (key.toLowerCase()) {
      case 'h':
        this.helpMode = !this.helpMode;
        if (this.helpMode) {
          this.logsMode = false; // Exit logs mode when entering help
        }
        // Force content change to trigger redraw
        this.lastDisplayContent = '';
        return true;
      case 'l':
        this.toggleLogsMode();
        if (this.logsMode) {
          this.helpMode = false; // Exit help mode when entering logs
        }
        return true;
      case 'r':
        this.refresh();
        return true;
      case 'c':
        this.clear();
        return true;
      case 'q':
      case '\u0003': // Ctrl+C
        if (this.shutdownCallback) {
          // Trigger graceful shutdown
          this.shutdownCallback().catch(() => {
            // If graceful shutdown fails, fallback to immediate exit
            this.cleanup();
            process.exit(1);
          });
        } else {
          // Fallback to immediate exit if no callback is set
          this.cleanup();
          process.exit(0);
        }
        return true;
      default:
        if (this.helpMode || this.logsMode) {
          this.helpMode = false;
          this.logsMode = false;
          // Force content change to trigger redraw
          this.lastDisplayContent = '';
          return true;
        }
        return false;
    }
  }

  cleanup(): void {
    if (process.stdin.isTTY) {
      try {
        process.stdin.setRawMode(false);
        process.stdin.pause();
      } catch {
        // Ignore cleanup errors
      }
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
    if (statusCode >= 200 && statusCode < 300) return chalk.green;
    if (statusCode >= 300 && statusCode < 400) return chalk.yellow;
    if (statusCode >= 400 && statusCode < 500) return chalk.red;
    return chalk.magenta;
  }

  private getRouteWarning(route: RouteMetrics): string {
    if (route.lastResponseTime > 2500) return '⚠️ Timeout';
    if (route.estimatedLambdaCost > 0.01) return '🔥 Expensive';
    if (route.lastMemoryUsage > 100) return '💧 Memory';
    if (route.lastResponseTime > 500) return '🐌 Slow';
    if (route.lastCpuUsage > 80) return '🔥 CPU';
    return '';
  }

  private getSubscriberWarning(subscriber: SubscriberMetrics): string {
    if (subscriber.lastExecutionTime > 2500) return '⚠️ Timeout';
    if (subscriber.estimatedCost > 0.01) return '🔥 Expensive';
    if (subscriber.lastMemoryUsage > 100) return '💧 Memory';
    if (subscriber.lastExecutionTime > 500) return '🐌 Slow';
    if (subscriber.lastCpuUsage > 80) return '🔥 CPU';
    return '';
  }

  private formatTime(date: Date): string {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  private formatLogTime(date: Date): string {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    });
  }

  private truncate(str: string, maxLength: number): string {
    return str.length > maxLength
      ? str.substring(0, maxLength - 3) + '...'
      : str;
  }
}
