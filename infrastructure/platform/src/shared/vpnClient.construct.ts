/*
 *  Copyright Amazon.com Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import { CfnClientVpnTargetNetworkAssociation, CfnClientVpnEndpoint, CfnClientVpnAuthorizationRule, CfnClientVpnRoute, IVpc, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import * as certManager from 'aws-cdk-lib/aws-certificatemanager';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface VpnConstructProperties {
	environment: string;
	certArn: string;
	clientArn: string;
	vpc: IVpc;
	auroraSecurityGroup: SecurityGroup;
}

export class VpnClient extends Construct {
	// creating server and clients certs is best done by following the AWS page on:
	// https://docs.aws.amazon.com/de_de/vpn/latest/clientvpn-admin/authentication-authorization.html#mutual

	constructor(scope: Construct, id: string, props?: VpnConstructProperties) {
		super(scope, id);

		const clientCert = certManager.Certificate.fromCertificateArn(this, 'ClientCertificate', props.clientArn);
		const serverCert = certManager.Certificate.fromCertificateArn(this, 'ServerCertificate', props.certArn);

		const logGroup = new logs.LogGroup(this, 'ClientVpnLogGroup', {
			retention: logs.RetentionDays.ONE_MONTH,
		});

		const logStream = logGroup.addStream('ClientVpnLogStream');

		const vpnSecurityGroup = new SecurityGroup(this, id.concat(`vpn-client-sg-${props.environment}`), {
			vpc: props.vpc,
			description: `vpn-client-sg-${props.environment}`,
			securityGroupName: `vpn-client-sg-${props.environment}`,
			allowAllOutbound: true,
		});

		const endpoint = new CfnClientVpnEndpoint(this, 'ClientVpnEndpoint2', {
			description: 'VPN',
			vpnPort: 443,
			securityGroupIds: [props.auroraSecurityGroup.securityGroupId, vpnSecurityGroup.securityGroupId],
			vpcId: props.vpc.vpcId,
			authenticationOptions: [
				{
					type: 'certificate-authentication',
					mutualAuthentication: {
						clientRootCertificateChainArn: clientCert.certificateArn,
					},
				},
			],
			tagSpecifications: [
				{
					resourceType: 'client-vpn-endpoint',
					tags: [
						{
							key: 'Name',
							value: `sif-${props.environment} Client VPN`,
						},
					],
				},
			],
			clientCidrBlock: '10.1.132.0/22',
			connectionLogOptions: {
				enabled: true,
				cloudwatchLogGroup: logGroup.logGroupName,
				cloudwatchLogStream: logStream.logStreamName,
			},
			serverCertificateArn: serverCert.certificateArn,
			splitTunnel: true,
			dnsServers: ['8.8.8.8', '8.8.4.4'],
		});

		let i = 0;
		const dependables: CfnClientVpnTargetNetworkAssociation[] = [];
		props?.vpc.privateSubnets.map((subnet) => {
			let networkAsc = new CfnClientVpnTargetNetworkAssociation(this, 'ClientVpnNetworkAssociation-' + i, {
				clientVpnEndpointId: endpoint.ref,
				subnetId: subnet.subnetId,
			});
			dependables.push(networkAsc);
			i++;
		});

		new CfnClientVpnAuthorizationRule(this, 'ClientVpnAuthRule', {
			clientVpnEndpointId: endpoint.ref,
			targetNetworkCidr: '0.0.0.0/0',
			authorizeAllGroups: true,
			description: 'Allow all',
		});

		let x = 0;
		props?.vpc.privateSubnets.map((_subnet) => {
			const route = new CfnClientVpnRoute(this, `CfnClientVpnRoute${x}`, {
				clientVpnEndpointId: endpoint.ref,
				destinationCidrBlock: '0.0.0.0/0',
				description: 'Route to all',
				targetVpcSubnetId: props?.vpc.privateSubnets[x].subnetId!,
			});
			dependables.map((o) => route.addDependsOn(o));
			x++;
		});
	}
}
