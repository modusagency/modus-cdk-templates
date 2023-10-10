#!/usr/bin/env node
import 'source-map-support/register';
import { App, Tags } from 'aws-cdk-lib';
import { NonProdWebStack } from '../lib/nonprod-stack';

const app = new App();

const modusWebDev = new NonProdWebStack(app, 'modus-web-nprd', {
  appName: "modus",
  environment: "nprd"
});

Tags.of(app).add("Client", "modus")
Tags.of(modusWebDev).add("Environment", "nprd");
