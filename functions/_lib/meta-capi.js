const DEFAULT_COUNTRY_CODE = '55';

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return toHex(digest);
}

function normalizePhone(phone, countryCode = DEFAULT_COUNTRY_CODE) {
  let digits = (phone || '').replace(/\D/g, '').replace(/^0+/, '');
  if (!digits) return '';

  const ccLen = countryCode.length;
  const withCcMin = ccLen + 8;
  const withCcMax = ccLen + 11;

  if (digits.startsWith(countryCode) && digits.length >= withCcMin && digits.length <= withCcMax) {
    return digits;
  }
  if (digits.length >= 8 && digits.length <= 11) {
    return `${countryCode}${digits}`;
  }
  return digits;
}

function normalizeName(name) {
  return (name || '').toLowerCase().trim();
}

function normalizeEmail(email) {
  return (email || '').toLowerCase().trim();
}

async function hashField(value) {
  if (!value) return null;
  return sha256(value);
}

/**
 * Envia um evento server-side para a Meta Conversions API.
 * Faz best-effort: nunca lança — retorna { ok, httpStatus, responseBody } para o chamador logar.
 */
export async function sendMetaEvent({
  env,
  eventName,
  eventId,
  eventSourceUrl,
  nome,
  email,
  telefone,
  clientIp,
  userAgent,
  fbp,
  fbc,
  value,
  currency,
}) {
  if (!env.META_PIXEL_ID || !env.META_ACCESS_TOKEN) {
    return { ok: false, skipped: true, reason: 'META_PIXEL_ID ou META_ACCESS_TOKEN ausente' };
  }

  const [hashedEm, hashedPh, hashedFn] = await Promise.all([
    hashField(normalizeEmail(email)),
    hashField(normalizePhone(telefone)),
    hashField(normalizeName(nome)),
  ]);

  const userData = {
    client_ip_address: clientIp || '',
    client_user_agent: userAgent || '',
  };
  if (hashedEm) userData.em = [hashedEm];
  if (hashedFn) userData.fn = [hashedFn];
  if (hashedPh) userData.ph = [hashedPh];
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;

  const eventPayload = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: eventId,
    event_source_url: eventSourceUrl || '',
    action_source: 'website',
    user_data: userData,
  };

  if (eventName === 'Purchase' && value !== undefined) {
    eventPayload.custom_data = {
      value: parseFloat(value) || 0,
      currency: currency || 'BRL',
    };
  }

  const body = { data: [eventPayload] };
  if (env.META_TEST_EVENT_CODE) body.test_event_code = env.META_TEST_EVENT_CODE;

  const requestPayload = JSON.stringify(body);

  try {
    const response = await fetch(
      `https://graph.facebook.com/v25.0/${env.META_PIXEL_ID}/events?access_token=${env.META_ACCESS_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestPayload,
      }
    );
    const responseBody = await response.text();
    return { ok: response.ok, httpStatus: response.status, requestPayload, responseBody };
  } catch (err) {
    return { ok: false, httpStatus: null, requestPayload, responseBody: String(err) };
  }
}

export async function logCapiEvent(env, { leadId, eventName, eventId, result }) {
  try {
    await env.DB.prepare(
      `INSERT INTO capi_events (id, lead_id, event_name, event_id, status, http_status, request_payload, response_body)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        crypto.randomUUID(),
        leadId || null,
        eventName,
        eventId,
        result.ok ? 'success' : result.skipped ? 'skipped' : 'error',
        result.httpStatus ?? null,
        result.requestPayload ?? null,
        result.responseBody ?? null
      )
      .run();
  } catch {
    // logging nunca deve quebrar o fluxo principal
  }
}
