import { json } from '../../_lib/response.js';
import { clearFinCookie } from '../../_lib/fin-auth.js';

export async function onRequestPost({ request }) {
  return json({ ok: true }, 200, { 'Set-Cookie': clearFinCookie(request) });
}
