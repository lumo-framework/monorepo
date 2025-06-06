import type { events } from '@lumo-framework/core';

type EventDispatcher = events.EventDispatcher;

/**
 * AWS EventBridge dispatcher implementation
 * Dispatches events to EventBridge when running in AWS Lambda environment
 */
export const createAWSEventDispatcher = (): EventDispatcher => {
  return async (type: string, data: unknown): Promise<void> => {
    // Check if running in AWS Lambda environment with EventBridge
    if (
      typeof process !== 'undefined' &&
      process.env &&
      process.env.EVENT_BUS_NAME
    ) {
      const { EventBridgeClient, PutEventsCommand } = await import(
        '@aws-sdk/client-eventbridge'
      );

      // Get the application environment
      const projectName = process.env.LUMO_PROJECT_NAME;
      const environment = process.env.LUMO_ENVIRONMENT;

      const eventBridgeClient = new EventBridgeClient({});

      await eventBridgeClient.send(
        new PutEventsCommand({
          Entries: [
            {
              Source: `${projectName}/${environment}`,
              DetailType: type,
              Detail: JSON.stringify(data),
              EventBusName: process.env.EVENT_BUS_NAME,
            },
          ],
        })
      );
    } else {
      // Local development or no EventBridge configured
    }
  };
};

export const initializeAWSEventDispatcher = async (): Promise<void> => {
  const { events } = await import('@lumo-framework/core');
  const dispatcher = createAWSEventDispatcher();
  events.setEventDispatcher(dispatcher);
};
