import { Duration, StackProps } from "aws-cdk-lib";
import { IdBuilder } from "./common";
import { ISecret } from "aws-cdk-lib/aws-secretsmanager";
import { ListenerCondition } from "aws-cdk-lib/aws-elasticloadbalancingv2";
/**
 * Extended Stack and Construct interfaces.
 */
export interface ExtendedStackProps extends StackProps {
    /** 
     * Name for your application. Extracted from configuration (Config) file. 
     */ 
    readonly appName: string,
    /** 
     * Environment name. Extracted from context. 
     */ 
    readonly environment: string,
    /** 
     * (Optional) Unique identifier to be added to Logical IDs. 
     */ 
    readonly uniqueIdentifier?: string
}
export interface ExtendedConstructProps {
    readonly IdBuilder: IdBuilder
}
/**
 * Service Interface
 */
export interface EcsServiceProps {
    readonly name: string,
    /** Priority for Load Balancer.
     * Must be unique. */
    readonly priority: number
    /** Port your application is listening to. */
    readonly port: number
    /** ListenerCondition your application is listening to. 
     * Must be unique within the microservices. */
    readonly conditions: ListenerCondition[]
    /** Health check for your application.
     * Must be reachable without tokens or auth and return statusCode 200 */
    readonly healthCheckPath: string
    /** CPU value 
     * https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate.html
     * @default 256
     */
    readonly cpu?: number
      /** Memory value 
       * https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate.html
     * @default 512
     */
    readonly memory?: number
    /** How many tasks to run for this Service. */
    readonly desiredCount: number,
    /** Environent variables to pass to running tasks. */
    readonly environmentVariables?: {
      [key: string]: string;
    },
    /** Environent Secrets to pass to running tasks. */
    readonly environmentSecrets?: {
      [key: string]: ISecret;
    },
    /** Autoscaling configuration */
    readonly autoScalingConfig?: {
      minimumTasks: number,
      maximumTasks: number,
      /** CPU Target Utilization
       * @default 50 (%)
      */
      cpuTarget?: number,
      /** Wait Interval before ScaleIn / ScaleOut
       * @default 300 (seconds)
      */
      waitInterval?: Duration
    }
}