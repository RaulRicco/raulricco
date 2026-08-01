import { md5 } from './md5.js';

/**
 * Cria/atualiza (upsert) um contato no Mailchimp e aplica tags.
 * Faz best-effort: nunca lança — retorna { ok, httpStatus, responseBody } para o chamador logar.
 */
export async function tagMailchimpContact(env, { email, nome, tags }) {
  if (!env.MAILCHIMP_API_KEY || !env.MAILCHIMP_SERVER_PREFIX || !env.MAILCHIMP_LIST_ID) {
    return { ok: false, skipped: true, reason: 'Credenciais Mailchimp ausentes' };
  }
  if (!email) {
    return { ok: false, skipped: true, reason: 'Email ausente' };
  }

  const hash = md5(email.toLowerCase().trim());
  const base = `https://${env.MAILCHIMP_SERVER_PREFIX}.api.mailchimp.com/3.0/lists/${env.MAILCHIMP_LIST_ID}/members/${hash}`;
  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${env.MAILCHIMP_API_KEY}`,
  };

  const upsertPayload = JSON.stringify({
    email_address: email,
    status_if_new: 'subscribed',
    ...(nome ? { merge_fields: { FNAME: nome.split(' ')[0] } } : {}),
  });

  try {
    const upsertRes = await fetch(base, {
      method: 'PUT',
      headers: authHeaders,
      body: upsertPayload,
    });
    if (!upsertRes.ok) {
      return {
        ok: false,
        httpStatus: upsertRes.status,
        requestPayload: upsertPayload,
        responseBody: await upsertRes.text(),
      };
    }

    const tagPayload = JSON.stringify({ tags: tags.map((name) => ({ name, status: 'active' })) });
    const tagRes = await fetch(`${base}/tags`, {
      method: 'POST',
      headers: authHeaders,
      body: tagPayload,
    });
    const responseBody = await tagRes.text();
    return { ok: tagRes.ok, httpStatus: tagRes.status, requestPayload: tagPayload, responseBody };
  } catch (err) {
    return { ok: false, httpStatus: null, responseBody: String(err) };
  }
}
