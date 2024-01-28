import * as aws from 'aws-sdk';
import * as core from '@actions/core';
import {getInputs, S3Inputs, setOutputs} from './io-helper';
import fs from 'fs';
import path from 'path';
import {lookup} from 'mime-types';
import {ManagedUpload} from 'aws-sdk/lib/s3/managed_upload';
import {ListObjectsV2Output, ObjectIdentifierList, ObjectList, StartAfter} from 'aws-sdk/clients/s3';

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

function count(results: (ManagedUpload.SendData | UploadError)[]) {
  const outputs: any = {
    succeeded: 0,
    failed: 0,
    deleted: 0
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

    const keys: string[] = [];
    const files = getFiles(inputs.source);
    const requests: Promise<ManagedUpload.SendData | UploadError>[] = [];
    for (const file of files) {
      const name = path.relative(inputs.source, file);
      const key = path.join(inputs.target, name);
      const contentType = lookup(file) || 'text/plain';
      keys.push(key);
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
          if (inputs.ignoreError != true)
            core.error(reason);
          else
            core.warning(reason);
          return {
            Error: reason
          };
        });
      requests.push(request);
    }

    const results = await Promise.all(requests);
    const outputs = count(results);
    if (inputs.ignoreError != true && outputs.failed > 0) {
      throw new Error(`Upload ${outputs.failed} files failed`);
    }

    if (inputs.delete === true) {
      let startAfter: StartAfter | undefined = undefined;
      let objects: ListObjectsV2Output | undefined;
      core.info('Deleting files not present at local.');
      do {
        objects = await s3.listObjectsV2({
          Bucket: inputs.awsBucket,
          Prefix: inputs.target,
          StartAfter: startAfter
        }).promise();
        const contents: ObjectList = objects.Contents ?? [];

        const deleteObjects: ObjectIdentifierList = [];
        for (const content of contents) {
          if (content?.Key != null && !keys.includes(content.Key)) {
            deleteObjects.push({
              Key: content.Key
            });
          }
        }

        if (deleteObjects.length > 0) {
          const deleteResult = await s3.deleteObjects({
            Bucket: inputs.awsBucket,
            Delete: {
              Objects: deleteObjects
            }
          }).promise();
          for (const value of deleteResult.Deleted ?? []) {
            core.info(`Deleted ${value.Key}`);
            outputs.deleted++;
          }
          for (const value of deleteResult.Errors ?? []) {
            core.warning(`Cannot delete ${value.Key}; code: ${value.Code}, message: ${value.Message}`);
          }
        }

        if (objects.MaxKeys != null &&
          objects.MaxKeys === objects.KeyCount &&
          objects.KeyCount === contents.length &&
          contents.length > 0) {
          startAfter = objects.Contents?.at(-1)?.Key;
        }
      } while (startAfter != null);
    }

    core.info(`Uploaded ${outputs.succeeded} files successfully and ${outputs.failed} files failed.`);
    setOutputs(outputs);
  } catch (err: any) {
    core.setFailed(err.message);
  }
})();
