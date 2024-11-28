import {Upload} from '@aws-sdk/lib-storage';
import {
  CompleteMultipartUploadCommandOutput,
  DeleteObjectsCommand,
  ObjectIdentifier,
  paginateListObjectsV2,
  S3Client,
  waitUntilObjectNotExists
} from '@aws-sdk/client-s3';
import * as core from '@actions/core';
import {getInputs, S3Inputs, setOutputs} from './io-helper';
import fs from 'fs';
import path from 'path';
import {lookup} from 'mime-types';

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

function count(results: (CompleteMultipartUploadCommandOutput | UploadError)[]) {
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

    const s3 = new S3Client({
      credentials: {
        accessKeyId: inputs.awsAccessKeyId,
        secretAccessKey: inputs.awsSecretAccessKey,
      },
      region: inputs.awsRegion,
    });

    const keys: string[] = [];
    const files = getFiles(inputs.source);
    const requests: Promise<CompleteMultipartUploadCommandOutput | UploadError>[] = [];
    for (const file of files) {
      const name = path.relative(inputs.source, file);
      const key = path.join(inputs.target, name);
      const contentType = lookup(file) || 'text/plain';
      keys.push(key);
      const request = new Upload({
        client: s3,
        params: {
          Bucket: inputs.awsBucket,
          Key: key,
          Body: fs.readFileSync(file),
          ContentType: contentType,
          ACL: inputs.acl,
          Expires: inputs.expires
        },
      }).done()
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
      core.info('Deleting files not present at local.');
      const paginator = paginateListObjectsV2(
        {
          client: s3,
          pageSize: 500
        },
        {
          Bucket: inputs.awsBucket,
          Prefix: inputs.target
        },
      );

      for await (const page of paginator) {
        const contents = page.Contents ?? [];

        const deleteObjects: Array<ObjectIdentifier> = [];
        for (const content of contents) {
          if (content?.Key != null && !keys.includes(content.Key)) {
            deleteObjects.push({
              Key: content.Key
            });
          }
        }

        if (deleteObjects.length > 0) {
          const deleteResult = await s3.send(
            new DeleteObjectsCommand({
              Bucket: inputs.awsBucket,
              Delete: {
                Objects: deleteObjects
              },
            }),
          );
          for (const key in keys) {
            await waitUntilObjectNotExists(
              {
                client: s3,
                maxWaitTime: 1800
              },
              {
                Bucket: inputs.awsBucket,
                Key: key
              },
            );
          }
          for (const value of deleteResult.Deleted ?? []) {
            core.info(`Deleted ${value.Key}`);
            outputs.deleted++;
          }
          for (const value of deleteResult.Errors ?? []) {
            core.warning(`Cannot delete ${value.Key}; code: ${value.Code}, message: ${value.Message}`);
          }
        }
      }
    }

    core.info(`Uploaded ${outputs.succeeded} files successfully and ${outputs.failed} files failed.`);
    setOutputs(outputs);
  } catch (err: any) {
    core.setFailed(err.message);
  }
})();
