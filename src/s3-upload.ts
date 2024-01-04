import * as aws from 'aws-sdk';
import * as core from '@actions/core';
import {getInputs, S3Inputs, setOutputs} from './io-helper';
import fs from 'fs';
import path from 'path';
import {lookup} from 'mime-types';
import {ManagedUpload} from 'aws-sdk/lib/s3/managed_upload';

function getFiles(dir: string, files: string[] = []): string[] {
  const fileList: string[] = fs.readdirSync(dir)
  for (const file of fileList) {
    const name = path.join(dir.endsWith('/') ? dir : dir + '/', file);
    if (fs.statSync(name).isDirectory()) {
      getFiles(name, files);
    } else {
      files.push(name);
    }
  }
  return files
}

interface UploadError {
  Error?: Error;
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
    const p: Promise<ManagedUpload.SendData | UploadError>[] = [];
    for (const file of files) {
      const f = path.relative(inputs.source, file);
      const key = path.join(inputs.target, f);
      const contentType = lookup(file) || 'text/plain';
      const u = s3.upload({
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
      p.push(u);
    }

    const outputs: any = {
      succeeded: 0,
      failed: 0
    };
    const results = await Promise.all(p);
    for (const r of results) {
      if ('Key' in r && r.Key != null) {
        outputs.succeeded++;
      } else {
        outputs.failed++;
      }
    }
    core.info(`Uploaded ${outputs.succeeded} files successfully and ${outputs.failed} files failed.`)
    if (inputs.throwing && outputs.failed > 0) {
      throw new Error(`Upload ${outputs.failed} files failed`);
    }
    setOutputs(outputs);
  } catch (err: any) {
    core.debug(`Error status: ${err.status}`);
    core.setFailed(err.message);
  }
})();
