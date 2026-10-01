import { json } from '../../_lib/response.js';
import { passwordMatches, createFinCookie, isBlocked, recordFailure, clearFailures } from '../../_lib/fin-auth.js';

export async function onRequestPost({ request, env }) {
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  if (await isBlocked(env, ip)) return json({ error: 'Muitas tentativas. Aguarde 15 minutos.' }, 429);

  const body = await request.json().catch(() => null);
  if (!body || typeof body.password !== 'string' || !(await passwordMatches(body.password, env.FIN_PASSWORD))) {
    await recordFailure(env, ip);
    return json({ error: 'Senha incorreta' }, 401);
  }

  await clearFailures(env, ip);
  return json({ ok: true }, 200, { 'Set-Cookie': await createFinCookie(request, env) });
}
