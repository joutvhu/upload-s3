# Upload S3

GitHub action to upload files to Amazon S3.

## Usage

See [action.yml](action.yml)

## Inputs

- `aws_access_key_id`: (__Required__) The AWS access key ID.
- `aws_secret_access_key`: (__Required__) The AWS secret access key.
- `aws_region`: (__Required__) The region to send service requests to.
- `aws_bucket`: (__Required__) The bucket name to which the PUT action was initiated.
- `source`: The local directory (or file) you wish to upload to S3. Default is current directory.
- `target`: The directory (or file path) on the bucket to upload files. Default is root directory.
- `acl`: The canned ACL to apply to the objects. Options: `private`, `public-read`, `public-read-write`, `authenticated-read`, `aws-exec-read`, `bucket-owner-read`, `bucket-owner-full-control`, string. Default: `private`.
- `expires`: The date and time at which the object is no longer cacheable.
- `delete`: Delete files not present at local. Default: `false`.

## Example

```yaml
steps:
  - uses: joutvhu/upload-s3@v1
    with:
      aws_access_key_id: ${{ secrets.AWS_ACCESS_KEY_ID }}
      aws_secret_access_key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
      aws_region: joutvhu
      aws_bucket: ${{ secrets.AWS_BUCKET }}
      source: './dist'
      target: ''
      acl: public-read
      delete: true
```
