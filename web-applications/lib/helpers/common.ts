import { Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ExtendedConstructProps, ExtendedStackProps } from './interfaces'
/** 
 * IdBuilder generates a string to be used for CDK constructors or stacks id's 
 * in order to keep a naming convention using BaseProps 
 */
export class IdBuilder {
  
  private baseId: string;

  constructor(props: ExtendedStackProps) {
    this.baseId = [
        props.appName, 
        props.environment, 
        props.uniqueIdentifier
    ].filter(n => n).join("-")
  }

  build(resourceName: string) {
    return [this.baseId, resourceName].join("-")
  }

  name() {
    return this.baseId
  }
}

/** 
 * Base Stack with defined variables and IdBuilder
 */
export class ExtendedStack extends Stack {

  id: IdBuilder

  constructor(scope: Construct, id: string, props: ExtendedStackProps) {
    super(scope, id, props);

    this.id = new IdBuilder({ 
        appName: props.appName, 
        environment: props.environment,
        uniqueIdentifier: props.uniqueIdentifier
    });
  }
}
/** 
 * Base Construct with defined variables and IdBuilder
 */
export class ExtendedConstruct extends Construct {

    id: IdBuilder
  
    constructor(scope: ExtendedStack, id: string, props: ExtendedConstructProps) {
      super(scope, id);
  
      this.id = props.IdBuilder
    }
  }
