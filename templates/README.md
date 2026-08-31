# Workspace templates

These are the **seed sources** for new workspaces. init-service does not generate
them — on `POST /project` it copies `s3://<bucket>/base/<language>/` to
`s3://<bucket>/code/<replId>/`, and the workspace pod's initContainer then pulls
`code/<replId>/` onto its volume. So the `base/<language>/` prefix must already
exist in your bucket. These files are what you upload there, once per bucket.

Supported languages (see init-service validation): `node-js`, `python`.

## Seed a bucket

Real S3:

```bash
aws s3 cp templates/node-js s3://$S3_BUCKET/base/node-js/ --recursive
aws s3 cp templates/python  s3://$S3_BUCKET/base/python/  --recursive
```

Local MinIO (from `docker-compose.yml`, creds `minioadmin:minioadmin`):

```bash
aws --endpoint-url http://localhost:9000 \
    s3 cp templates/node-js s3://repl/base/node-js/ --recursive
aws --endpoint-url http://localhost:9000 \
    s3 cp templates/python  s3://repl/base/python/  --recursive
```

Add a new language by creating `templates/<language>/` here, uploading it to
`base/<language>/`, and adding `<language>` to the allow-list in
`init-service/src/validation.ts`.
