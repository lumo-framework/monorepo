import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  Vpc,
  SubnetType,
  IpAddresses,
  SecurityGroup,
  Port,
  Peer,
} from 'aws-cdk-lib/aws-ec2';

export interface NetworkingStackProps extends StackProps {
  projectName: string;
  environment: string;
  natGateways: number;
}

export interface NetworkingStackExports {
  vpcId: string;
  privateSubnetIds: string[];
  publicSubnetIds: string[];
  lambdaSecurityGroupId: string;
  availabilityZones: string[];
}

export class NetworkingStack extends Stack {
  public readonly vpc: Vpc;
  public readonly lambdaSecurityGroup: SecurityGroup;
  public readonly exports: NetworkingStackExports;

  constructor(scope: Construct, id: string, props: NetworkingStackProps) {
    super(scope, id, props);

    const { projectName, environment, natGateways } = props;

    // Create subnet configuration based on NAT gateway setup
    const subnetConfiguration = [
      {
        cidrMask: 24,
        name: 'Public',
        subnetType: SubnetType.PUBLIC,
      },
    ];

    // Only add private subnets if NAT gateways are configured
    if (natGateways > 0) {
      subnetConfiguration.push({
        cidrMask: 24,
        name: 'Private',
        subnetType: SubnetType.PRIVATE_WITH_EGRESS,
      });
    }

    // Create VPC with configurable NAT gateways
    this.vpc = new Vpc(this, 'VPC', {
      ipAddresses: IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 3, // Use up to 3 AZs for high availability
      natGateways: natGateways, // Configurable NAT gateways (0=no egress, 1=cost-effective, 2-3=HA)
      subnetConfiguration,
      enableDnsHostnames: true,
      enableDnsSupport: true,
    });

    // Create security group for Lambda functions
    this.lambdaSecurityGroup = new SecurityGroup(this, 'LambdaSecurityGroup', {
      vpc: this.vpc,
      description: 'Security group for Lambda functions',
      allowAllOutbound: true, // Allow all outbound traffic
    });

    // Allow Lambda functions to communicate with each other
    this.lambdaSecurityGroup.addIngressRule(
      this.lambdaSecurityGroup,
      Port.allTraffic(),
      'Allow communication between Lambda functions'
    );

    // Allow HTTPS outbound traffic explicitly (redundant with allowAllOutbound but good for documentation)
    this.lambdaSecurityGroup.addEgressRule(
      Peer.anyIpv4(),
      Port.tcp(443),
      'Allow HTTPS outbound traffic'
    );

    // Prepare exports
    this.exports = {
      vpcId: this.vpc.vpcId,
      privateSubnetIds: this.vpc.privateSubnets.map(
        (subnet) => subnet.subnetId
      ),
      publicSubnetIds: this.vpc.publicSubnets.map((subnet) => subnet.subnetId),
      lambdaSecurityGroupId: this.lambdaSecurityGroup.securityGroupId,
      availabilityZones: this.vpc.availabilityZones,
    };

    // Export VPC resources for cross-stack reference
    new CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      exportName: `${projectName}-${environment}-VpcId`,
      description: 'VPC ID for cross-stack reference',
    });

    // Only export private subnet IDs if they exist
    if (this.vpc.privateSubnets.length > 0) {
      new CfnOutput(this, 'PrivateSubnetIds', {
        value: this.vpc.privateSubnets
          .map((subnet) => subnet.subnetId)
          .join(','),
        exportName: `${projectName}-${environment}-PrivateSubnetIds`,
        description: 'Private subnet IDs for Lambda functions',
      });
    }

    new CfnOutput(this, 'PublicSubnetIds', {
      value: this.vpc.publicSubnets.map((subnet) => subnet.subnetId).join(','),
      exportName: `${projectName}-${environment}-PublicSubnetIds`,
      description:
        'Public subnet IDs for load balancers or other public resources',
    });

    new CfnOutput(this, 'LambdaSecurityGroupId', {
      value: this.lambdaSecurityGroup.securityGroupId,
      exportName: `${projectName}-${environment}-LambdaSecurityGroupId`,
      description: 'Security group ID for Lambda functions',
    });

    new CfnOutput(this, 'AvailabilityZones', {
      value: this.vpc.availabilityZones.join(','),
      exportName: `${projectName}-${environment}-AvailabilityZones`,
      description: 'Availability zones used by the VPC',
    });

    // Export individual subnet IDs for easier reference
    // Only export individual private subnets if they exist
    if (this.vpc.privateSubnets.length > 0) {
      this.vpc.privateSubnets.forEach((subnet, index) => {
        new CfnOutput(this, `PrivateSubnet${index + 1}Id`, {
          value: subnet.subnetId,
          exportName: `${projectName}-${environment}-PrivateSubnet${index + 1}Id`,
          description: `Private subnet ${index + 1} ID`,
        });
      });
    }

    this.vpc.publicSubnets.forEach((subnet, index) => {
      new CfnOutput(this, `PublicSubnet${index + 1}Id`, {
        value: subnet.subnetId,
        exportName: `${projectName}-${environment}-PublicSubnet${index + 1}Id`,
        description: `Public subnet ${index + 1} ID`,
      });
    });
  }
}
