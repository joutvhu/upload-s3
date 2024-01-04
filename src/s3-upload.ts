import * as aws from 'aws-sdk';
import * as core from '@actions/core';
import {getInputs, isBlank, S3Inputs, setOutputs} from './io-helper';
import fs from 'fs';
import path from 'path';
import {lookup} from 'mime-types';
import {ManagedUpload} from 'aws-sdk/lib/s3/managed_upload';

interface UploadError {
  Error?: Error;
}

function getFiles(source: string, files: string[] = []): string[] {
  if (fs.statSync(source).isFile()) {
    files.push(source);
  } else {
    const findFiles = (dir: string) => {
      const fileList: string[] = fs.readdirSync(dir)
      for (const file of fileList) {
        const name = path.join(dir.endsWith('/') ? dir : dir + '/', file);
        if (fs.statSync(name).isDirectory()) {
          findFiles(name);
        } else {
          files.push(name);
        }
      }
    };
    findFiles(source);
  }
  return files;
}

function basename(source: string, file: string) {
  const f = path.relative(source, file);
  return isBlank(f) ? path.basename(file) : f;
}

function count(results: (ManagedUpload.SendData | UploadError)[]) {
  const outputs: any = {
    succeeded: 0,
    failed: 0
  };
  for (const result of results) {
    if ('Key' in result && result.Key != null) {
      outputs.succeeded++;
    } else {
      outputs.failed++;
    }
  }
  return outputs;
}

(async function run() {
  try {
    const inputs: S3Inputs = getInputs();

    aws.config.update({
      credentials: {
        accessKeyId: inputs.awsAccessKeyId,
        secretAccessKey: inputs.awsSecretAccessKey,
      },
      region: inputs.awsRegion
    });
    const s3 = new aws.S3({signatureVersion: 'v4'});

    const files = getFiles(inputs.source);
    const requests: Promise<ManagedUpload.SendData | UploadError>[] = [];
    for (const file of files) {
      const name = basename(inputs.source, file);
      const key = path.join(inputs.target, name);
      const contentType = lookup(file) || 'text/plain';
      const request = s3.upload({
        Bucket: inputs.awsBucket,
        Key: key,
        Body: fs.readFileSync(file),
        ContentType: contentType,
        ACL: inputs.acl,
        Expires: inputs.expires
      }).promise()
        .then(value => {
          core.info(`Uploaded ${value.Key}`);
          return value;
        })
        .catch(reason => {
          core.error(reason);
          return {
            Error: reason
          };
        });
      requests.push(request);
    }

    const results = await Promise.all(requests);
    const outputs = count(results);
    setOutputs(outputs);

    core.info(`Uploaded ${outputs.succeeded} files successfully and ${outputs.failed} files failed.`);
    if (inputs.ignoreError != true && outputs.failed > 0) {
      throw new Error(`Upload ${outputs.failed} files failed`);
    }
  } catch (err: any) {
    core.debug(`Error status: ${err.status}`);
    core.setFailed(err.message);
  }
})();
