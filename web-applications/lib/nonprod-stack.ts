import { Construct } from 'constructs';
import { ExtendedStack } from './helpers/common';
import { ExtendedStackProps } from './helpers/interfaces';
import { IpAddresses, Vpc } from 'aws-cdk-lib/aws-ec2';
import { BlockPublicAccess, Bucket, BucketAccessControl } from 'aws-cdk-lib/aws-s3';
import { EcsBuilder } from './helpers/ecs-cluster';
import { ListenerCondition } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { AllowedMethods, CachePolicy, Distribution, OriginRequestPolicy, PriceClass, ResponseHeadersPolicy, ViewerProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { LoadBalancerV2Origin, S3Origin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { AuroraCapacityUnit, AuroraMysqlEngineVersion, ClusterInstance, DatabaseCluster, DatabaseClusterEngine, DatabaseInstance, ServerlessCluster } from 'aws-cdk-lib/aws-rds';
import { Duration } from 'aws-cdk-lib';

export class NonProdWebStack extends ExtendedStack {
  constructor(scope: Construct, id: string, props: ExtendedStackProps) {
    super(scope, id, props);

    /**
     * VPC Network for all non-production workloads.
     * CIDR should differ from Production.
     * Alternatively to AWS NAT Gateways, you can create an EC2 with solutions like AlterNAT.
     */
    const vpc = new Vpc(this, this.id.build("vpc"), {
      vpcName: this.id.name(),
      maxAzs: 2,
      natGateways: 1,
      ipAddresses: IpAddresses.cidr("10.10.0.0/16")
    })

    /** 
     * Private S3 bucket to store media, static HTML/CSS/JS files.
     */
    const mediaBucket = new Bucket(this, this.id.build("media"), {
      accessControl: BucketAccessControl.PRIVATE,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL
    })

    /** 
     * Database Serverless Cluster with RDS Aurora MySQL
     */
    const srvDbCluster = new ServerlessCluster(this, this.id.build("SrvDbCluster"), {
      engine: DatabaseClusterEngine.auroraMysql({ 
        version: AuroraMysqlEngineVersion.VER_3_04_0
      }),
      vpc: vpc,
      scaling: {
        autoPause: Duration.minutes(15),
        minCapacity: 1,
        maxCapacity: 2
      }
    })

    /** 
     * ECS Builder (Custom Class) for our containers.
     * Will generate load balancer with listeners (80 -> 443, 443)
     */
    const ecsBuilder = new EcsBuilder(this, this.id.build("ecsBuilder"), {
      vpc: vpc,
      IdBuilder: this.id
    })

    /**
     * API Service
     */
    const apiSvc = ecsBuilder.createService(this, {
      name: "api",
      priority: 1,
      port: 8000,
      desiredCount: 1,
      healthCheckPath: "/health",
      conditions: [
        ListenerCondition.hostHeaders(["api.modus-sandbox.com"])
      ],
      environmentVariables: {
        PORT: "8000"
      },
      environmentSecrets: {
        "TOKEN": new Secret(this, this.id.build("api-token")),
        "DB": srvDbCluster.secret!
      }
    })
    // Give Service access to DB Cluster
    srvDbCluster.connections.allowDefaultPortFrom(apiSvc)
    
    /** 
     * Web Service (ie: nginx) serving web files
     */
    ecsBuilder.createService(this, {
      name: "nginx",
      priority: 1,
      port: 80,
      desiredCount: 1,
      healthCheckPath: "/",
      conditions: [
        ListenerCondition.hostHeaders(["modus-sandbox.com"])
      ],
      environmentVariables: {
        PORT: "80"
      }
    })

    /**
     * Cloudfront Distribution to cache S3 and ECS Load Balancer
     */
    new Distribution(this, this.id.build("cdn"), {
      certificate: Certificate.fromCertificateArn(this, this.id.build("certificate"), "IMPORT_YOUR_CERT_ARN"),
      defaultBehavior: {
        origin: new LoadBalancerV2Origin(ecsBuilder.loadBalancer),
        allowedMethods: AllowedMethods.ALLOW_ALL,
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: CachePolicy.CACHING_DISABLED,
        responseHeadersPolicy: ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS,
        originRequestPolicy: OriginRequestPolicy.ALL_VIEWER,
        compress: true
      },
      additionalBehaviors: {
        "/media": {
          origin: new S3Origin(mediaBucket),
          allowedMethods: AllowedMethods.ALLOW_GET_HEAD,
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: CachePolicy.CACHING_OPTIMIZED,
          responseHeadersPolicy: ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_AND_SECURITY_HEADERS,
          originRequestPolicy: OriginRequestPolicy.CORS_S3_ORIGIN,
          compress: true
        }
      },
      priceClass: PriceClass.PRICE_CLASS_100
    })

  }
}
