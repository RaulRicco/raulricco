import { json } from '../_lib/response.js';

/**
 * Endpoint de captura temporário: loga o payload bruto de qualquer evento
 * enviado pela Ticto, sem processar nada ainda. Depois de confirmar o
 * formato real do payload numa venda de teste, este handler será
 * substituído pelo parser definitivo (registro no CRM + Meta CAPI + Make.com).
 */
export async function onRequestPost({ request, env }) {
  const bodyText = await request.text();
  const headers = Object.fromEntries(request.headers.entries());

  await env.DB.prepare(
    `INSERT INTO webhook_raw_logs (id, platform, headers, body) VALUES (?, ?, ?, ?)`
  )
    .bind(crypto.randomUUID(), 'ticto', JSON.stringify(headers), bodyText)
    .run();

  return json({ ok: true });
}
