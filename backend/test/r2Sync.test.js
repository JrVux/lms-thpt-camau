import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';

export const buildR2Headers = ({ accountId, accessKeyId, secretAccessKey, bucketName, objectKey, buffer, mimeType, now = new Date() }) => {
  const amzDate = now.toISOString().replace(/[:-]/g, '').split('.')[0] + 'Z';
  const dateStamp = amzDate.slice(0, 8);
  const region = 'auto';
  const service = 's3';

  const payloadHash = crypto.createHash('sha256').update(buffer).digest('hex');
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${bucketName}/${objectKey.split('/').map(encodeURIComponent).join('/')}`;
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';

  const canonicalRequest = `PUT\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${crypto.createHash('sha256').update(canonicalRequest).digest('hex')}`;

  const getSignatureKey = (key, date, reg, serv) => {
    const kDate = crypto.createHmac('sha256', `AWS4${key}`).update(date).digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(reg).digest();
    const kService = crypto.createHmac('sha256', kRegion).update(serv).digest();
    return crypto.createHmac('sha256', kService).update('aws4_request').digest();
  };

  const signingKey = getSignatureKey(secretAccessKey, dateStamp, region, service);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  return {
    url: `https://${host}/${bucketName}/${objectKey}`,
    headers: {
      Host: host,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      'Content-Type': mimeType || 'application/octet-stream',
    },
  };
};

test('builds valid Cloudflare R2 AWS SigV4 PutObject headers', () => {
  const req = buildR2Headers({
    accountId: 'acc123',
    accessKeyId: 'key123',
    secretAccessKey: 'sec123',
    bucketName: 'lms-submissions',
    objectKey: 'delivery1/student1/test.pdf',
    buffer: Buffer.from('test-file-content'),
    mimeType: 'application/pdf',
    now: new Date('2026-08-29T12:00:00Z'),
  });

  assert.equal(req.url, 'https://acc123.r2.cloudflarestorage.com/lms-submissions/delivery1/student1/test.pdf');
  assert.match(req.headers.Authorization, /AWS4-HMAC-SHA256 Credential=key123\/20260829\/auto\/s3\/aws4_request/);
  assert.equal(req.headers['x-amz-date'], '20260829T120000Z');
});
