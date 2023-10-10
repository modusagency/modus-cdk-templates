import { ExtendedConstruct, ExtendedStack } from './common';
import { ExtendedConstructProps, EcsServiceProps } from './interfaces'
import { Cluster, ContainerImage, FargateService, FargateTaskDefinition, LogDriver, Secret } from 'aws-cdk-lib/aws-ecs'; 
import { Vpc, Port } from 'aws-cdk-lib/aws-ec2';
import { ApplicationListenerRule, ApplicationLoadBalancer, ApplicationTargetGroup, ListenerAction, TargetType, ListenerCondition } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';

interface EcsBuilderProps extends ExtendedConstructProps {
    vpc: Vpc
}
/* 
Microservices Class
*/
export class EcsBuilder extends ExtendedConstruct {
   
    private vpc: Vpc
    private cluster: Cluster
    /**
     * Microservices listener for port 443
     * @example use it to pass to API Gateway or other constructs.
    */
    public httpsListener: any
    /**
     * LoadBalancer construct for microservices.
     * @example use the connections property to modify security groups.
    */
    public loadBalancer: ApplicationLoadBalancer;
  
    /** 
     * Initializes the Microservices class. Use createService() to add multiple services.
     * @function createService(IService)
     * @param vpc Vpc
    */
    constructor(scope: ExtendedStack, id: string, props: EcsBuilderProps) {
        super(scope, id, props);

        // Error handling
        if(!(props.vpc instanceof Vpc)) {
            console.log(`You must pass a valid EC2::VPC to the Microservices class.`)
            process.exit(1)
        } else { 
            this.vpc = props.vpc
        }

        // Internal Application Load Balancer
        this.loadBalancer = new ApplicationLoadBalancer(
            scope,
            this.id.build("loadBalancer"),
            {
                loadBalancerName: this.id.name(),
                vpc: this.vpc,
                internetFacing: true
            }
        )
        // HTTP Listener (Port 80)
        const httpListener = this.loadBalancer.addListener(
            this.id.build("httpListener"),
            {
                defaultAction: ListenerAction.redirect({ protocol: "HTTPS" }),
                port: 80
            }
        )

        // HTTPS Listener (Port 443)
        this.httpsListener = this.loadBalancer.addListener(
            this.id.build("httpListener"),
            {
                defaultAction: ListenerAction.fixedResponse(501),
                port: 443
            }
        )

        // Cluster
        this.cluster = new Cluster(
            scope,
            this.id.build("cluster"),
            {
                vpc: this.vpc,
                clusterName: this.id.name(),
                containerInsights: true
            }
        )

    }

    /**
     * Will generate target group, task definition, container definition, repository, listener rule, and service.
     * @param scope
     * @param props 
     * @returns FargateService
     */
    createService(scope: ExtendedStack, props: EcsServiceProps): FargateService {

        // Target Group
        var targetGroup = new ApplicationTargetGroup(
            scope, 
            this.id.build(`${props.name}-targetGroup`),
            {
                port: 80,
                targetType: TargetType.IP,
                vpc: this.vpc,
                healthCheck: {
                    port: String(props.port),
                    path: props.healthCheckPath
                },
                deregistrationDelay: Duration.seconds(60)
            }
        )
        new ApplicationListenerRule(
            scope,
            this.id.build(`${props.name}-listenerRule`),
            {
                priority: props.priority,
                listener: this.httpsListener,
                targetGroups: [
                    targetGroup
                ],
                conditions: props.conditions
            }
        )
        // Repository
        var imageRepository = new Repository(
            scope,
            this.id.build(`${props.name}-repository`),
            {
                lifecycleRules: [{ maxImageCount: 2 }],
                imageScanOnPush: true,
                removalPolicy: RemovalPolicy.DESTROY
            }
        )
        
        // Task Definition
        let taskDefinition = new FargateTaskDefinition(
            scope,
            this.id.build(`${props.name}-taskDefinition`),
            {
                family: this.id.build(props.name),
                cpu: props.cpu,
                memoryLimitMiB: props.memory
            }
        )
        // Convert Secrets to ecs.Secrets (why, CDK?)
        let containerSecrets: { [key: string]: Secret } | undefined = {}

        if(props.environmentSecrets) { 
            Object.entries(props.environmentSecrets).forEach(([key, value]) => {
                containerSecrets![key] = Secret.fromSecretsManager(value);
            });
        }
        // Container
        taskDefinition.addContainer(
            this.id.build(`${props.name}-container`),
            {
                essential: true,
                image: ContainerImage.fromEcrRepository(imageRepository),
                logging: LogDriver.awsLogs({
                    streamPrefix: this.id.build(props.name),
                    logGroup: new LogGroup(
                        scope,
                        this.id.build(`${props.name}-logGroup`),
                        {
                            logGroupName: this.id.build(props.name),
                            removalPolicy: RemovalPolicy.DESTROY,
                            retention: RetentionDays.ONE_MONTH
                        }
                    )
                }),
                environment: props.environmentVariables,
                secrets: containerSecrets
            }
        ).addPortMappings(
            {
                containerPort: props.port
            }
        )
        // Service
        var service = new FargateService(
            scope,
            this.id.build(`${props.name}-service`),
            {
                cluster: this.cluster,
                serviceName: this.id.build(props.name),
                desiredCount: props.desiredCount,
                taskDefinition: taskDefinition
            }
        )
        // Attach Service to Target Group
        service.attachToApplicationTargetGroup(targetGroup)

        /*
            Autoscaling
        */
       if (props.autoScalingConfig) {
        service.autoScaleTaskCount({
            maxCapacity: props.autoScalingConfig.maximumTasks,
            minCapacity: props.autoScalingConfig.minimumTasks
        })
        .scaleOnCpuUtilization(this.id.build(`${props.name}-scaling`), {
            targetUtilizationPercent: props.autoScalingConfig.cpuTarget ?? 50,
            scaleInCooldown: props.autoScalingConfig.waitInterval,
            scaleOutCooldown: props.autoScalingConfig.waitInterval
        })
       }

        /* 
            Permissions
        */
        // Grant Task Definition read access to ECR repository
        imageRepository.grantPull(taskDefinition.obtainExecutionRole())
        // Grant Service accesss to Load Balancer (For Internal Requests)
        service.connections.allowTo(this.loadBalancer.connections, Port.tcp(80))

        // Return service
        return service
    }

}