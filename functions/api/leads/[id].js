import { json } from '../../_lib/response.js';

const VALID_STATUS = ['novo', 'em_contato', 'qualificado', 'descartado'];

export async function onRequestPatch({ request, env, params }) {
  const body = await request.json().catch(() => null);
  if (!body || !VALID_STATUS.includes(body.status)) {
    return json({ error: 'Status inválido' }, 400);
  }

  const result = await env.DB.prepare(
    `UPDATE leads SET status = ?, updated_at = datetime('now') WHERE id = ?`
  )
    .bind(body.status, params.id)
    .run();

  if (result.meta.changes === 0) {
    return json({ error: 'Lead não encontrado' }, 404);
  }

  return json({ ok: true });
}
