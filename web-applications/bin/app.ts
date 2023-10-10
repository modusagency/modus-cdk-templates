#!/usr/bin/env node
import 'source-map-support/register';
import { App, Tags } from 'aws-cdk-lib';
import { NonProdWebStack } from '../lib/nonprod-stack';

const app = new App();

const modusWebDev = new NonProdWebStack(app, 'modus-web-nprd', {
  appName: "modus",
  environment: "nprd",
  defaultCertificateArn: "arn:aws:acm:us-east-1:123456:certificate/test",
  env: {
    account: "123456",
    region: "us-east-1"
  }
});

Tags.of(app).add("Client", "modus")
Tags.of(modusWebDev).add("Environment", "nprd");
