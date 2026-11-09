import { uuid, hashPassword } from './db.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export const TOKEN_PREFIX = 'flow_pat_';

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return TOKEN_PREFIX + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

// Resolve um token de API para o user_id (ou null). Atualiza last_used_at no máximo 1x por hora.
export async function userFromApiToken(env, token, ctx) {
  const hash = await hashPassword(token);
  const row = await env.DB.prepare('SELECT id, user_id, last_used_at FROM api_tokens WHERE token_hash = ?').bind(hash).first();
  if (!row) return null;
  const stale = !row.last_used_at || Date.now() - new Date(row.last_used_at.replace(' ', 'T') + 'Z').getTime() > 3600000;
  if (stale) {
    const p = env.DB.prepare("UPDATE api_tokens SET last_used_at = datetime('now') WHERE id = ?").bind(row.id).run();
    if (ctx && ctx.waitUntil) ctx.waitUntil(p); else await p;
  }
  return row.user_id;
}

export async function handleListTokens(request, env, userId) {
  const { results } = await env.DB.prepare(
    'SELECT id, name, prefix, created_at, last_used_at FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC'
  ).bind(userId).all();
  return json(results);
}

export async function handleCreateToken(request, env, userId) {
  let body = {};
  try { body = await request.json(); } catch {}
  const name = String(body.name || 'Automação').trim().slice(0, 60) || 'Automação';
  const count = await env.DB.prepare('SELECT COUNT(*) n FROM api_tokens WHERE user_id = ?').bind(userId).first();
  if ((count?.n || 0) >= 20) return json({ error: 'Limite de 20 chaves atingido. Revogue alguma antes.' }, 400);
  const token = randomToken();
  const id = uuid();
  await env.DB.prepare('INSERT INTO api_tokens (id, user_id, name, token_hash, prefix) VALUES (?, ?, ?, ?, ?)')
    .bind(id, userId, name, await hashPassword(token), token.slice(0, TOKEN_PREFIX.length + 6)).run();
  // O token só é devolvido nesta resposta
  return json({ id, name, token, prefix: token.slice(0, TOKEN_PREFIX.length + 6) }, 201);
}

export async function handleDeleteToken(request, env, userId, tokenId) {
  const r = await env.DB.prepare('DELETE FROM api_tokens WHERE id = ? AND user_id = ?').bind(tokenId, userId).run();
  if (!r.meta.changes) return json({ error: 'Chave não encontrada' }, 404);
  return json({ ok: true });
}
