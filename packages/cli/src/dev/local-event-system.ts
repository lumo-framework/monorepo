import { EventEmitter } from 'events';
import type { config } from '@lumo-framework/core';
import { events } from '@lumo-framework/core';
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

    console.log('Subscribers', this.subscribers);
    const subscribers = this.subscribers.get(type) || [];
    console.log('Subscribers for event type:', type, subscribers.length);

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
    // Set up the event dispatcher to route events to our local event system
    events.setEventDispatcher(async (type: string, data: unknown) => {
      console.log('LocalEventAdapter dispatching event:', type, data);
      try {
        await eventSystem.emitLocalEvent(type, data);
      } catch (error) {
        console.log('ERROR LocalEventAdapter dispatching event:', type, error);
      }
    });
  }

  static restore(): void {
    // Reset to default no-op dispatcher
    events.setEventDispatcher(async () => {});
  }
}
