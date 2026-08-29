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

export const uploadBufferToR2 = async ({ objectKey, buffer, mimeType }) => {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME || 'lms-submissions';

  if (!accountId || !accessKeyId || !secretAccessKey) {
    return false;
  }

  try {
    const { url, headers } = buildR2Headers({
      accountId,
      accessKeyId,
      secretAccessKey,
      bucketName,
      objectKey,
      buffer,
      mimeType,
    });

    const response = await fetch(url, {
      method: 'PUT',
      headers,
      body: buffer,
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Cloudflare R2 background sync failed:', response.status, text);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Cloudflare R2 background sync error:', err.message);
    return false;
  }
};
