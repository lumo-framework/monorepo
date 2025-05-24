import { Stack, StackProps, Fn } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Function, Runtime, Code } from 'aws-cdk-lib/aws-lambda';
import { RestApi, LambdaIntegration } from 'aws-cdk-lib/aws-apigateway';
import {EventBus, IEventBus, Rule} from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { Vpc, SecurityGroup, SubnetType, IVpc, ISecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { NetworkingStackExports } from './networking-stack.js';

interface AppStackProps extends StackProps {
  config: any;
  networkingExports: NetworkingStackExports;
}

export class AppStack extends Stack {
  public readonly eventBus: IEventBus;
  public readonly api: RestApi;
  private readonly vpc?: IVpc;
  private readonly lambdaSecurityGroup?: ISecurityGroup;
  private readonly hasNetworking: boolean;

  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);

    // Check if networking is enabled (NAT gateways > 0)
    this.hasNetworking = (props.config.networking?.natGateways ?? 1) > 0;

    // Import VPC resources only if networking is enabled
    if (this.hasNetworking) {
      const vpcAttrs: any = {
        vpcId: props.networkingExports.vpcId,
        availabilityZones: props.networkingExports.availabilityZones,
        publicSubnetIds: props.networkingExports.publicSubnetIds,
      };
      
      // Only include private subnets if they exist (when natGateways > 0)
      if (props.networkingExports.privateSubnetIds.length > 0) {
        vpcAttrs.privateSubnetIds = props.networkingExports.privateSubnetIds;
      }
      
      this.vpc = Vpc.fromVpcAttributes(this, 'ImportedVpc', vpcAttrs);

      this.lambdaSecurityGroup = SecurityGroup.fromSecurityGroupId(
        this,
        'ImportedLambdaSecurityGroup',
        props.networkingExports.lambdaSecurityGroupId
      );
    }

    // Generate RestApi ID in format: <ProjectName><Env>RestAPI
    const toPascalCase = (str: string) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    const projectName = props.config.projectName || 'Unknown';
    const environment = props.config.environment || 'dev';
    const apiId = `${toPascalCase(projectName)}${toPascalCase(environment)}RestAPI`;
    this.api = new RestApi(this, apiId);
    
    // Use the configured EventBridge event bus or default
    const configuredEventBusName = props.config.events?.eventBus || 'default';
    const eventBusName = this.sanitizeEventBusName(configuredEventBusName);
    this.eventBus = EventBus.fromEventBusName(this, 'EventBus', eventBusName);
    
    // Discover built Lambda functions
    const lambdasDir = join(process.cwd(), 'dist', 'lambdas');
    
    if (!existsSync(lambdasDir)) {
      throw new Error('No built Lambda functions found. Run "tsc-run build" first.');
    }
    
    // Get all Lambda files
    const lambdaFiles = this.discoverLambdaFiles(lambdasDir);
    const subscriberFiles = this.discoverSubscriberFiles(lambdasDir);
    
    if (lambdaFiles.length === 0 && subscriberFiles.length === 0) {
      throw new Error('No Lambda functions found in dist/lambdas directory.');
    }
    
    // Create Lambda functions and API routes
    for (const { route, method, filePath } of lambdaFiles) {
      const lambdaConfig: any = {
        runtime: Runtime.NODEJS_22_X,
        handler: 'index.lambdaHandler',
        code: Code.fromAsset(filePath),
        environment: {
          EVENT_BUS_NAME: this.eventBus.eventBusName
        }
      };

      // Only attach VPC configuration if networking is enabled
      if (this.hasNetworking && this.vpc && this.lambdaSecurityGroup) {
        lambdaConfig.vpc = this.vpc;
        lambdaConfig.vpcSubnets = {
          subnetType: SubnetType.PRIVATE_WITH_EGRESS
        };
        lambdaConfig.securityGroups = [this.lambdaSecurityGroup];
      }

      const lambdaFunction = new Function(this, this.createLambdaId(route, method), lambdaConfig);
      
      // Grant permission to put events to EventBridge
      this.eventBus.grantPutEventsTo(lambdaFunction);
      
      // Add route to API Gateway
      this.addRoute(this.api, route, method, lambdaFunction);
    }
    
    // Create subscriber Lambda functions
    for (const { name, filePath } of subscriberFiles) {
      const subscriberConfig: any = {
        runtime: Runtime.NODEJS_22_X,
        handler: 'index.lambdaHandler',
        code: Code.fromAsset(filePath)
      };

      // Only attach VPC configuration if networking is enabled
      if (this.hasNetworking && this.vpc && this.lambdaSecurityGroup) {
        subscriberConfig.vpc = this.vpc;
        subscriberConfig.vpcSubnets = {
          subnetType: SubnetType.PRIVATE_WITH_EGRESS
        };
        subscriberConfig.securityGroups = [this.lambdaSecurityGroup];
      }

      const subscriberFunction = new Function(this, this.sanitizeSubscriberName(name), subscriberConfig);
      
      // Get event subscriptions for this subscriber from config
      const subscriberEventConfig = props.config.events?.subscribers?.[name];
      const eventTypes = subscriberEventConfig?.events || [];
      
      // Create EventBridge rule for this subscriber
      let eventPattern: any = {
        source: ['tsc-run'] // Only listen to events from our application
      };
      
      // If specific event types are configured, add them to the pattern
      if (eventTypes.length > 0) {
        eventPattern['detail-type'] = eventTypes;
      }
      
      const rule = new Rule(this, `${this.sanitizeSubscriberName(name)}Rule`, {
        eventBus: this.eventBus,
        eventPattern
      });
      
      // Add the subscriber function as a target
      rule.addTarget(new LambdaFunction(subscriberFunction));
    }
  }
  
  private discoverLambdaFiles(lambdasDir: string): Array<{route: string, method: string, filePath: string}> {
    const files: Array<{route: string, method: string, filePath: string}> = [];
    
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
          const indexFile = join(fullPath, 'index.js');
          if (existsSync(indexFile)) {
            // Convert [param] directory names to {param} for API Gateway
            const normalizedRoutePath = routePath.replace(/\[([^\]]+)\]/g, '{$1}');
            const fullRoute = '/' + normalizedRoutePath.replace(/\\/g, '/');
            const { route, method } = this.extractRouteAndMethod(fullRoute);
            files.push({ route, method, filePath: fullPath });
          }
          
          // Continue scanning subdirectories
          scanDirectory(fullPath, routePath);
        }
      }
    };
    
    scanDirectory(lambdasDir);
    return files;
  }
  
  private addRoute(api: RestApi, route: string, method: string, lambdaFunction: Function) {
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
      .map(part => {
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
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
    return `${pascalCase}Subscriber`;
  }
  
  private extractRouteAndMethod(fullRoute: string): { route: string; method: string } {
    const httpMethods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
    
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
        
        const route = routeSegments.length > 0 ? '/' + routeSegments.join('/') : '/';
        return { route, method: method.toUpperCase() };
      }
    }
    
    // If no method suffix found, use the full path and default to ANY
    return { route: fullRoute, method: 'ANY' };
  }
  
  private sanitizeEventBusName(name: string): string {
    // AWS EventBridge event bus names must be 1-256 characters and can contain:
    // letters, numbers, periods (.), hyphens (-), underscores (_)
    return name
      .replace(/[^a-zA-Z0-9._-]/g, '-') // Replace invalid chars with hyphens
      .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
      .replace(/-+/g, '-') // Collapse multiple hyphens
      .substring(0, 256) || 'default'; // Ensure not empty and within length limit
  }

  private discoverSubscriberFiles(lambdasDir: string): Array<{name: string, filePath: string}> {
    const files: Array<{name: string, filePath: string}> = [];
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
          // Check if this directory contains an index.js (Lambda function)
          const indexFile = join(fullPath, 'index.js');
          if (existsSync(indexFile)) {
            const name = routePath.replace(/\\/g, '/');
            files.push({ name, filePath: fullPath });
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
}