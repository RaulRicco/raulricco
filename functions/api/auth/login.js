import { createSessionToken, buildSessionCookie } from '../../_lib/session.js';
import { json } from '../../_lib/response.js';

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.password !== 'string') {
    return json({ error: 'Senha ausente' }, 400);
  }

  if (body.password !== env.CRM_PASSWORD) {
    return json({ error: 'Senha inválida' }, 401);
  }

  const token = await createSessionToken(env.SESSION_SECRET);
  return json({ ok: true }, 200, { 'Set-Cookie': buildSessionCookie(token, request) });
}
