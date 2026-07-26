import { S3 } from "aws-sdk"

const s3 = new S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    endpoint: process.env.S3_ENDPOINT
})

export async function copyS3Folder(sourcePrefix: string, destinationPrefix: string, continuationToken?: string): Promise<void> {
    // List all objects in the source folder. Errors are intentionally left to
    // propagate so the caller can mark the repl as "failed" instead of silently
    // reporting a partially-copied template as ready.
    const listParams = {
        Bucket: process.env.S3_BUCKET ?? "",
        Prefix: sourcePrefix,
        ContinuationToken: continuationToken
    };

    const listedObjects = await s3.listObjectsV2(listParams).promise();

    if (!listedObjects.Contents || listedObjects.Contents.length === 0) return;

    // Copy each object to the new location
    // We're doing it parallely here, using promise.all()
    await Promise.all(listedObjects.Contents.map(async (object) => {
        if (!object.Key) return;
        const destinationKey = object.Key.replace(sourcePrefix, destinationPrefix);
        const copyParams = {
            Bucket: process.env.S3_BUCKET ?? "",
            CopySource: `${process.env.S3_BUCKET}/${object.Key}`,
            Key: destinationKey
        };

        await s3.copyObject(copyParams).promise();
        console.log(`Copied ${object.Key} to ${destinationKey}`);
    }));

    // Check if the list was truncated and continue copying if necessary.
    // Advance using the *next* token returned by S3 (not the original arg),
    // otherwise pagination would re-list the same first page forever.
    if (listedObjects.IsTruncated) {
        await copyS3Folder(sourcePrefix, destinationPrefix, listedObjects.NextContinuationToken);
    }
}

export const saveToS3 = async (key: string, filePath: string, content: string): Promise<void> => {
    const params = {
        Bucket: process.env.S3_BUCKET ?? "",
        Key: `${key}${filePath}`,
        Body: content
    }

    await s3.putObject(params).promise()
}