import { EventEmitter } from 'events';
import type { config } from '@lumo-framework/core';
import { EnhancedDevLogger } from './enhanced-dev-logger.js';
import type { DevServerEvent, SubscriberExecution } from './types.js';

export class LocalEventSystem extends EventEmitter {
  private config?: config.Config;
  private subscribers: Map<string, ((...args: unknown[]) => unknown)[]> =
    new Map();
  private subscriberHandlerToName: Map<
    (...args: unknown[]) => unknown,
    string
  > = new Map();
  private logger: EnhancedDevLogger;

  constructor(logger?: EnhancedDevLogger) {
    super();
    this.logger = logger || new EnhancedDevLogger(false); // Use provided logger or create one
    this.setupLocalEventEmitter();
  }

  setConfig(config: config.Config): void {
    this.config = config;
    this.setupEventSubscriptions();
  }

  registerSubscriber(
    name: string,
    handler: (...args: unknown[]) => unknown
  ): void {
    if (!this.config?.events?.subscribers) {
      return;
    }

    // Store the handler-to-name mapping
    this.subscriberHandlerToName.set(handler, name);

    // Find which events this subscriber should listen to
    const subscriberConfig = this.config.events.subscribers[name];
    if (subscriberConfig && subscriberConfig.events) {
      for (const eventType of subscriberConfig.events) {
        if (!this.subscribers.has(eventType)) {
          this.subscribers.set(eventType, []);
        }
        this.subscribers.get(eventType)!.push(handler);
      }
    }
  }

  clearSubscribers(): void {
    this.subscribers.clear();
    this.subscriberHandlerToName.clear();
  }

  async emitLocalEvent(type: string, data: unknown): Promise<void> {
    const event: DevServerEvent = {
      type,
      data,
      timestamp: Date.now(),
    };

    const subscribers = this.subscribers.get(type) || [];

    if (subscribers.length > 0) {
      // Log the event emission itself (without subscriber execution time)
      const eventEmissionHandler = async () => {
        // Just record that the event was emitted - no actual work here
      };

      await this.logger.logEventWithMetrics(
        type,
        subscribers.length,
        eventEmissionHandler
      );

      // Execute all subscribers individually with their own metrics
      const executions = subscribers.map(async (subscriber) => {
        const subscriberName =
          this.subscriberHandlerToName.get(subscriber) || 'unknown-subscriber';
        return this.executeSubscriber(subscriberName, subscriber, event);
      });

      await Promise.all(executions);
    } else {
      // Still log the event even if no subscribers
      const emptyHandler = async () => {};
      await this.logger.logEventWithMetrics(type, 0, emptyHandler);
    }
  }

  private setupLocalEventEmitter(): void {
    // Override the global emit function for local development
    if (typeof global !== 'undefined') {
      (global as Record<string, unknown>).__tsc_run_emit =
        this.emitLocalEvent.bind(this);
    }
  }

  private setupEventSubscriptions(): void {
    if (!this.config?.events?.subscribers) {
      return;
    }

    // Clear existing subscriptions
    this.subscribers.clear();

    // Log available event subscriptions - collect all unique event types
    const eventTypes = new Set<string>();
    Object.values(this.config.events.subscribers).forEach((subscriber) => {
      subscriber.events.forEach((eventType) => eventTypes.add(eventType));
    });

    if (eventTypes.size > 0) {
      this.logger.info(
        `📡 Event subscriptions configured for: ${Array.from(eventTypes).join(', ')}`
      );
    }
  }

  private async executeSubscriber(
    name: string,
    handler: (...args: unknown[]) => unknown,
    event: DevServerEvent
  ): Promise<SubscriberExecution> {
    const subscriberHandler = async () => {
      await handler(event);
    };

    try {
      const { success, duration, error } =
        await this.logger.logSubscriberWithMetrics(
          name,
          event.type,
          subscriberHandler
        );

      return {
        name,
        success,
        duration,
        error,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        name,
        success: false,
        duration: 0,
        error: errorMessage,
      };
    }
  }

  private getSubscriberName(eventType: string, index: number): string {
    if (!this.config?.events?.subscribers) {
      return `subscriber-${index}`;
    }

    // Find subscriber names that listen to this event type
    const subscriberNames = Object.keys(this.config.events.subscribers).filter(
      (name) =>
        this.config!.events!.subscribers![name].events.includes(eventType)
    );

    return subscriberNames[index] || `subscriber-${index}`;
  }
}

// Create a local adapter that works with the existing emit function
export class LocalEventAdapter {
  static setup(eventSystem: LocalEventSystem): void {
    // Instead of overriding the emit function, we'll use a different approach:
    // 1. Set up console.log interception to catch emit calls
    // 2. Use environment variables to prevent EventBridge calls

    // Store the original console.log
    const originalConsoleLog = console.log;

    // Set up console.log interception to catch event dispatches
    console.log = (...args: unknown[]) => {
      // Check if this is an event dispatch call
      if (
        args.length >= 3 &&
        args[0] === 'Event dispatched' &&
        typeof args[1] === 'string'
      ) {
        const eventType = args[1];
        const eventData = args[2];

        // Emit to our local event system instead of just logging
        eventSystem.emitLocalEvent(eventType, eventData).catch((error) => {
          originalConsoleLog('Error in local event system:', error);
        });

        return; // Don't call original console.log for event dispatches
      }

      // For all other console.log calls, use the original
      originalConsoleLog.apply(console, args);
    };

    // Store original for restoration
    (console as unknown as Record<string, unknown>).__originalLog =
      originalConsoleLog;

    // Ensure we're not in "EventBridge mode" by not setting EVENT_BUS_NAME
    // The core emit function will use the fallback path (console.log)
  }

  static restore(): void {
    // Restore original console.log
    const consoleWithOriginal = console as unknown as Record<string, unknown>;
    if (consoleWithOriginal.__originalLog) {
      console.log = consoleWithOriginal.__originalLog as typeof console.log;
      delete consoleWithOriginal.__originalLog;
    }
  }
}
