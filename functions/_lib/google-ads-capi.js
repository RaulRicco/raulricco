const API_VERSION = 'v19';

let cachedToken = null;
let cachedTokenExpiry = 0;

async function getAccessToken(env) {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiry) return cachedToken;

  const params = new URLSearchParams({
    client_id: env.GOOGLE_ADS_CLIENT_ID,
    client_secret: env.GOOGLE_ADS_CLIENT_SECRET,
    refresh_token: env.GOOGLE_ADS_REFRESH_TOKEN,
    grant_type: 'refresh_token',
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error(`Falha ao renovar OAuth2 token: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  cachedTokenExpiry = now + (data.expires_in - 60) * 1000;
  return cachedToken;
}

function toConversionDateTime(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const mo = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const offH = pad(Math.floor(Math.abs(offsetMin) / 60));
  const offM = pad(Math.abs(offsetMin) % 60);
  return `${y}-${mo}-${d} ${h}:${mi}:${s}${sign}${offH}:${offM}`;
}

/**
 * Envia uma conversão offline (Click Conversion) para o Google Ads via gclid.
 * Best-effort: nunca lança — retorna { ok, httpStatus, responseBody } para o chamador logar.
 * Requer que a Conversion Action já exista na conta (GOOGLE_ADS_CONVERSION_ACTION_ID).
 */
export async function sendGoogleAdsConversion({ env, gclid, value, currency, conversionDateTime }) {
  const required = [
    'GOOGLE_ADS_DEVELOPER_TOKEN',
    'GOOGLE_ADS_CLIENT_ID',
    'GOOGLE_ADS_CLIENT_SECRET',
    'GOOGLE_ADS_REFRESH_TOKEN',
    'GOOGLE_ADS_CUSTOMER_ID',
    'GOOGLE_ADS_CONVERSION_ACTION_ID',
  ];
  const missing = required.filter((key) => !env[key]);
  if (missing.length > 0) {
    return { ok: false, skipped: true, reason: `Faltam variáveis: ${missing.join(', ')}` };
  }
  if (!gclid) {
    return { ok: false, skipped: true, reason: 'Lead sem gclid — não é possível reportar conversão de clique' };
  }

  const customerId = env.GOOGLE_ADS_CUSTOMER_ID.replace(/-/g, '');
  const loginCustomerId = (env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || customerId).replace(/-/g, '');

  let accessToken;
  try {
    accessToken = await getAccessToken(env);
  } catch (err) {
    return { ok: false, httpStatus: null, responseBody: String(err) };
  }

  const requestBody = {
    conversions: [
      {
        gclid,
        conversionAction: `customers/${customerId}/conversionActions/${env.GOOGLE_ADS_CONVERSION_ACTION_ID}`,
        conversionDateTime: conversionDateTime || toConversionDateTime(new Date()),
        conversionValue: Number(value) || 0,
        currencyCode: currency || 'BRL',
      },
    ],
    partialFailure: true,
  };
  const requestPayload = JSON.stringify(requestBody);

  try {
    const response = await fetch(
      `https://googleads.googleapis.com/${API_VERSION}/customers/${customerId}:uploadClickConversions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN,
          'login-customer-id': loginCustomerId,
        },
        body: requestPayload,
      }
    );
    const responseBody = await response.text();
    const hasPartialFailure = responseBody.includes('partialFailureError');
    return { ok: response.ok && !hasPartialFailure, httpStatus: response.status, requestPayload, responseBody };
  } catch (err) {
    return { ok: false, httpStatus: null, requestPayload, responseBody: String(err) };
  }
}
