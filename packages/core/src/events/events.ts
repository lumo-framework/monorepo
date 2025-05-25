import process from 'process';

export type Event<T = unknown> = {
  type: string;
  data: T;
};

export const emit = async (type: string, data: unknown) => {
  const message: Event = { type, data };

  // Check if running in AWS Lambda environment with EventBridge
  if (
    typeof process !== 'undefined' &&
    process.env &&
    process.env.EVENT_BUS_NAME
  ) {
    try {
      const { EventBridgeClient, PutEventsCommand } = await import(
        '@aws-sdk/client-eventbridge'
      );

      const eventBridgeClient = new EventBridgeClient({});

      await eventBridgeClient.send(
        new PutEventsCommand({
          Entries: [
            {
              Source: 'tsc-run',
              DetailType: type,
              Detail: JSON.stringify(data),
              EventBusName: process.env.EVENT_BUS_NAME,
            },
          ],
        })
      );

      console.log('Event dispatched to EventBridge', type, data);
    } catch (error) {
      console.error('Failed to dispatch event to EventBridge:', error);
      // Fallback to console logging
      console.log('Event dispatched (fallback)', type, data);
    }
  } else {
    // Local development or no EventBridge configured
    console.log('Event dispatched', type, data);
  }
};
