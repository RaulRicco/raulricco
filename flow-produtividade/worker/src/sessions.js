import { uuid, today, getSessionsByDate, createSession } from './db.js';

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

  const { mode, duration_minutes, date } = body;
  const validModes = ['focus', 'shortBreak', 'longBreak'];
  if (!validModes.includes(mode)) return json({ error: 'mode inválido' }, 400);
  if (!duration_minutes || duration_minutes < 1) return json({ error: 'duration_minutes inválido' }, 400);

  const session = await createSession(env.DB, {
    id: uuid(),
    userId,
    date: date || today(),
    mode,
    durationMinutes: duration_minutes
  });
  return json(session, 201);
}
