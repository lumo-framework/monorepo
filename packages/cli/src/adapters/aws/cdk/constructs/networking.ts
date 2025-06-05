import { Construct } from 'constructs';
import { IVpc, Vpc } from 'aws-cdk-lib/aws-ec2';
import { NetworkingDetails } from '../networking-stack.js';
import type { config } from '@lumo-framework/core';

export interface NetworkingConstructProps {
  config: config.Config;
  networkingExports: NetworkingDetails;
}

export class NetworkingConstruct extends Construct {
  public readonly vpc?: IVpc;
  public readonly hasNatGateways: boolean;

  constructor(scope: Construct, id: string, props: NetworkingConstructProps) {
    super(scope, id);

    // Check if networking is enabled (NAT gateways > 0)
    this.hasNatGateways = (props.config.networking?.natGateways ?? 0) > 0;

    // Import VPC resources only if networking is enabled
    if (this.hasNatGateways) {
      const vpcAttrs: {
        vpcId: string;
        availabilityZones: string[];
        publicSubnetIds: string[];
        privateSubnetIds?: string[];
      } = {
        vpcId: props.networkingExports.vpcId,
        availabilityZones: props.networkingExports.availabilityZones,
        publicSubnetIds: props.networkingExports.publicSubnetIds,
      };

      // Only include private subnets if they exist (when natGateways > 0)
      if (props.networkingExports.privateSubnetIds.length > 0) {
        vpcAttrs.privateSubnetIds = props.networkingExports.privateSubnetIds;
      }

      this.vpc = Vpc.fromVpcAttributes(this, 'ImportedVpc', vpcAttrs);
    }
  }
}
