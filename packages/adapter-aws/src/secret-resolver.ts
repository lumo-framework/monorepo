import { secrets } from '@tsc-run/core';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const ssm = new SSMClient({});

const secretCache = new Map<string, string>();

secrets.setSecretResolver(async (name: string) => {
  if (secretCache.has(name)) {
    return secretCache.get(name) || '';
  }

  // Fetch the secret from AWS SSM Parameter Store
  const command = new GetParameterCommand({
    Name: `/${process.env.TSC_RUN_PROJECT_NAME}/${process.env.TSC_RUN_ENVIRONMENT}/${name.toLowerCase()}`,
    WithDecryption: true,
  });

  const result = await ssm.send(command);
  const value = result.Parameter?.Value ?? '';
  secretCache.set(name, value);
  return value;
});
