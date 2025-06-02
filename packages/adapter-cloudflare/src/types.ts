declare global {
  interface ExecutionContext {
    waitUntil(promise: Promise<unknown>): void;
    passThroughOnException(): void;
  }
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

export interface CloudflareQueue {
  send(message: unknown): Promise<void>;
}

export interface CloudflareMessage<T = unknown> {
  id: string;
  timestamp: Date;
  body: T;
  ack(): void;
  retry(): void;
}

export interface CloudflareMessageBatch<T = unknown> {
  messages: CloudflareMessage<T>[];
}
