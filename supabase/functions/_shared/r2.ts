import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.17';

export const requiredEnv = (name: string): string => {
  const value = Deno.env.get(name);
  if (!value) {
    throw { code: 'R2_NOT_CONFIGURED', message: `Thiếu cấu hình biến môi trường ${name}.`, status: 500 };
  }
  return value;
};

export const r2Config = () => ({
  accountId: requiredEnv('R2_ACCOUNT_ID'),
  accessKeyId: requiredEnv('R2_ACCESS_KEY_ID'),
  secretAccessKey: requiredEnv('R2_SECRET_ACCESS_KEY'),
  bucket: requiredEnv('R2_BUCKET_NAME'),
});

const getAwsClient = () => {
  const config = r2Config();
  return {
    client: new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      region: 'auto',
      service: 's3',
    }),
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    bucket: config.bucket,
  };
};

export const presignPut = async (objectKey: string, contentType: string): Promise<string> => {
  const { client, endpoint, bucket } = getAwsClient();
  const safePath = objectKey.split('/').map(encodeURIComponent).join('/');
  const url = new URL(`${endpoint}/${bucket}/${safePath}`);
  url.searchParams.set('X-Amz-Expires', '300'); // 5 minutes

  const req = new Request(url.toString(), {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
  });

  const signed = await client.sign(req, { aws: { signQuery: true } });
  return signed.url;
};

export const presignGet = async (objectKey: string): Promise<string> => {
  const { client, endpoint, bucket } = getAwsClient();
  const safePath = objectKey.split('/').map(encodeURIComponent).join('/');
  const url = new URL(`${endpoint}/${bucket}/${safePath}`);
  url.searchParams.set('X-Amz-Expires', '900'); // 15 minutes

  const req = new Request(url.toString(), { method: 'GET' });
  const signed = await client.sign(req, { aws: { signQuery: true } });
  return signed.url;
};

export const headObject = async (objectKey: string): Promise<{ exists: boolean; contentLength: number; contentType: string }> => {
  const { client, endpoint, bucket } = getAwsClient();
  const safePath = objectKey.split('/').map(encodeURIComponent).join('/');
  const url = new URL(`${endpoint}/${bucket}/${safePath}`);

  const req = new Request(url.toString(), { method: 'HEAD' });
  const signed = await client.sign(req);
  const response = await fetch(signed);

  if (response.status === 404) {
    return { exists: false, contentLength: 0, contentType: '' };
  }

  if (!response.ok) {
    throw { code: 'R2_HEAD_FAILED', message: 'Không thể kiểm tra file trên lưu trữ R2.', status: 500 };
  }

  const contentLength = Number(response.headers.get('content-length') || 0);
  const contentType = response.headers.get('content-type') || '';
  return { exists: true, contentLength, contentType };
};
