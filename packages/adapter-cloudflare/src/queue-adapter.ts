import type { events } from '@lumo-framework/core';
import type {
  CloudflareMessageBatch,
  CloudflareMessage,
  ExecutionContext,
} from './types.js';
import './types.js';

export const queueAdapter = (
  handler: (message: events.Event) => Promise<void>
) => {
  return async (
    batch: CloudflareMessageBatch<unknown>,
    _env: Record<string, unknown>,
    _ctx: ExecutionContext
  ): Promise<void> => {
    // Process each message in the batch
    for (const message of batch.messages) {
      try {
        const event = parseQueueMessage(message);
        await handler(event);

        // Acknowledge the message
        message.ack();
      } catch {
        // Optionally retry the message
        message.retry();
      }
    }
  };
};

function parseQueueMessage(message: CloudflareMessage<unknown>): events.Event {
  try {
    // Assume the message body contains our event data
    const body = message.body as Record<string, unknown>;

    return {
      type: (body.type as string) || 'unknown',
      data: body.data || body,
    };
  } catch (error) {
    throw new Error(`Failed to parse queue message: ${error}`);
  }
}
