import type { CloudFormationCustomResourceEvent, Context } from 'aws-lambda';
import type { tasks } from '@lumo-framework/core';

/**
 * This function is imported and used in packages/cli/src/commands/build.ts.
 * @param handler
 */
export const taskAdapter = (handler: tasks.TaskHandler) => {
  return async (
    event: CloudFormationCustomResourceEvent,
    _context: Context
  ): Promise<Record<string, unknown>> => {
    try {
      // Build task context from CloudFormation event
      const taskContext = buildTaskContext(event);

      // Execute the task
      const result = await handler(taskContext);

      // Return response for CloudFormation Custom Resource
      return buildCustomResourceResponse(event, result, 'SUCCESS');
    } catch (error) {
      console.log('Error executing task:', error);
      // Return failure response for CloudFormation Custom Resource
      return buildCustomResourceResponse(
        event,
        {
          success: false,
          message: error instanceof Error ? error.message : String(error),
        },
        'FAILED'
      );
    }
  };
};

function buildTaskContext(
  event: CloudFormationCustomResourceEvent
): tasks.TaskContext {
  // Extract deployment information from CloudFormation event
  const isFirstDeploy = event.RequestType === 'Create';
  const previousVersion =
    event.RequestType === 'Update'
      ? event.OldResourceProperties?.version
      : undefined;

  return {
    deployment: {
      isFirstDeploy,
      previousVersion,
      environment: process.env.LUMO_ENVIRONMENT || 'dev',
    },
    config: event.ResourceProperties?.config || {},
    workingDirectory: process.cwd(), // In Lambda, this is /var/task
  };
}

function buildCustomResourceResponse(
  event: CloudFormationCustomResourceEvent,
  result: tasks.TaskResult,
  status: 'SUCCESS' | 'FAILED'
) {
  return {
    Status: status,
    Reason: result.message,
    PhysicalResourceId: event.LogicalResourceId,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    Data: result.data || {},
  };
}
