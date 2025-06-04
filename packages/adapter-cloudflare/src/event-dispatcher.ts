import type { events } from '@lumo-framework/core';
import type { CloudflareQueue } from './types.js';

type EventDispatcher = events.EventDispatcher;

export const createCloudflareEventDispatcher = (
  env: Record<string, unknown>
): EventDispatcher => {
  return async (type: string, data: unknown): Promise<void> => {
    const event = {
      type,
      data,
      timestamp: new Date().toISOString(),
      source: 'lumo',
    };

    const queueResult = await invokeSubscribersViaQueue(env, event);

    if (queueResult === 0) {
      throw new Error(
        'EVENT_QUEUE not configured. Ensure Cloudflare Queue bindings are set up.'
      );
    }
  };
};

async function invokeSubscribersViaQueue(
  env: Record<string, unknown>,
  event: events.Event
): Promise<number> {
  const eventQueue = env.EVENT_QUEUE as CloudflareQueue | undefined;

  if (eventQueue) {
    await eventQueue.send(event);
    return 1;
  }

  return 0;
}

export const initializeCloudflareEventDispatcher = async (
  env: Record<string, unknown>
): Promise<void> => {
  const { events } = await import('@lumo-framework/core');
  const dispatcher = createCloudflareEventDispatcher(env);
  events.setEventDispatcher(dispatcher);
};
