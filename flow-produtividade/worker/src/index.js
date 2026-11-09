import { verifyJWT, handleRegister, handleLogin, handleGoogleStart, handleGoogleCallback } from './auth.js';
import { handleGetTasks, handleCreateTask, handleUpdateTask, handleDeleteTask } from './tasks.js';
import { handleGetSessions, handleCreateSession, handleUpdateSession } from './sessions.js';
import { handleGetGoals, handleCreateGoal, handleUpdateGoal, handleDeleteGoal } from './goals.js';
import { handleGetAreas, handleCreateArea, handleUpdateArea } from './areas.js';
import { getStats, getAnalytics, getReview, upsertReview, getUserById, getTasksRange, deleteSession, getSessionsRange } from './db.js';
import { TOKEN_PREFIX, userFromApiToken, handleListTokens, handleCreateToken, handleDeleteToken } from './tokens.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function cors(response, origin) {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin || '*');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return new Response(response.body, { status: response.status, headers });
}

// Retorna { userId, via } — via 'jwt' (login no app) ou 'token' (chave de API de automação)
async function authenticate(request, env, ctx) {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const credential = auth.slice(7).trim();
  try {
    if (credential.startsWith(TOKEN_PREFIX)) {
      const userId = await userFromApiToken(env, credential, ctx);
      return userId ? { userId, via: 'token' } : null;
    }
    return { userId: await verifyJWT(credential, env.JWT_SECRET), via: 'jwt' };
  } catch {
    return null;
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    const allowedOrigins = [env.FRONTEND_URL, 'http://localhost:8080', 'http://127.0.0.1:5500'];
    const origin = request.headers.get('Origin');
    const allowedOrigin = allowedOrigins.includes(origin) ? origin : (env.FRONTEND_URL || '*');

    if (method === 'OPTIONS') {
      return cors(new Response(null, { status: 204 }), allowedOrigin);
    }

    let response;

    try {
      // Auth routes — sem JWT
      if (path === '/auth/register' && method === 'POST') {
        response = await handleRegister(request, env);
      } else if (path === '/auth/login' && method === 'POST') {
        response = await handleLogin(request, env);
      } else if (path === '/auth/google' && method === 'GET') {
        response = await handleGoogleStart(request, env);
      } else if (path === '/auth/google/callback' && method === 'GET') {
        response = await handleGoogleCallback(request, env);
      } else {
        // Rotas protegidas
        const authInfo = await authenticate(request, env, ctx);
        const userId = authInfo?.userId;
        if (!userId) {
          response = json({ error: 'Não autorizado' }, 401);
        } else if (path === '/me' && method === 'GET') {
          const u = await getUserById(env.DB, userId);
          response = json({ id: u.id, email: u.email, name: u.name, auth: authInfo.via });
        } else if (path === '/tokens') {
          // Gerenciar chaves exige login real no app (uma chave não cria outras chaves)
          if (authInfo.via !== 'jwt') response = json({ error: 'Gerencie chaves pelo app (login com senha)' }, 403);
          else if (method === 'GET') response = await handleListTokens(request, env, userId);
          else if (method === 'POST') response = await handleCreateToken(request, env, userId);
          else response = json({ error: 'Método não permitido' }, 405);
        } else if (path.startsWith('/tokens/')) {
          if (authInfo.via !== 'jwt') response = json({ error: 'Gerencie chaves pelo app (login com senha)' }, 403);
          else if (method === 'DELETE') response = await handleDeleteToken(request, env, userId, path.slice(8));
          else response = json({ error: 'Método não permitido' }, 405);
        } else if (path === '/tasks') {
          const from = url.searchParams.get('from'), to = url.searchParams.get('to');
          if (method === 'GET' && (from || to)) {
            if (!DATE_RE.test(from || '') || !DATE_RE.test(to || '')) response = json({ error: 'from e to devem ser YYYY-MM-DD' }, 400);
            else response = json((await getTasksRange(env.DB, userId, from, to, url.searchParams.get('status'))).results);
          } else if (method === 'GET') response = await handleGetTasks(request, env, userId);
          else if (method === 'POST') response = await handleCreateTask(request, env, userId);
          else response = json({ error: 'Método não permitido' }, 405);
        } else if (path.startsWith('/tasks/')) {
          const taskId = path.slice(7);
          if (method === 'PATCH') response = await handleUpdateTask(request, env, userId, taskId);
          else if (method === 'DELETE') response = await handleDeleteTask(request, env, userId, taskId);
          else response = json({ error: 'Método não permitido' }, 405);
        } else if (path === '/sessions') {
          const from = url.searchParams.get('from'), to = url.searchParams.get('to');
          if (method === 'GET' && (from || to)) {
            if (!DATE_RE.test(from || '') || !DATE_RE.test(to || '')) response = json({ error: 'from e to devem ser YYYY-MM-DD' }, 400);
            else response = json((await getSessionsRange(env.DB, userId, from, to)).results);
          } else if (method === 'GET') response = await handleGetSessions(request, env, userId);
          else if (method === 'POST') response = await handleCreateSession(request, env, userId);
          else response = json({ error: 'Método não permitido' }, 405);
        } else if (path.startsWith('/sessions/')) {
          const sessionId = path.slice(10);
          if (method === 'PATCH') response = await handleUpdateSession(request, env, userId, sessionId);
          else if (method === 'DELETE') response = (await deleteSession(env.DB, sessionId, userId)) ? json({ ok: true }) : json({ error: 'Sessão não encontrada' }, 404);
          else response = json({ error: 'Método não permitido' }, 405);
        } else if (path === '/reviews') {
          const date = url.searchParams.get('date');
          if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) response = json({ error: 'date inválida' }, 400);
          else if (method === 'GET') response = json(await getReview(env.DB, userId, date) || null);
          else if (method === 'PUT') {
            let body;
            try { body = await request.json(); } catch { body = null; }
            response = body ? json(await upsertReview(env.DB, userId, date, body)) : json({ error: 'JSON inválido' }, 400);
          } else response = json({ error: 'Método não permitido' }, 405);
        } else if (path === '/areas') {
          if (method === 'GET') response = await handleGetAreas(request, env, userId);
          else if (method === 'POST') response = await handleCreateArea(request, env, userId);
          else response = json({ error: 'Método não permitido' }, 405);
        } else if (path.startsWith('/areas/')) {
          const areaId = decodeURIComponent(path.slice(7));
          if (method === 'PATCH') response = await handleUpdateArea(request, env, userId, areaId);
          else response = json({ error: 'Método não permitido' }, 405);
        } else if (path === '/analytics') {
          const since = url.searchParams.get('since');
          if (!since || !/^\d{4}-\d{2}-\d{2}$/.test(since)) response = json({ error: 'since inválido' }, 400);
          else response = json(await getAnalytics(env.DB, userId, since));
        } else if (path === '/goals') {
          if (method === 'GET') response = await handleGetGoals(request, env, userId);
          else if (method === 'POST') response = await handleCreateGoal(request, env, userId);
          else response = json({ error: 'Método não permitido' }, 405);
        } else if (path.startsWith('/goals/')) {
          const goalId = path.slice(7);
          if (method === 'PATCH') response = await handleUpdateGoal(request, env, userId, goalId);
          else if (method === 'DELETE') response = await handleDeleteGoal(request, env, userId, goalId);
          else response = json({ error: 'Método não permitido' }, 405);
        } else if (path === '/stats') {
          const days = parseInt(url.searchParams.get('days') || '7');
          const stats = await getStats(env.DB, userId, Math.min(days, 90));
          response = json(stats);
        } else {
          response = json({ error: 'Rota não encontrada' }, 404);
        }
      }
    } catch (err) {
      console.error(err);
      response = json({ error: 'Erro interno do servidor' }, 500);
    }

    return cors(response, allowedOrigin);
  }
};
