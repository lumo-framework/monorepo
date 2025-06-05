// TODO: What happens when a Secret is deleted?
import { aws_ssm, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NormalisedName } from '../utils';

interface SecretStackProps extends StackProps {
  readonly secrets?: Record<
    string,
    { value: SecretValue; description?: string }
  >;
  readonly projectName: NormalisedName;
  readonly environment: NormalisedName;
}

type SecretValue = string | ((...args: unknown[]) => string);

export class SecretStack extends Stack {
  public secrets: Record<string, aws_ssm.IStringParameter> = {};

  constructor(scope: Construct, id: string, props: SecretStackProps) {
    super(scope, id, props);

    const { secrets, projectName, environment } = props;

    for (const secretName in secrets) {
      const secret = secrets[secretName];
      this.resolveSecretValue(
        projectName,
        environment,
        secretName,
        secret.value
      );
    }
  }

  private resolveSecretValue(
    projectName: NormalisedName,
    environment: NormalisedName,
    name: string,
    value: SecretValue
  ): void {
    let resolvedValue: string = typeof value === 'string' ? value : '';

    if (typeof value === 'function') {
      resolvedValue = value();
    }
    if (typeof value !== 'string') {
      throw new Error(
        `Invalid type for secret ${name}. Expected string or function.`
      );
    }

    const parameterName =
      `/${projectName}/${environment}/${name}`.toLowerCase();

    this.secrets[name] = new aws_ssm.StringParameter(this, name.toLowerCase(), {
      parameterName,
      stringValue: resolvedValue,
    });
  }
}
