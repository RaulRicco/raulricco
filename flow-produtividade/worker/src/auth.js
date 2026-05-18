import { SignJWT, jwtVerify } from 'jose';
import { uuid, hashPassword, verifyPassword, getUserByEmail, getUserByGoogleId, createUser } from './db.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function makeJWT(userId, secret) {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .sign(key);
}

export async function verifyJWT(token, secret) {
  const key = new TextEncoder().encode(secret);
  const { payload } = await jwtVerify(token, key);
  return payload.sub;
}

export async function handleRegister(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

  const { email, password, name } = body;
  if (!email || !password || !name) return json({ error: 'email, password e name são obrigatórios' }, 400);
  if (password.length < 6) return json({ error: 'Senha deve ter pelo menos 6 caracteres' }, 400);

  const existing = await getUserByEmail(env.DB, email.toLowerCase());
  if (existing) return json({ error: 'Email já cadastrado' }, 409);

  const user = await createUser(env.DB, {
    id: uuid(),
    email: email.toLowerCase(),
    passwordHash: await hashPassword(password),
    name
  });

  const token = await makeJWT(user.id, env.JWT_SECRET);
  return json({ token, user: { id: user.id, email: user.email, name: user.name } }, 201);
}

export async function handleLogin(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

  const { email, password } = body;
  if (!email || !password) return json({ error: 'email e password são obrigatórios' }, 400);

  const user = await getUserByEmail(env.DB, email.toLowerCase());
  if (!user || !user.password_hash) return json({ error: 'Credenciais inválidas' }, 401);

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) return json({ error: 'Credenciais inválidas' }, 401);

  const token = await makeJWT(user.id, env.JWT_SECRET);
  return json({ token, user: { id: user.id, email: user.email, name: user.name } });
}

export async function handleGoogleStart(request, env) {
  const state = uuid();
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    state
  });
  return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, 302);
}

export async function handleGoogleCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (!code) return json({ error: 'Código OAuth ausente' }, 400);

  // Trocar code por token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code'
    })
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.id_token) {
    return Response.redirect(`${env.FRONTEND_URL}/index.html?error=google_failed`, 302);
  }

  // Decodificar id_token (sem verificar assinatura — apenas extrair claims)
  const [, payloadB64] = tokenData.id_token.split('.');
  const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
  const { sub: googleId, email, name } = payload;

  // Buscar ou criar usuário
  let user = await getUserByGoogleId(env.DB, googleId);
  if (!user) {
    user = await getUserByEmail(env.DB, email.toLowerCase());
    if (user) {
      // Vincular Google ao usuário existente
      await env.DB.prepare('UPDATE users SET google_id = ? WHERE id = ?').bind(googleId, user.id).run();
    } else {
      user = await createUser(env.DB, {
        id: uuid(),
        email: email.toLowerCase(),
        googleId,
        name: name || email.split('@')[0]
      });
    }
  }

  const token = await makeJWT(user.id, env.JWT_SECRET);
  return Response.redirect(`${env.FRONTEND_URL}/app.html?token=${token}`, 302);
}
