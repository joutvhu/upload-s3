import * as core from '@actions/core';
import {InputOptions} from '@actions/core';
import {Inputs, Outputs} from './constants';
import {Expires, ObjectCannedACL} from 'aws-sdk/clients/s3';

export interface S3Inputs {
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsRegion: string;
  awsBucket: string;
  source: string;
  target: string;
  acl?: ObjectCannedACL;
  expires?: Expires;
  delete?: boolean;
  ignoreError?: boolean;
}

export function isBlank(value: any): boolean {
  return value === null || value === undefined || (value.length !== undefined && value.length === 0);
}

export function isNotBlank(value: any): boolean {
  return value !== null && value !== undefined && (value.length === undefined || value.length > 0);
}

export function getBooleanInput(name: string, options?: InputOptions): boolean {
  const value = core.getInput(name, options);
  return isNotBlank(value) &&
    ['y', 'yes', 't', 'true', 'e', 'enable', 'enabled', 'on', 'ok', '1']
      .includes(value.trim().toLowerCase());
}

/**
 * Helper to get all the inputs for the action
 */
export function getInputs(): S3Inputs {
  const result: S3Inputs | any = {};

  result.awsAccessKeyId = core.getInput(Inputs.AwsAccessKeyId, {required: true});
  result.awsSecretAccessKey = core.getInput(Inputs.AwsSecretAccessKey, {required: true});
  result.awsRegion = core.getInput(Inputs.AwsRegion, {required: true});
  result.awsBucket = core.getInput(Inputs.AwsBucket, {required: true});

  result.source = core.getInput(Inputs.Source, {required: false}) ?? '.';
  result.target = core.getInput(Inputs.Target, {required: false}) ?? '';

  result.acl = core.getInput(Inputs.Acl, {required: false});
  if (isNotBlank(result.acl)) {
    result.acl = 'private';
  }

  const expires = core.getInput(Inputs.Expires, {required: false});
  if (isNotBlank(expires)) {
    result.expires = new Date(expires);
    if (result.expires <= Date.now()) {
      result.expires = undefined;
    }
  }

  result.delete = getBooleanInput(Inputs.Delete, {required: false});

  result.ignoreError = getBooleanInput(Inputs.IgnoreError, {required: false});

  return result;
}

export function setOutputs(response: any, log?: boolean) {
  // Get the outputs for the created release from the response
  let message = '';
  for (const key in Outputs) {
    const field: string = (Outputs as any)[key];
    if (log)
      message += `\n  ${field}: ${JSON.stringify(response[field])}`;
    core.setOutput(field, response[field]);
  }

  if (log)
    core.info('Outputs:' + message);
}
