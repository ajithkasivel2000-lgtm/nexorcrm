const crypto = require('crypto');

function verifyWebhookSignature(rawBody, signature, timestamp, secret) {
  if (!secret || !rawBody || !signature || !timestamp) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}${rawBody}`).digest('base64');
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(String(signature));
  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

module.exports = { verifyWebhookSignature };
