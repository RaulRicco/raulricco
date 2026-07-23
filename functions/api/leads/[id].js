import { json } from '../../_lib/response.js';

const VALID_STATUS = ['novo', 'em_contato', 'qualificado', 'fechado', 'descartado'];

export async function onRequestPatch({ request, env, params }) {
  const body = await request.json().catch(() => null);
  if (!body || !VALID_STATUS.includes(body.status)) {
    return json({ error: 'Status inválido' }, 400);
  }

  let valorFechado = null;
  if (body.status === 'fechado') {
    valorFechado = Number(body.valor_fechado);
    if (!body.valor_fechado || isNaN(valorFechado) || valorFechado <= 0) {
      return json({ error: 'Informe o valor fechado (maior que zero)' }, 400);
    }
  }

  const result = await env.DB.prepare(
    `UPDATE leads SET
      status = ?,
      valor_fechado = CASE WHEN ? = 'fechado' THEN ? ELSE valor_fechado END,
      fechado_em = CASE WHEN ? = 'fechado' THEN datetime('now') ELSE fechado_em END,
      updated_at = datetime('now')
    WHERE id = ?`
  )
    .bind(body.status, body.status, valorFechado, body.status, params.id)
    .run();

  if (result.meta.changes === 0) {
    return json({ error: 'Lead não encontrado' }, 404);
  }

  return json({ ok: true });
}
