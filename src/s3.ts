import type { ApiConfig } from "./config";

export async function uploadVideoToS3(
  cfg: ApiConfig,
  key: string,
  filePath: string,
  contentType: string,
) {
  const s3FileReference = cfg.s3Client.file(key, { bucket: cfg.s3Bucket });
  const localTempFile = Bun.file(filePath);
  await s3FileReference.write(localTempFile, { type: contentType });
}
