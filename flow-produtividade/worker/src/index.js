import { verifyJWT, handleRegister, handleLogin, handleGoogleStart, handleGoogleCallback } from './auth.js';
import { handleGetTasks, handleCreateTask, handleUpdateTask, handleDeleteTask } from './tasks.js';
import { handleGetSessions, handleCreateSession } from './sessions.js';
import { handleGetGoals, handleCreateGoal, handleUpdateGoal, handleDeleteGoal } from './goals.js';
import { getStats } from './db.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function cors(response, origin) {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin || '*');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return new Response(response.body, { status: response.status, headers });
}

async function authenticate(request, env) {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  try {
    return await verifyJWT(auth.slice(7), env.JWT_SECRET);
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env) {
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
        const userId = await authenticate(request, env);
        if (!userId) {
          response = json({ error: 'Não autorizado' }, 401);
        } else if (path === '/tasks') {
          if (method === 'GET') response = await handleGetTasks(request, env, userId);
          else if (method === 'POST') response = await handleCreateTask(request, env, userId);
          else response = json({ error: 'Método não permitido' }, 405);
        } else if (path.startsWith('/tasks/')) {
          const taskId = path.slice(7);
          if (method === 'PATCH') response = await handleUpdateTask(request, env, userId, taskId);
          else if (method === 'DELETE') response = await handleDeleteTask(request, env, userId, taskId);
          else response = json({ error: 'Método não permitido' }, 405);
        } else if (path === '/sessions') {
          if (method === 'GET') response = await handleGetSessions(request, env, userId);
          else if (method === 'POST') response = await handleCreateSession(request, env, userId);
          else response = json({ error: 'Método não permitido' }, 405);
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
