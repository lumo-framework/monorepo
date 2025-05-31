import { performance } from 'perf_hooks';
import * as v8 from 'v8';
import * as os from 'os';

export interface PerformanceMetrics {
  wallTime: number; // Execution time in ms
  memoryUsed: number; // Memory delta in MB
  cpuTime: number; // CPU time in ms
  cpuEfficiency: number; // CPU utilization %
  estimatedLambdaCost: number;
  estimatedLambdaTime: string; // Range like "60-90ms"
  status?: number;
  timestamp: Date;
}

export interface RouteMetrics {
  path: string;
  method: string;
  lastStatus: number;
  lastResponseTime: number;
  lastMemoryUsage: number;
  lastCpuUsage: number;
  estimatedLambdaCost: number;
  estimatedLambdaTime: string;
  lastCalled: Date;
  hotReloaded: boolean;
  averageMetrics: {
    responseTime: number;
    memoryUsage: number;
    cpuUsage: number;
  };
  requestCount: number;
  warningIndicator?: string;
}

export interface EventMetrics {
  type: string;
  count: number;
  averageTime: number;
  averageMemory: number;
  totalEstimatedCost: number;
  lastEmitted: Date;
}

export interface SubscriberMetrics {
  name: string;
  eventType: string;
  lastStatus: 'success' | 'error';
  lastExecutionTime: number;
  lastMemoryUsage: number;
  lastCpuUsage: number;
  estimatedCost: number;
  lastRun: Date;
  hotReloaded: boolean;
  warningIndicator?: string;
}

export interface WarningThresholds {
  slowResponse: number; // ms
  highMemory: number; // MB
  highCPU: number; // %
  timeoutRisk: number; // ms (close to 3s Lambda default)
  expensiveFunction: number; // USD per request
}

export const DEFAULT_THRESHOLDS: WarningThresholds = {
  slowResponse: 500,
  highMemory: 100,
  highCPU: 80,
  timeoutRisk: 2500,
  expensiveFunction: 0.01,
};

export class PerformanceTracker {
  private thresholds: WarningThresholds;

  constructor(thresholds: WarningThresholds = DEFAULT_THRESHOLDS) {
    this.thresholds = thresholds;
  }

  async executeWithMetrics<T>(
    fn: () => Promise<T>,
    _context: string
  ): Promise<{ result: T; metrics: PerformanceMetrics }> {
    // Memory tracking
    process.memoryUsage();
    const heapBefore = v8.getHeapStatistics().used_heap_size;

    // CPU and time tracking
    const startTime = performance.now();
    const startCPU = process.cpuUsage();

    let result: T;
    let error: Error | undefined;
    let metrics: PerformanceMetrics;

    try {
      result = await fn();
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err));
    } finally {
      // Calculate metrics regardless of success/failure
      const endTime = performance.now();
      const endCPU = process.cpuUsage(startCPU);
      process.memoryUsage();
      const heapAfter = v8.getHeapStatistics().used_heap_size;

      const wallTime = endTime - startTime;
      const cpuTime = (endCPU.user + endCPU.system) / 1000; // Convert to ms
      const memoryUsed = Math.max(0, (heapAfter - heapBefore) / 1024 / 1024); // MB

      // For very fast operations (< 5ms), CPU measurements are unreliable
      const cpuEfficiency =
        wallTime < 5
          ? 0
          : wallTime > 0
            ? Math.min((cpuTime / wallTime) * 100, 100)
            : 0;

      metrics = {
        wallTime,
        memoryUsed,
        cpuTime,
        cpuEfficiency,
        estimatedLambdaCost: this.calculateLambdaCost(memoryUsed, wallTime),
        estimatedLambdaTime: this.estimateLambdaTime(wallTime),
        timestamp: new Date(),
      };
    }

    if (error) {
      throw error;
    }

    return { result: result!, metrics };
  }

  calculateLambdaCost(memoryMB: number, durationMs: number): number {
    // AWS Lambda pricing (approximate, varies by region)
    const memoryGB = Math.max(memoryMB / 1024, 0.128); // Minimum 128MB
    const durationSeconds = durationMs / 1000;
    const gbSeconds = memoryGB * durationSeconds;

    const costPerGbSecond = 0.0000166667; // USD
    const requestCost = 0.0000002; // USD per request

    return gbSeconds * costPerGbSecond + requestCost;
  }

  estimateLambdaTime(localTimeMs: number): string {
    // Platform-specific calibration
    const platform = `${os.platform()}-${os.arch()}`;
    const calibrationFactors: Record<string, { min: number; max: number }> = {
      'darwin-arm64': { min: 0.7, max: 1.1 }, // M1/M2 Macs
      'darwin-x64': { min: 0.9, max: 1.3 }, // Intel Macs
      'linux-x64': { min: 0.8, max: 1.2 }, // Similar to Lambda
      'win32-x64': { min: 1.0, max: 1.5 }, // Windows overhead
    };

    const factor = calibrationFactors[platform] || { min: 0.8, max: 1.5 };
    const minTime = Math.round(localTimeMs * factor.min);
    const maxTime = Math.round(localTimeMs * factor.max);

    if (minTime === maxTime) return `~${minTime}ms`;
    return `~${minTime}-${maxTime}ms`;
  }

  getWarningIndicator(metrics: PerformanceMetrics): string {
    if (metrics.wallTime > this.thresholds.timeoutRisk) return '⚠️ Timeout';
    if (metrics.estimatedLambdaCost > this.thresholds.expensiveFunction)
      return '🔥 Expensive';
    if (metrics.memoryUsed > this.thresholds.highMemory) return '💧 Memory';
    if (metrics.wallTime > this.thresholds.slowResponse) return '🐌 Slow';
    if (metrics.cpuEfficiency > this.thresholds.highCPU) return '🔥 CPU';
    return '';
  }

  getStatusIndicator(success: boolean, hotReloaded: boolean = false): string {
    if (hotReloaded) return '🔄';
    return success ? '✅' : '❌';
  }
}
