import { getCookie, verifySessionToken, SESSION_COOKIE } from './_lib/session.js';
import { json } from './_lib/response.js';
import { hasFinSession, loginPage } from './_lib/fin-auth.js';

const PUBLIC_ROUTES = [
  { method: 'POST', pathname: '/api/leads' },
  { method: 'POST', pathname: '/api/auth/login' },
  { method: 'POST', pathname: '/api/fin/login' },
  { method: 'POST', pathname: '/api/fin/logout' },
];

export async function onRequest({ request, next, env }) {
  const url = new URL(request.url);

  // Ricco Orçamento: página e arquivos só com sessão própria do financeiro
  if (url.pathname === '/financeiro' || url.pathname.startsWith('/financeiro/')) {
    if (!(await hasFinSession(request, env))) {
      return request.method === 'GET' && !/\.(js|css|json|map)$/.test(url.pathname) ? loginPage() : new Response('Não autorizado', { status: 401 });
    }
    const res = await next();
    const out = new Response(res.body, res);
    out.headers.set('Cache-Control', 'private, no-store');
    return out;
  }

  if (!url.pathname.startsWith('/api/')) return next();

  const isPublic = PUBLIC_ROUTES.some(
    (route) => route.method === request.method && route.pathname === url.pathname
  );
  if (isPublic) return next();

  if (url.pathname.startsWith('/api/fin/')) {
    return (await hasFinSession(request, env)) ? next() : json({ error: 'Não autorizado' }, 401);
  }

  const token = getCookie(request, SESSION_COOKIE);
  const valid = token && (await verifySessionToken(token, env.SESSION_SECRET));
  if (!valid) return json({ error: 'Não autorizado' }, 401);

  return next();
}
