import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { contentAddress, orgStorageKey } from "@ratify/shared";

export interface ObjectStoreOptions {
  endpoint?: string;
  region?: string;
  bucket: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
}

/**
 * S3-compatible object storage wrapper (works against real AWS S3 or
 * MinIO). Used for repository snapshots, diffs, parsed artifacts, LLM
 * prompt/response payloads, webhook payload bodies, and other large
 * immutable blobs that shouldn't live in Postgres.
 */
export class ObjectStore {
  private readonly client: S3Client;
  readonly bucket: string;

  constructor(options: ObjectStoreOptions) {
    this.bucket = options.bucket;
    const config: S3ClientConfig = {
      region: options.region ?? "us-east-1",
      forcePathStyle: options.forcePathStyle ?? true, // required for MinIO
    };
    if (options.endpoint) config.endpoint = options.endpoint;
    if (options.accessKeyId && options.secretAccessKey) {
      config.credentials = {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      };
    }
    this.client = new S3Client(config);
  }

  /** Puts an object under an explicit key (caller controls path shape). */
  async putObject(key: string, body: Buffer | string, contentType = "application/octet-stream"): Promise<{ contentHash: string }> {
    const buffer = typeof body === "string" ? Buffer.from(body, "utf-8") : body;
    const contentHash = contentAddress(buffer);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        Metadata: { "content-hash": contentHash },
      }),
    );
    return { contentHash };
  }

  /**
   * Content-addressed put: derives the key from org + logical prefix + hash
   * of the content itself, so identical content is naturally deduplicated
   * and immutable (never overwritten in place).
   */
  async putContentAddressed(
    orgId: string,
    prefix: string,
    body: Buffer | string,
    contentType = "application/octet-stream",
  ): Promise<{ key: string; contentHash: string }> {
    const buffer = typeof body === "string" ? Buffer.from(body, "utf-8") : body;
    const contentHash = contentAddress(buffer);
    const key = orgStorageKey(orgId, prefix, contentHash.replace("sha256:", ""));
    await this.putObject(key, buffer, contentType);
    return { key, contentHash };
  }

  async getObject(key: string): Promise<Buffer> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const chunks: Uint8Array[] = [];
    for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  /** Lists all object keys under a prefix, paginating through S3's 1000-key-per-page limit. */
  async listObjectKeys(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;

    do {
      const result = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      for (const obj of result.Contents ?? []) {
        if (obj.Key) keys.push(obj.Key);
      }
      continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
    } while (continuationToken);

    return keys;
  }
}

let sharedStore: ObjectStore | undefined;

export function getObjectStore(): ObjectStore {
  if (sharedStore) return sharedStore;
  sharedStore = new ObjectStore({
    endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
    region: process.env.S3_REGION ?? "us-east-1",
    bucket: process.env.S3_BUCKET ?? "ratify-artifacts",
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "ratify",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "ratify-secret",
    forcePathStyle: true,
  });
  return sharedStore;
}
