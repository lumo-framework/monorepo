export interface TaskContext {
  deployment: {
    isFirstDeploy: boolean;
    previousVersion?: string;
    environment: string;
  };
  config: Record<string, unknown>;
  workingDirectory: string;
}

export interface TaskResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

export type TaskHandler = (context: TaskContext) => Promise<TaskResult>;
