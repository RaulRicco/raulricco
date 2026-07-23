import { getCookie, verifySessionToken, SESSION_COOKIE } from './_lib/session.js';
import { json } from './_lib/response.js';

const PUBLIC_ROUTES = [
  { method: 'POST', pathname: '/api/leads' },
  { method: 'POST', pathname: '/api/auth/login' },
];

export async function onRequest({ request, next, env }) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) return next();

  const isPublic = PUBLIC_ROUTES.some(
    (route) => route.method === request.method && route.pathname === url.pathname
  );
  if (isPublic) return next();

  const token = getCookie(request, SESSION_COOKIE);
  const valid = token && (await verifySessionToken(token, env.SESSION_SECRET));
  if (!valid) return json({ error: 'Não autorizado' }, 401);

  return next();
}
