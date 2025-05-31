export interface RouteHandlers {
  [method: string]: (...args: unknown[]) => unknown;
}

export interface DevServerEvent {
  type: string;
  data: unknown;
  timestamp: number;
}

export interface SubscriberExecution {
  name: string;
  success: boolean;
  duration: number;
  error?: string;
}
