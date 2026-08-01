import { json } from '../../../_lib/response.js';
import { sendMetaEvent, logCapiEvent } from '../../../_lib/meta-capi.js';
import { sendGoogleAdsConversion } from '../../../_lib/google-ads-capi.js';
import { sendMakeWebhook } from '../../../_lib/make-webhook.js';
import { tagMailchimpContact } from '../../../_lib/mailchimp.js';

const VALID_STATUS = ['novo', 'em_contato', 'qualificado', 'reuniao_agendada', 'fechado', 'descartado'];
const KEY_STATUSES = ['reuniao_agendada', 'fechado', 'descartado'];
const STATUS_TAGS = {
  reuniao_agendada: 'crm-reuniao-agendada',
  fechado: 'crm-fechado',
  descartado: 'crm-descartado',
};

export async function onRequestPatch({ request, env, params, waitUntil }) {
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

  if (KEY_STATUSES.includes(body.status)) {
    const lead = await env.DB.prepare(`SELECT * FROM leads WHERE id = ?`).bind(params.id).first();
    if (lead) {
      const tasks = [];

      const webhookEventId = crypto.randomUUID();
      tasks.push(
        sendMakeWebhook(env, {
          id: params.id,
          nome: lead.nome,
          telefone: lead.telefone,
          email: lead.email,
          status: body.status,
        }).then((res) =>
          logCapiEvent(env, {
            leadId: params.id,
            eventName: `Webhook:${body.status}`,
            eventId: webhookEventId,
            result: res,
          })
        )
      );

      const tag = STATUS_TAGS[body.status];
      if (tag) {
        tasks.push(
          tagMailchimpContact(env, { email: lead.email, nome: lead.nome, tags: [tag] }).then((res) =>
            logCapiEvent(env, { leadId: params.id, eventName: `Mailchimp:${tag}`, eventId: crypto.randomUUID(), result: res })
          )
        );
      }

      if (body.status === 'reuniao_agendada') {
        const scheduleEventId = crypto.randomUUID();
        tasks.push(
          sendMetaEvent({
            env,
            eventName: 'Schedule',
            eventId: scheduleEventId,
            nome: lead.nome,
            email: lead.email,
            telefone: lead.telefone,
            clientIp: lead.ip,
            userAgent: lead.user_agent,
          }).then((res) =>
            logCapiEvent(env, { leadId: params.id, eventName: 'Schedule', eventId: scheduleEventId, result: res })
          )
        );
      }

      if (body.status === 'fechado') {
        const metaEventId = crypto.randomUUID();
        tasks.push(
          sendMetaEvent({
            env,
            eventName: 'Purchase',
            eventId: metaEventId,
            nome: lead.nome,
            email: lead.email,
            telefone: lead.telefone,
            clientIp: lead.ip,
            userAgent: lead.user_agent,
            value: valorFechado,
            currency: 'BRL',
          }).then((res) =>
            logCapiEvent(env, { leadId: params.id, eventName: 'Purchase', eventId: metaEventId, result: res })
          )
        );

        const googleEventId = crypto.randomUUID();
        tasks.push(
          sendGoogleAdsConversion({
            env,
            gclid: lead.gclid,
            value: valorFechado,
            currency: 'BRL',
          }).then((res) =>
            logCapiEvent(env, {
              leadId: params.id,
              eventName: 'GoogleAdsConversion',
              eventId: googleEventId,
              result: res,
            })
          )
        );
      }

      const combined = Promise.all(tasks);
      if (waitUntil) waitUntil(combined);
      else await combined;
    }
  }

  return json({ ok: true });
}

export async function onRequestDelete({ params, env }) {
  const result = await env.DB.prepare(
    `UPDATE leads SET hidden_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND hidden_at IS NULL`
  )
    .bind(params.id)
    .run();

  if (result.meta.changes === 0) {
    return json({ error: 'Lead não encontrado' }, 404);
  }

  return json({ ok: true });
}
