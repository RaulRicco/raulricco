import { json } from '../_lib/response.js';
import { sendMetaEvent, logCapiEvent } from '../_lib/meta-capi.js';
import { sendMakeWebhook } from '../_lib/make-webhook.js';

const VALID_STATUS = ['novo', 'em_contato', 'qualificado', 'reuniao_agendada', 'fechado', 'descartado'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function digitsOnly(str) {
  return (str || '').replace(/\D/g, '');
}

export async function onRequestPost({ request, env, waitUntil }) {
  const body = await request.json().catch(() => null);
  if (!body) return json({ error: 'JSON inválido' }, 400);

  const nome = (body.nome || '').trim();
  const telefone = (body.telefone || '').trim();
  const email = (body.email || '').trim();

  if (!nome || !telefone || !email) {
    return json({ error: 'Campos obrigatórios ausentes: nome, telefone e email' }, 400);
  }
  if (!EMAIL_RE.test(email)) {
    return json({ error: 'Email inválido' }, 400);
  }
  const phoneDigits = digitsOnly(telefone);
  if (phoneDigits.length < 10 || phoneDigits.length > 11) {
    return json({ error: 'Telefone inválido' }, 400);
  }

  const id = crypto.randomUUID();
  const ip = request.headers.get('CF-Connecting-IP') || null;
  const userAgent = request.headers.get('User-Agent') || null;

  await env.DB.prepare(
    `INSERT INTO leads (
      id, segmento, tempo_negocio, ja_investe_trafego, quando_investiu,
      quanto_disposto_investir, retencao_atual, origem, nome, telefone, email, status,
      acha_trafego_melhora_faturamento, faturamento_mensal_atual, meta_faturamento,
      prazo_meta_faturamento, instagram_arroba, populacao_cidade,
      utm_source, utm_medium, utm_campaign, utm_term, utm_content,
      gclid, fbclid, user_agent, ip
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'novo', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      body.segmento || null,
      body.tempo_negocio || null,
      body.ja_investe_trafego || null,
      body.quando_investiu || null,
      body.quanto_disposto_investir || null,
      body.retencao_atual || null,
      body.origem || null,
      nome,
      telefone,
      email,
      body.acha_trafego_melhora_faturamento || null,
      body.faturamento_mensal_atual || null,
      body.meta_faturamento || null,
      body.prazo_meta_faturamento || null,
      body.instagram_arroba || null,
      body.populacao_cidade || null,
      body.utm_source || null,
      body.utm_medium || null,
      body.utm_campaign || null,
      body.utm_term || null,
      body.utm_content || null,
      body.gclid || null,
      body.fbclid || null,
      userAgent,
      ip
    )
    .run();

  const eventId = body.event_id || crypto.randomUUID();
  const capiTask = sendMetaEvent({
    env,
    eventName: 'Lead',
    eventId,
    eventSourceUrl: body.event_source_url,
    nome,
    email,
    telefone,
    clientIp: ip,
    userAgent,
    fbp: body.fbp,
    fbc: body.fbc,
  }).then((result) => logCapiEvent(env, { leadId: id, eventName: 'Lead', eventId, result }));

  const webhookEventId = crypto.randomUUID();
  const webhookTask = sendMakeWebhook(env, { id, nome, telefone, email, status: 'novo', ...body }).then((res) =>
    logCapiEvent(env, { leadId: id, eventName: 'Webhook:novo', eventId: webhookEventId, result: res })
  );

  if (waitUntil) {
    waitUntil(capiTask);
    waitUntil(webhookTask);
  } else {
    await Promise.all([capiTask, webhookTask]);
  }

  return json({ ok: true, id }, 201);
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const status = url.searchParams.get('status');

  let query = 'SELECT * FROM leads WHERE hidden_at IS NULL';
  const bindings = [];
  if (status && VALID_STATUS.includes(status)) {
    query += ' AND status = ?';
    bindings.push(status);
  }
  query += ' ORDER BY created_at DESC';

  const stmt = env.DB.prepare(query).bind(...bindings);
  const { results } = await stmt.all();
  return json({ ok: true, leads: results });
}
