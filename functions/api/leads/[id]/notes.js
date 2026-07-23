import { json } from '../../../_lib/response.js';

export async function onRequestGet({ env, params }) {
  const { results } = await env.DB.prepare(
    `SELECT id, texto, created_at FROM lead_notes WHERE lead_id = ? ORDER BY created_at ASC`
  )
    .bind(params.id)
    .all();

  return json({ ok: true, notes: results });
}

export async function onRequestPost({ request, env, params }) {
  const body = await request.json().catch(() => null);
  const texto = (body && body.texto ? String(body.texto) : '').trim();

  if (!texto) {
    return json({ error: 'Anotação vazia' }, 400);
  }

  const lead = await env.DB.prepare(`SELECT id FROM leads WHERE id = ?`).bind(params.id).first();
  if (!lead) {
    return json({ error: 'Lead não encontrado' }, 404);
  }

  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO lead_notes (id, lead_id, texto) VALUES (?, ?, ?)`)
    .bind(id, params.id, texto)
    .run();

  const created = await env.DB.prepare(`SELECT id, texto, created_at FROM lead_notes WHERE id = ?`)
    .bind(id)
    .first();

  return json({ ok: true, note: created }, 201);
}
