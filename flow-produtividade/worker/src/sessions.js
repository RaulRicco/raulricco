import { uuid, today, getSessionsByDate, createSession, updateSession } from './db.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function handleGetSessions(request, env, userId) {
  const url = new URL(request.url);
  const date = url.searchParams.get('date') || today();
  const result = await getSessionsByDate(env.DB, userId, date);
  return json(result.results);
}

export async function handleCreateSession(request, env, userId) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

  const { mode, duration_minutes, date, task_id, area } = body;
  const validModes = ['focus', 'shortBreak', 'longBreak'];
  if (!validModes.includes(mode)) return json({ error: 'mode inválido' }, 400);
  if (!duration_minutes || duration_minutes < 1 || duration_minutes > 720) return json({ error: 'duration_minutes inválido' }, 400);

  const session = await createSession(env.DB, {
    id: uuid(),
    userId,
    date: /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : today(),
    mode,
    durationMinutes: duration_minutes,
    taskId: task_id,
    area: (typeof area === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(area)) ? area : null
  });
  return json(session, 201);
}

export async function handleUpdateSession(request, env, userId, sessionId) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
  const session = await updateSession(env.DB, sessionId, userId, body);
  if (!session) return json({ error: 'Sessão não encontrada' }, 404);
  return json(session);
}
