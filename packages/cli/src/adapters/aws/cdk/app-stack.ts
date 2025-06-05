import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  Code,
  Function,
  FunctionProps,
  IFunction,
  Runtime,
} from 'aws-cdk-lib/aws-lambda';
import { LambdaIntegration, RestApi } from 'aws-cdk-lib/aws-apigateway';
import { EventBus, IEventBus, Rule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { SubnetType } from 'aws-cdk-lib/aws-ec2';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { NetworkingDetails } from './networking-stack.js';
import { NetworkingConstruct } from './constructs/networking.js';
import type { config } from '@lumo-framework/core';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { generateResourceIdentifier, NormalisedName } from '../utils.js';

interface AppStackProps extends StackProps {
  config: config.Config;
  networkingExports: NetworkingDetails;
  projectName: NormalisedName;
  environment: NormalisedName;
}

type RestApiLambdaFile = {
  route: string;
  method: string;
  path: string;
};

type SubscriberFile = {
  name: string;
  path: string;
};

export class AppStack extends Stack {
  // public readonly eventBus: IEventBus;
  public readonly api: RestApi;
  private readonly networking: NetworkingConstruct;

  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);

    const { projectName, environment } = props;

    // Initialize networking construct
    this.networking = new NetworkingConstruct(this, 'Networking', {
      config: props.config,
      networkingExports: props.networkingExports,
    });

    // Rest API
    this.api = new RestApi(this, generateResourceIdentifier('ApiGateway'));

    // Create an EventBus
    const eventBus = this.createEventBus();
    const eventSource = `${projectName}/${environment}`.toLowerCase();

    const ssmParameterPrefix = `arn:aws:ssm:${this.region}:${this.account}:parameter/${props.config.projectName.toLowerCase()}/${props.config.environment.toLowerCase()}/*`;

    // Discover built functions
    const functionsDir = join(process.cwd(), 'dist', 'functions');
    if (!existsSync(functionsDir)) {
      throw new Error('No built functions found. Run "lumo build" first.');
    }

    // Create REST API Lambda functions
    const lambdaFiles = this.discoverLambdaFiles(functionsDir);
    const restApiFunctions = this.createRestApiLambdaFunctions(
      projectName,
      environment,
      eventBus.eventBusName,
      lambdaFiles
    );
    for (const lambdaFunction of restApiFunctions) {
      this.grantLambdaPermissions(eventBus, ssmParameterPrefix, lambdaFunction);
    }

    // Create subscriber Lambda functions
    const subscriberFiles = this.discoverSubscriberFiles(functionsDir);
    const subscriberFunctions = this.createSubscriberLambdaFunctions(
      projectName,
      environment,
      eventBus.eventBusName,
      subscriberFiles
    );
    for (const subscriber of subscriberFunctions) {
      this.grantLambdaPermissions(eventBus, ssmParameterPrefix, subscriber.fn);

      const subscriberEventConfig =
        props.config.events?.subscribers?.[subscriber.name];
      if (
        !subscriberEventConfig ||
        !subscriberEventConfig.events ||
        subscriberEventConfig.events.length === 0
      ) {
        continue;
      }
      this.linkSubscribersToEvents(
        subscriberEventConfig.events,
        [eventSource],
        eventBus,
        subscriber
      );
    }
  }

  private createEventBus(): IEventBus {
    return new EventBus(this, generateResourceIdentifier('EventBus'));
  }

  private discoverLambdaFiles(lambdasDir: string): Array<RestApiLambdaFile> {
    const files: Array<{ route: string; method: string; path: string }> = [];

    const scanDirectory = (dir: string, basePath: string = '') => {
      const items = readdirSync(dir, { withFileTypes: true });

      for (const item of items) {
        // Skip the subscribers directory
        if (item.name === 'subscribers') {
          continue;
        }

        const fullPath = join(dir, item.name);
        const routePath = join(basePath, item.name);

        if (item.isDirectory()) {
          // Check if this directory contains an index.js (Lambda function)
          const indexFile = join(fullPath, 'index.mjs');
          if (existsSync(indexFile)) {
            // Convert [param] directory names to {param} for API Gateway
            const normalizedRoutePath = routePath.replace(
              /\[([^\]]+)\]/g,
              '{$1}'
            );
            const fullRoute = '/' + normalizedRoutePath.replace(/\\/g, '/');
            const { route, method } = this.extractRouteAndMethod(fullRoute);
            files.push({ route, method, path: fullPath });
          }

          // Continue scanning subdirectories
          scanDirectory(fullPath, routePath);
        }
      }
    };

    scanDirectory(lambdasDir);
    return files;
  }

  private discoverSubscriberFiles(lambdasDir: string): Array<SubscriberFile> {
    const files: Array<SubscriberFile> = [];
    const subscribersDir = join(lambdasDir, 'subscribers');

    if (!existsSync(subscribersDir)) {
      return files;
    }

    const scanDirectory = (dir: string, basePath: string = '') => {
      const items = readdirSync(dir, { withFileTypes: true });

      for (const item of items) {
        const fullPath = join(dir, item.name);
        const routePath = join(basePath, item.name);

        if (item.isDirectory()) {
          const indexFile = join(fullPath, 'index.mjs');
          if (existsSync(indexFile)) {
            const name = routePath.replace(/\\/g, '/');
            files.push({ name, path: fullPath });
          } else {
            // Continue scanning subdirectories
            scanDirectory(fullPath, routePath);
          }
        }
      }
    };

    scanDirectory(subscribersDir);
    return files;
  }

  private createRestApiLambdaFunctions(
    projectName: string,
    environment: string,
    eventBusName: string,
    files: RestApiLambdaFile[]
  ) {
    const functions: IFunction[] = [];

    for (const { route, method, path } of files) {
      let lambdaConfig: FunctionProps = {
        runtime: Runtime.NODEJS_22_X,
        handler: 'index.lambdaHandler',
        code: Code.fromAsset(path),
        environment: {
          EVENT_BUS_NAME: eventBusName,
          LUMO_PROJECT_NAME: projectName.toLowerCase(), // TODO: NEED TO CHANGE FROM TSC_RUN TO LUMO_
          LUMO_ENVIRONMENT: environment.toLowerCase(),
        },
      };

      // Only attach VPC configuration if NAT Gateways are enabled.
      if (this.networking.hasNatGateways) {
        lambdaConfig = {
          ...lambdaConfig,
          vpc: this.networking.vpc,
          vpcSubnets: {
            subnetType: SubnetType.PRIVATE_WITH_EGRESS,
          },
        };
      }

      const lambdaFunction = new Function(
        this,
        this.createLambdaId(route, method),
        lambdaConfig
      );

      // Add route to API Gateway
      this.addRoute(this.api, route, method, lambdaFunction);

      functions.push(lambdaFunction);
    }

    return functions;
  }

  private createSubscriberLambdaFunctions(
    projectName: string,
    environment: string,
    eventBusName: string,
    files: SubscriberFile[]
  ) {
    const functions: { name: string; fn: IFunction }[] = [];

    for (const { name, path } of files) {
      let subscriberConfig: FunctionProps = {
        runtime: Runtime.NODEJS_22_X,
        handler: 'index.lambdaHandler',
        code: Code.fromAsset(path),
        environment: {
          EVENT_BUS_NAME: eventBusName,
          LUMO_PROJECT_NAME: projectName.toLowerCase(), // TODO: NEED TO CHANGE FROM TSC_RUN TO LUMO_
          LUMO_ENVIRONMENT: environment.toLowerCase(),
        },
      };

      // Only attach VPC configuration if NAT Gateways are enabled.
      if (this.networking.hasNatGateways) {
        subscriberConfig = {
          ...subscriberConfig,
          vpc: this.networking.vpc,
          vpcSubnets: {
            subnetType: SubnetType.PRIVATE_WITH_EGRESS,
          },
        };
      }

      const subscriberFunction = new Function(
        this,
        this.sanitizeSubscriberName(name),
        subscriberConfig
      );

      functions.push({ name, fn: subscriberFunction });
    }

    return functions;
  }

  private grantLambdaPermissions(
    eventBus: IEventBus,
    ssmParameterPrefix: string,
    lambdaFunction: IFunction
  ): void {
    // Grant permission to put events to EventBridge
    eventBus.grantPutEventsTo(lambdaFunction);

    // Grant permission to read SSM parameters if configured
    lambdaFunction.addToRolePolicy(
      new PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [ssmParameterPrefix],
      })
    );
  }

  private linkSubscribersToEvents(
    eventTypes: string[],
    source: string[],
    eventBus: IEventBus,
    subscriber: { name: string; fn: IFunction }
  ) {
    let eventPattern: { source: string[]; 'detail-type'?: string[] } = {
      source,
      'detail-type': eventTypes,
    };

    const rule = new Rule(
      this,
      `${this.sanitizeSubscriberName(subscriber.name)}Rule`,
      {
        eventBus: eventBus,
        eventPattern,
      }
    );

    rule.addTarget(new LambdaFunction(subscriber.fn));
  }

  private addRoute(
    api: RestApi,
    route: string,
    method: string,
    lambdaFunction: Function
  ) {
    const parts = route.split('/').filter(Boolean);
    let resource = api.root;

    // Navigate/create nested resources
    for (const part of parts) {
      const existing = resource.getResource(part);
      if (existing) {
        resource = existing;
      } else {
        // Path parameters are handled automatically by API Gateway when using {} syntax
        resource = resource.addResource(part);
      }
    }

    // Add method to the resource
    resource.addMethod(method, new LambdaIntegration(lambdaFunction));
  }

  private createLambdaId(route: string, method: string): string {
    // Convert route to PascalCase: /users/{id} -> UsersByid
    const pathParts = route
      .split('/')
      .filter(Boolean)
      .map((part) => {
        // Remove curly braces and convert to PascalCase
        const cleaned = part.replace(/[{}]/g, '');
        return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
      })
      .join('');

    // Handle root route
    const pathName = pathParts || 'Root';

    // Format: Route<PathNamePascalCase><METHOD>
    return `Route${pathName}${method.toUpperCase()}`;
  }

  private sanitizeSubscriberName(name: string): string {
    // Convert kebab-case to PascalCase and add Subscriber suffix
    // e.g., "send-welcome-email" -> "SendWelcomeEmailSubscriber"
    const pascalCase = name
      .split(/[-_]/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
    return `${pascalCase}Subscriber`;
  }

  private extractRouteAndMethod(fullRoute: string): {
    route: string;
    method: string;
  } {
    const httpMethods = [
      'get',
      'post',
      'put',
      'patch',
      'delete',
      'head',
      'options',
    ];

    // Extract the directory path (everything except the last segment)
    const segments = fullRoute.split('/').filter(Boolean);

    if (segments.length === 0) {
      return { route: '/', method: 'ANY' };
    }

    const lastSegment = segments[segments.length - 1];

    // Check if the last segment ends with a method (handles cases like "[id]-delete")
    for (const method of httpMethods) {
      if (lastSegment.endsWith(`-${method}`)) {
        // Extract the route part before the method suffix
        const routePart = lastSegment.replace(`-${method}`, '');

        // Rebuild the route: use previous segments + the route part (if any)
        const routeSegments = segments.slice(0, -1);
        if (routePart) {
          routeSegments.push(routePart);
        }

        const route =
          routeSegments.length > 0 ? '/' + routeSegments.join('/') : '/';
        return { route, method: method.toUpperCase() };
      }
    }

    // If no method suffix found, use the full path and default to ANY
    return { route: fullRoute, method: 'ANY' };
  }

  private sanitizeEventBusName(name: string): string {
    // AWS EventBridge event bus names must be 1-256 characters and can contain:
    // letters, numbers, periods (.), hyphens (-), underscores (_)
    return (
      name
        .replace(/[^a-zA-Z0-9._-]/g, '-') // Replace invalid chars with hyphens
        .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
        .replace(/-+/g, '-') // Collapse multiple hyphens
        .substring(0, 256) || 'default'
    ); // Ensure not empty and within length limit
  }
}
