import { json } from '../_lib/response.js';

const VALID_STATUS = ['novo', 'em_contato', 'qualificado', 'fechado', 'descartado'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function digitsOnly(str) {
  return (str || '').replace(/\D/g, '');
}

export async function onRequestPost({ request, env }) {
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
      quanto_disposto_investir, nome, telefone, email, status,
      utm_source, utm_medium, utm_campaign, utm_term, utm_content,
      gclid, fbclid, user_agent, ip
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'novo', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      body.segmento || null,
      body.tempo_negocio || null,
      body.ja_investe_trafego || null,
      body.quando_investiu || null,
      body.quanto_disposto_investir || null,
      nome,
      telefone,
      email,
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

  return json({ ok: true, id }, 201);
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const status = url.searchParams.get('status');

  let query = 'SELECT * FROM leads';
  const bindings = [];
  if (status && VALID_STATUS.includes(status)) {
    query += ' WHERE status = ?';
    bindings.push(status);
  }
  query += ' ORDER BY created_at DESC';

  const stmt = env.DB.prepare(query).bind(...bindings);
  const { results } = await stmt.all();
  return json({ ok: true, leads: results });
}
