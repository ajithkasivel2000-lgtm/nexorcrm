const fs = require('fs');
const path = require('path');

/**
 * Where uploaded files live: the server's disk by default, or an S3-compatible
 * bucket (AWS S3, DigitalOcean Spaces, Cloudflare R2, MinIO) when S3_BUCKET is
 * set. Callers only ever deal in keys like "teamchat/<uuid>.jpg" or
 * "<company>/documents/<uuid>", so switching is a configuration change.
 *
 *   S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
 *   S3_ENDPOINT      only for non-AWS providers, e.g. https://blr1.digitaloceanspaces.com
 *   S3_PREFIX        optional folder inside the bucket
 *
 * Objects stay private in the bucket: the app streams them to the browser
 * after its own checks, so moving to S3 never makes a file public.
 */

const ROOT = path.join(__dirname, '..', 'uploads');

const useS3 = () => Boolean(process.env.S3_BUCKET);

let s3 = null;
function s3Client() {
  if (s3) return s3;
  // Loaded only when S3 is configured.
  const { S3Client } = require('@aws-sdk/client-s3');
  s3 = new S3Client({
    region: process.env.S3_REGION || 'ap-south-1',
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(process.env.S3_ENDPOINT),
    credentials: process.env.S3_ACCESS_KEY_ID ? {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    } : undefined,
  });
  return s3;
}

const s3Key = (key) => [process.env.S3_PREFIX, key].filter(Boolean).join('/');

/** Keys are ours, but never let one climb out of the uploads folder. */
function localPath(key) {
  const full = path.resolve(ROOT, key);
  if (!full.startsWith(path.resolve(ROOT) + path.sep)) throw new Error('Invalid storage key');
  return full;
}

async function put(key, buffer, contentType = 'application/octet-stream') {
  if (useS3()) {
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    await s3Client().send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET, Key: s3Key(key), Body: buffer, ContentType: contentType,
    }));
    return key;
  }
  const file = localPath(key);
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file, buffer);
  return key;
}

/** { stream, contentType, size } or null when the object is gone. */
async function get(key) {
  if (useS3()) {
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    try {
      const out = await s3Client().send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: s3Key(key) }));
      return { stream: out.Body, contentType: out.ContentType, size: out.ContentLength };
    } catch (error) {
      if (error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) return null;
      throw error;
    }
  }
  const file = localPath(key);
  try {
    const stat = await fs.promises.stat(file);
    return { stream: fs.createReadStream(file), contentType: null, size: stat.size };
  } catch {
    return null;
  }
}

async function remove(key) {
  if (useS3()) {
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
    await s3Client().send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: s3Key(key) })).catch(() => {});
    return;
  }
  await fs.promises.unlink(localPath(key)).catch(() => {});
}

/** Stream a stored object as an HTTP response. */
async function send(res, key, { contentType, fileName, inline = true, maxAge = 0 } = {}) {
  const obj = await get(key);
  if (!obj) return res.status(404).json({ message: 'File not found' });
  res.set('Content-Type', contentType || obj.contentType || 'application/octet-stream');
  if (obj.size) res.set('Content-Length', String(obj.size));
  if (fileName) {
    const safe = String(fileName).replace(/["\r\n]/g, '');
    res.set('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${safe}"`);
  }
  res.set('X-Content-Type-Options', 'nosniff');
  if (maxAge) res.set('Cache-Control', `private, max-age=${maxAge}`);
  obj.stream.pipe(res);
  return null;
}

module.exports = { put, get, remove, send, useS3 };
