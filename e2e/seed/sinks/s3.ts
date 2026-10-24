import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import type { FileSink } from "../files";

export interface S3Target {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export async function s3Sink(target: S3Target): Promise<FileSink> {
  const s3 = new S3Client({
    endpoint: target.endpoint,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: target.accessKeyId,
      secretAccessKey: target.secretAccessKey,
    },
  });

  const exists = await s3
    .send(new HeadBucketCommand({ Bucket: target.bucket }))
    .then(() => true)
    .catch(() => false);
  if (!exists) {
    await s3.send(new CreateBucketCommand({ Bucket: target.bucket }));
  }

  await s3.send(
    new PutBucketCorsCommand({
      Bucket: target.bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: ["*"],
            AllowedMethods: ["GET", "PUT", "HEAD", "POST", "DELETE"],
            AllowedHeaders: ["*"],
            ExposeHeaders: ["ETag"],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  );

  return {
    area: "s3",
    label: `s3://${target.bucket}`,
    async put(key, body, contentType) {
      await s3.send(
        new PutObjectCommand({
          Bucket: target.bucket,
          Key: key,
          Body: body,
          ...(contentType ? { ContentType: contentType } : {}),
        }),
      );
    },
  };
}
