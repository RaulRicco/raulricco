import { uuid } from './db.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

const PERIODS = ['daily', 'weekly', 'monthly'];
const clean = {
  name: v => String(v || '').trim().slice(0, 40),
  color: v => (/^#[0-9a-fA-F]{6}$/.test(v || '') ? v : null),
  icon: v => (/^fa-[a-z0-9-]{1,40}$/.test(v || '') ? v : null),
  minutes: v => Math.max(0, Math.min(100000, Math.round(Number(v) || 0))),
  period: v => (PERIODS.includes(v) ? v : null),
};

export async function listAreas(db, userId) {
  let { results } = await db.prepare(
    'SELECT * FROM areas WHERE user_id = ? ORDER BY archived ASC, sort_order ASC, created_at ASC'
  ).bind(userId).all();
  if (results.length === 0) {
    // Usuário novo: cria as áreas padrão
    await db.batch([
      db.prepare("INSERT OR IGNORE INTO areas (id, user_id, name, color, icon, target_minutes, target_period, sort_order) VALUES ('work', ?, 'Profissional', '#3987e5', 'fa-briefcase', 900, 'weekly', 0)").bind(userId),
      db.prepare("INSERT OR IGNORE INTO areas (id, user_id, name, color, icon, target_minutes, target_period, sort_order) VALUES ('personal', ?, 'Pessoal', '#d95926', 'fa-heart', 300, 'weekly', 1)").bind(userId),
    ]);
    ({ results } = await db.prepare('SELECT * FROM areas WHERE user_id = ? ORDER BY sort_order ASC').bind(userId).all());
  }
  return results;
}

export async function handleGetAreas(request, env, userId) {
  return json(await listAreas(env.DB, userId));
}

export async function handleCreateArea(request, env, userId) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
  const name = clean.name(body.name);
  if (!name) return json({ error: 'name é obrigatório' }, 400);
  const id = uuid();
  const max = await env.DB.prepare('SELECT MAX(sort_order) m FROM areas WHERE user_id = ?').bind(userId).first();
  await env.DB.prepare(
    'INSERT INTO areas (id, user_id, name, color, icon, target_minutes, target_period, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, userId, name, clean.color(body.color) || '#3987e5', clean.icon(body.icon) || 'fa-circle',
    clean.minutes(body.target_minutes), clean.period(body.target_period) || 'weekly', (max?.m ?? -1) + 1).run();
  return json(await env.DB.prepare('SELECT * FROM areas WHERE user_id = ? AND id = ?').bind(userId, id).first(), 201);
}

export async function handleUpdateArea(request, env, userId, areaId) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
  const sets = [], vals = [];
  if (body.name !== undefined && clean.name(body.name)) { sets.push('name = ?'); vals.push(clean.name(body.name)); }
  if (body.color !== undefined && clean.color(body.color)) { sets.push('color = ?'); vals.push(body.color); }
  if (body.icon !== undefined && clean.icon(body.icon)) { sets.push('icon = ?'); vals.push(body.icon); }
  if (body.target_minutes !== undefined) { sets.push('target_minutes = ?'); vals.push(clean.minutes(body.target_minutes)); }
  if (body.target_period !== undefined && clean.period(body.target_period)) { sets.push('target_period = ?'); vals.push(body.target_period); }
  if (body.sort_order !== undefined) { sets.push('sort_order = ?'); vals.push(parseInt(body.sort_order) || 0); }
  if (body.archived !== undefined) { sets.push('archived = ?'); vals.push(body.archived ? 1 : 0); }
  if (!sets.length) return json({ error: 'Nada para atualizar' }, 400);
  vals.push(userId, areaId);
  const r = await env.DB.prepare(`UPDATE areas SET ${sets.join(', ')} WHERE user_id = ? AND id = ?`).bind(...vals).run();
  if (!r.meta.changes) return json({ error: 'Área não encontrada' }, 404);
  return json(await env.DB.prepare('SELECT * FROM areas WHERE user_id = ? AND id = ?').bind(userId, areaId).first());
}
