import { buildLogoutCookie } from '../../_lib/session.js';
import { json } from '../../_lib/response.js';

export async function onRequestPost({ request }) {
  return json({ ok: true }, 200, { 'Set-Cookie': buildLogoutCookie(request) });
}
