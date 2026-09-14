import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { buildR2DeleteHeaders, buildR2GetHeaders, deleteObjectFromR2 } from '../src/services/r2Service.js';

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

test('builds a private signed R2 GetObject request', () => {
  const req = buildR2GetHeaders({
    accountId: 'acc123', accessKeyId: 'key123', secretAccessKey: 'sec123',
    bucketName: 'lms-submissions', objectKey: 'd1/u1/photo 1.jpg',
    now: new Date('2026-09-10T01:02:03Z'),
  });
  assert.match(req.url, /photo 1\.jpg$/);
  assert.match(req.headers.Authorization, /Credential=key123\/20260910\/auto\/s3\/aws4_request/);
  assert.equal(req.headers['x-amz-date'], '20260910T010203Z');
});

test('builds a signed private R2 DeleteObject request', () => {
  const req = buildR2DeleteHeaders({
    accountId: 'acc', accessKeyId: 'key', secretAccessKey: 'secret',
    bucketName: 'lms-submissions', objectKey: 'd1/u1/tmp/session/file.pdf',
    now: new Date('2026-09-14T01:02:03Z'),
  });
  assert.equal(req.method, 'DELETE');
  assert.match(req.headers.Authorization, /Credential=key\/20260914\/auto\/s3\/aws4_request/);
  assert.equal(req.headers['x-amz-date'], '20260914T010203Z');
});

test('treats a missing private R2 object as already deleted', async () => {
  const previous = {
    accountId: process.env.R2_ACCOUNT_ID,
    accessKey: process.env.R2_ACCESS_KEY_ID,
    secret: process.env.R2_SECRET_ACCESS_KEY,
  };
  process.env.R2_ACCOUNT_ID = 'acc';
  process.env.R2_ACCESS_KEY_ID = 'key';
  process.env.R2_SECRET_ACCESS_KEY = 'secret';
  try {
    const deleted = await deleteObjectFromR2({
      objectKey: 'd1/u1/tmp/session/missing.pdf',
      fetchImpl: async (_url, options) => ({ ok: false, status: 404, method: options.method }),
    });
    assert.equal(deleted, true);
  } finally {
    if (previous.accountId === undefined) delete process.env.R2_ACCOUNT_ID; else process.env.R2_ACCOUNT_ID = previous.accountId;
    if (previous.accessKey === undefined) delete process.env.R2_ACCESS_KEY_ID; else process.env.R2_ACCESS_KEY_ID = previous.accessKey;
    if (previous.secret === undefined) delete process.env.R2_SECRET_ACCESS_KEY; else process.env.R2_SECRET_ACCESS_KEY = previous.secret;
  }
});
