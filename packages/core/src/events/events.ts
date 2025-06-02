export type Event<T = unknown> = {
  type: string;
  data: T;
};

export type EventDispatcher = (type: string, data: unknown) => Promise<void>;

// Default event dispatcher (console logging for development)
let eventDispatcher: EventDispatcher = async (_: string, __: unknown) => {};

/**
 * Set the event dispatcher implementation
 * This should be called by the runtime adapter during initialisation
 */
export const setEventDispatcher = (dispatcher: EventDispatcher): void => {
  eventDispatcher = dispatcher;
};

/**
 * Emit an event using the configured dispatcher
 */
export const emit = async (type: string, data: unknown): Promise<void> => {
  await eventDispatcher(type, data);
};
