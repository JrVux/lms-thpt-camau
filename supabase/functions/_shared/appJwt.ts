function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export interface AppClaims {
  id: string;
  role: 'student' | 'teacher';
  username?: string;
  exp?: number;
  [key: string]: any;
}

export const verifyAppJwt = async (
  authHeader: string | null,
  secret: string
): Promise<AppClaims> => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw { code: 'UNAUTHORIZED', message: 'Thiếu token xác thực.', status: 401 };
  }

  const token = authHeader.slice(7).trim();
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw { code: 'UNAUTHORIZED', message: 'Token không đúng định dạng.', status: 401 };
  }

  const [headerB64, payloadB64, sigB64] = parts;
  const key = await getHmacKey(secret);
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const sigBytes = base64UrlDecode(sigB64);

  const isValid = await crypto.subtle.verify('HMAC', key, sigBytes, data);
  if (!isValid) {
    throw { code: 'UNAUTHORIZED', message: 'Chữ ký token không hợp lệ.', status: 401 };
  }

  const payloadJson = new TextDecoder().decode(base64UrlDecode(payloadB64));
  const payload = JSON.parse(payloadJson) as AppClaims;

  if (payload.exp && Date.now() / 1000 > payload.exp) {
    throw { code: 'UNAUTHORIZED', message: 'Token đã hết hạn.', status: 401 };
  }

  if (!payload.id || !['student', 'teacher'].includes(payload.role)) {
    throw { code: 'UNAUTHORIZED', message: 'Quyền sử dụng không hợp lệ.', status: 401 };
  }

  return payload;
};

export const signUploadToken = async (payload: object, secret: string): Promise<string> => {
  const key = await getHmacKey(secret);
  const header = { alg: 'HS256', typ: 'JWT' };
  const expPayload = {
    ...payload,
    kind: 'file-upload',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300, // 5 minutes
  };

  const enc = new TextEncoder();
  const headerB64 = base64UrlEncode(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(enc.encode(JSON.stringify(expPayload)));
  const data = enc.encode(`${headerB64}.${payloadB64}`);
  const sigBuffer = await crypto.subtle.sign('HMAC', key, data);
  const sigB64 = base64UrlEncode(new Uint8Array(sigBuffer));

  return `${headerB64}.${payloadB64}.${sigB64}`;
};

export const verifyUploadToken = async (token: string, secret: string): Promise<any> => {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw { code: 'INVALID_UPLOAD_TOKEN', message: 'Token upload không hợp lệ.', status: 400 };
  }

  const [headerB64, payloadB64, sigB64] = parts;
  const key = await getHmacKey(secret);
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const sigBytes = base64UrlDecode(sigB64);

  const isValid = await crypto.subtle.verify('HMAC', key, sigBytes, data);
  if (!isValid) {
    throw { code: 'INVALID_UPLOAD_TOKEN', message: 'Chữ ký upload token không hợp lệ.', status: 400 };
  }

  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)));
  if (payload.kind !== 'file-upload' || (payload.exp && Date.now() / 1000 > payload.exp)) {
    throw { code: 'EXPIRED_UPLOAD_TOKEN', message: 'Upload token đã hết hạn.', status: 400 };
  }

  return payload;
};
