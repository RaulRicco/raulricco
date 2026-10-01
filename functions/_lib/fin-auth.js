import { createSessionToken, verifySessionToken, getCookie } from './session.js';

export const FIN_COOKIE = 'fin_session';
const TTL_S = 30 * 24 * 60 * 60; // 30 dias
const MAX_FAILS = 10;
const WINDOW_MS = 15 * 60 * 1000;

// Chave diferente da do CRM: um token do CRM não abre o financeiro (e vice-versa).
const finSecret = (env) => `${env.SESSION_SECRET}|fin`;

export async function hasFinSession(request, env) {
  const token = getCookie(request, FIN_COOKIE);
  return !!token && (await verifySessionToken(token, finSecret(env)));
}

export async function createFinCookie(request, env) {
  const token = await createSessionToken(finSecret(env));
  return cookie(request, encodeURIComponent(token), TTL_S);
}

export function clearFinCookie(request) {
  return cookie(request, '', 0);
}

function cookie(request, value, maxAge) {
  const secure = new URL(request.url).protocol === 'https:' ? ' Secure;' : '';
  return `${FIN_COOKIE}=${value}; HttpOnly;${secure} SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

/** Compara a senha sem vazar tempo de execução (compara os hashes). */
export async function passwordMatches(input, expected) {
  if (!expected) return false;
  const h = async (s) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [a, b] = await Promise.all([h(input), h(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function isBlocked(env, ip) {
  const since = Date.now() - WINDOW_MS;
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM fin_login_attempts WHERE ip = ? AND created_at > ?').bind(ip, since).first();
  return (row?.n || 0) >= MAX_FAILS;
}

export async function recordFailure(env, ip) {
  await env.DB.batch([
    env.DB.prepare('INSERT INTO fin_login_attempts (ip, created_at) VALUES (?, ?)').bind(ip, Date.now()),
    env.DB.prepare('DELETE FROM fin_login_attempts WHERE created_at < ?').bind(Date.now() - WINDOW_MS),
  ]);
}

export async function clearFailures(env, ip) {
  await env.DB.prepare('DELETE FROM fin_login_attempts WHERE ip = ?').bind(ip).run();
}

/** Tela de login entregue no lugar do app quando não há sessão (autocontida: nada de /financeiro é exposto). */
export function loginPage() {
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>Ricco Orçamento</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;background:#1c232f;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1d2630}
form{background:#fff;border-radius:10px;padding:34px 30px;width:100%;max-width:380px;display:grid;gap:14px;box-shadow:0 20px 60px rgba(0,0,0,.35)}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:19px}.logo{width:32px;height:32px;border-radius:50%;border:2px solid #7267ef;color:#7267ef;display:grid;place-items:center;font-weight:700}
p{margin:0;font-size:13px;color:#6b7280}input{width:100%;border:1px solid #dfe2ec;border-radius:6px;padding:11px 12px;font:inherit;font-size:14px;outline:none}
input:focus{border-color:#7267ef;box-shadow:0 0 0 3px rgba(114,103,239,.15)}button{background:#7267ef;color:#fff;border:0;border-radius:6px;padding:11px;font:inherit;font-weight:500;cursor:pointer}
button:hover{background:#6358e6}button:disabled{opacity:.6}.err{color:#ea4d4d;font-size:12.5px}.err:empty{display:none}
</style></head><body>
<form id="f"><div class="brand"><span class="logo">$</span>Ricco Orçamento</div>
<p>Acesso restrito. Digite a senha para continuar.</p>
<input type="password" name="password" placeholder="Senha" autocomplete="current-password" required autofocus>
<div class="err" id="e"></div><button type="submit">Entrar</button></form>
<script>
document.getElementById('f').onsubmit=async function(ev){ev.preventDefault();var b=this.querySelector('button'),e=document.getElementById('e');b.disabled=true;e.textContent='';
try{var r=await fetch('/api/fin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:this.password.value})});
if(r.ok){location.reload();return}var d=await r.json().catch(function(){return{}});e.textContent=d.error||('Erro '+r.status)}catch(x){e.textContent='Sem conexão'}b.disabled=false};
</script></body></html>`;
  return new Response(html, { status: 401, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
