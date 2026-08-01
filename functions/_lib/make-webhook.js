/**
 * Envia um evento para o webhook do Make.com.
 * Faz best-effort: nunca lança — retorna { ok, httpStatus, responseBody } para o chamador logar.
 */
export async function sendMakeWebhook(env, payload) {
  if (!env.MAKE_WEBHOOK_URL) {
    return { ok: false, skipped: true, reason: 'MAKE_WEBHOOK_URL ausente' };
  }

  const requestPayload = JSON.stringify(payload);

  try {
    const response = await fetch(env.MAKE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestPayload,
    });
    const responseBody = await response.text();
    return { ok: response.ok, httpStatus: response.status, requestPayload, responseBody };
  } catch (err) {
    return { ok: false, httpStatus: null, requestPayload, responseBody: String(err) };
  }
}
