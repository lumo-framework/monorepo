import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { IpAddresses, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import {
  generateExportName,
  generateResourceIdentifier,
  NormalisedName,
} from '../utils.js';

export interface NetworkingStackProps extends StackProps {
  projectName: NormalisedName;
  environment: NormalisedName;
  natGateways: number;
}

export interface NetworkingDetails {
  vpcId: string;
  privateSubnetIds: string[];
  publicSubnetIds: string[];
  availabilityZones: string[];
}

export class NetworkingStack extends Stack {
  public readonly vpc: Vpc;
  public readonly networkingDetails: NetworkingDetails;

  constructor(scope: Construct, id: string, props: NetworkingStackProps) {
    super(scope, id, props);

    const { projectName, environment, natGateways } = props;

    // Create VPC with configurable NAT gateways
    this.vpc = new Vpc(this, generateResourceIdentifier('Vpc'), {
      ipAddresses: IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 3, // Use up to 3 AZs for high availability
      natGateways: natGateways, // Configurable NAT gateways (0=no egress, 1=cost-effective, 2-3=HA)
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
      enableDnsHostnames: true,
      enableDnsSupport: true,
    });

    // Prepare exports
    this.networkingDetails = {
      vpcId: this.vpc.vpcId,
      privateSubnetIds: this.vpc.privateSubnets.map(
        (subnet) => subnet.subnetId
      ),
      publicSubnetIds: this.vpc.publicSubnets.map((subnet) => subnet.subnetId),
      availabilityZones: this.vpc.availabilityZones,
    };

    // Export VPC resources for cross-stack reference
    new CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      exportName: generateExportName(projectName, environment, 'VpcId'),
      description: 'VPC ID for cross-stack reference.',
    });

    new CfnOutput(this, 'PrivateSubnetIds', {
      value: this.vpc.privateSubnets.map((subnet) => subnet.subnetId).join(','),
      exportName: generateExportName(
        projectName,
        environment,
        'PrivateSubnetIds'
      ),
      description: 'Private subnet IDs for Lambda functions.',
    });

    new CfnOutput(this, 'PublicSubnetIds', {
      value: this.vpc.publicSubnets.map((subnet) => subnet.subnetId).join(','),
      exportName: generateExportName(
        projectName,
        environment,
        'PublicSubnetIds'
      ),
      description:
        'Public subnet IDs for load balancers or other public resources.',
    });

    new CfnOutput(this, 'AvailabilityZones', {
      value: this.vpc.availabilityZones.join(','),
      exportName: generateExportName(
        projectName,
        environment,
        'AvailabilityZones'
      ),
      description: 'Availability zones used by the VPC.',
    });

    // Export individual subnet IDs for easier reference
    // Only export individual private subnets if they exist
    if (this.vpc.privateSubnets.length > 0) {
      this.vpc.privateSubnets.forEach((subnet, index) => {
        new CfnOutput(this, `PrivateSubnet${index + 1}Id`, {
          value: subnet.subnetId,
          exportName: generateExportName(
            projectName,
            environment,
            `PrivateSubnet${index + 1}Id`
          ),
          description: `Private subnet ${index + 1} ID.`,
        });
      });
    }

    this.vpc.publicSubnets.forEach((subnet, index) => {
      new CfnOutput(this, `PublicSubnet${index + 1}Id`, {
        value: subnet.subnetId,
        exportName: generateExportName(
          projectName,
          environment,
          `PublicSubnet${index + 1}Id`
        ),
        description: `Public subnet ${index + 1} ID.`,
      });
    });
  }
}
