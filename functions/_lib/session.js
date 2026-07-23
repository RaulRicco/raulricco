const SESSION_COOKIE = 'crm_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return toHex(signature);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function createSessionToken(secret) {
  const payload = JSON.stringify({ exp: Date.now() + SESSION_TTL_MS });
  const encodedPayload = btoa(payload);
  const signature = await hmac(secret, encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export async function verifySessionToken(token, secret) {
  if (!token || !token.includes('.')) return false;
  const [encodedPayload, signature] = token.split('.');
  const expectedSignature = await hmac(secret, encodedPayload);
  if (!timingSafeEqual(signature, expectedSignature)) return false;

  try {
    const payload = JSON.parse(atob(encodedPayload));
    return typeof payload.exp === 'number' && payload.exp > Date.now();
  } catch {
    return false;
  }
}

export function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  const match = header.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function buildSessionCookie(token, request) {
  const isHttps = new URL(request.url).protocol === 'https:';
  const secureAttr = isHttps ? ' Secure;' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly;${secureAttr} SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`;
}

export function buildLogoutCookie(request) {
  const isHttps = new URL(request.url).protocol === 'https:';
  const secureAttr = isHttps ? ' Secure;' : '';
  return `${SESSION_COOKIE}=; HttpOnly;${secureAttr} SameSite=Strict; Path=/; Max-Age=0`;
}

export { SESSION_COOKIE };
