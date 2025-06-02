import { secrets } from '@tsc-run/core';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

const ssm = new SSMClient({});
const secretCache = new Map<string, string>();

/**
 * Create a secret resolver for AWS Lambda
 * Resolves secrets from AWS SSM Parameter Store with caching
 */
const createAWSSecretResolver = () => {
  return async (name: string): Promise<string> => {
    if (secretCache.has(name)) {
      return secretCache.get(name) || '';
    }

    // Fetch the secret from AWS SSM Parameter Store
    const command = new GetParameterCommand({
      Name: `/${process.env.TSC_RUN_PROJECT_NAME}/${process.env.TSC_RUN_ENVIRONMENT}/${name}`,
      WithDecryption: true,
    });

    const result = await ssm.send(command);
    const value = result.Parameter?.Value ?? '';
    secretCache.set(name, value);
    return value;
  };
};

export const initializeSecretResolver = () => {
  const resolver = createAWSSecretResolver();
  secrets.setSecretResolver(resolver);
  return resolver;
};
