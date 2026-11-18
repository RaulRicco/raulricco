// Preferências por usuário (chave → JSON), para o app ficar igual em qualquer aparelho logado.
const KEY_RE = /^[a-z0-9_.:-]{1,64}$/;
const MAX_VALUE = 16 * 1024;
const MAX_KEYS = 300;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function handleGetPrefs(env, userId) {
  const { results } = await env.DB.prepare('SELECT key, value FROM user_prefs WHERE user_id = ?').bind(userId).all();
  const prefs = {};
  for (const r of results) { try { prefs[r.key] = JSON.parse(r.value); } catch { /* ignora valor corrompido */ } }
  return json({ prefs });
}

// PUT /prefs/:key  { value, expect? }
// Com "expect", só grava se o valor atual for exatamente esse (evita que dois aparelhos
// concluam a mesma sessão de foco); se não bater, responde 409 com o valor atual.
export async function handlePutPref(request, env, userId, key) {
  if (!KEY_RE.test(key)) return json({ error: 'Chave inválida' }, 400);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
  if (!body || !('value' in body)) return json({ error: 'value é obrigatório' }, 400);
  const value = JSON.stringify(body.value);
  if (value.length > MAX_VALUE) return json({ error: 'Valor grande demais' }, 413);
  const db = env.DB;

  if ('expect' in body) {
    let res;
    if (body.expect === null || body.expect === undefined) {
      res = await db.prepare('INSERT INTO user_prefs (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime(\'now\') WHERE user_prefs.value = \'null\'')
        .bind(userId, key, value).run();
    } else {
      res = await db.prepare('UPDATE user_prefs SET value = ?, updated_at = datetime(\'now\') WHERE user_id = ? AND key = ? AND value = ?')
        .bind(value, userId, key, JSON.stringify(body.expect)).run();
    }
    if (!res.meta.changes) {
      const row = await db.prepare('SELECT value FROM user_prefs WHERE user_id = ? AND key = ?').bind(userId, key).first();
      return json({ error: 'Valor mudou em outro aparelho', current: row ? JSON.parse(row.value) : null }, 409);
    }
    return json({ ok: true });
  }

  const exists = await db.prepare('SELECT 1 FROM user_prefs WHERE user_id = ? AND key = ?').bind(userId, key).first();
  if (!exists) {
    const n = await db.prepare('SELECT COUNT(*) AS n FROM user_prefs WHERE user_id = ?').bind(userId).first();
    if ((n?.n || 0) >= MAX_KEYS) {
      // Limpa checklists semanais antigos antes de recusar
      await db.prepare("DELETE FROM user_prefs WHERE user_id = ? AND key LIKE 'weekly_check:%' AND key < ?")
        .bind(userId, 'weekly_check:' + new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10)).run();
    }
  }
  await db.prepare('INSERT INTO user_prefs (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime(\'now\')')
    .bind(userId, key, value).run();
  return json({ ok: true });
}
