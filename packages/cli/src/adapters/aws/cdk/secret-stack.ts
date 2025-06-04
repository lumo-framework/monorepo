import { aws_ssm, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import type { config } from '@lumo-framework/core';
import { toPascalCase } from '../utils.js';

interface SecretStackProps extends StackProps {
  config: config.Config;
}

type SecretValue = string | ((...args: unknown[]) => string);

export class SecretStack extends Stack {
  public secrets: Record<string, aws_ssm.IStringParameter> = {};
  private readonly config: config.Config;

  constructor(scope: Construct, id: string, props: SecretStackProps) {
    super(scope, id, props);

    this.config = props.config;
    const secrets = this.config.secrets || {};

    for (const secretName in secrets) {
      const secret = secrets[secretName];
      this.resolveSecretValue(secretName, secret.value);
    }
  }

  private resolveSecretValue(name: string, value: SecretValue): void {
    let resolvedValue: string = typeof value === 'string' ? value : '';

    if (typeof value === 'function') {
      resolvedValue = value();
    }
    if (typeof value !== 'string') {
      throw new Error(
        `Invalid type for secret ${name}. Expected string or function.`
      );
    }

    const projectName = this.config.projectName;
    const environment = this.config.environment;
    const parameterName =
      `/${projectName}/${environment}/${toPascalCase(name)}`.toLowerCase();

    this.secrets[name] = new aws_ssm.StringParameter(this, `${name}Parameter`, {
      parameterName,
      stringValue: resolvedValue,
    });
  }
}
