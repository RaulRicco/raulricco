import { uuid, today, getTasksByDate, createTask, updateTask, deleteTask } from './db.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function handleGetTasks(request, env, userId) {
  const url = new URL(request.url);
  const date = url.searchParams.get('date') || today();
  const result = await getTasksByDate(env.DB, userId, date);
  return json(result.results);
}

export async function handleCreateTask(request, env, userId) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

  const { text, priority, date, area, important, urgent, is_mit, estimate } = body;
  if (!text || !text.trim()) return json({ error: 'text é obrigatório' }, 400);

  const valid = ['low', 'medium', 'high'];
  const task = await createTask(env.DB, {
    id: uuid(),
    userId,
    text: text.trim(),
    priority: valid.includes(priority) ? priority : 'low',
    date: date || today(),
    area: (typeof area === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(area)) ? area : 'work',
    important: important === undefined ? true : !!important,
    urgent: !!urgent,
    isMit: !!is_mit,
    estimate: Math.max(1, Math.min(12, parseInt(estimate) || 1))
  });
  return json(task, 201);
}

export async function handleUpdateTask(request, env, userId, taskId) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

  // Reabrir uma etapa já continuada remove a continuação (se ainda não foi concluída)
  if (body.completed === false || body.completed === 0) {
    const cur = await env.DB.prepare('SELECT continued_to FROM tasks WHERE id = ? AND user_id = ?').bind(taskId, userId).first();
    if (cur && cur.continued_to) {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ? AND completed = 0').bind(cur.continued_to, userId),
        env.DB.prepare('UPDATE tasks SET continued_to = NULL WHERE id = ? AND user_id = ?').bind(taskId, userId),
      ]);
    }
  }

  const task = await updateTask(env.DB, taskId, userId, body);
  if (!task) return json({ error: 'Tarefa não encontrada' }, 404);
  return json(task);
}

function nextDay(date) {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return dt.toISOString().slice(0, 10);
}

// Conclui a etapa de hoje e cria a continuação (por padrão no dia seguinte)
// body: { text?, date?, keep_mit? }
export async function handleContinueTask(request, env, userId, taskId) {
  let body = {};
  try { body = await request.json(); } catch {}
  const t = await env.DB.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').bind(taskId, userId).first();
  if (!t) return json({ error: 'Tarefa não encontrada' }, 404);
  if (t.continued_to) {
    const existing = await env.DB.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').bind(t.continued_to, userId).first();
    if (existing) return json({ error: 'Esta etapa já tem continuação', done: t, next: existing }, 409);
  }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : nextDay(t.date);
  const text = String(body.text || t.text).trim().slice(0, 500) || t.text;
  const id = uuid();
  const maxRow = await env.DB.prepare('SELECT MAX(sort_order) m FROM tasks WHERE user_id = ? AND date = ?').bind(userId, date).first();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO tasks (id, user_id, text, priority, date, sort_order, area, important, urgent, is_mit, estimate, step, continues_from)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, userId, text, t.priority || 'low', date, (maxRow?.m ?? -1) + 1, t.area, t.important ?? 1, t.urgent ?? 0,
      body.keep_mit ? (t.is_mit ? 1 : 0) : 0, t.estimate || 1, (t.step || 1) + 1, t.id),
    env.DB.prepare(
      'UPDATE tasks SET completed = 1, completed_at = ?, continued_to = ? WHERE id = ? AND user_id = ?'
    ).bind(new Date().toISOString(), id, t.id, userId),
  ]);
  const [done, next] = await Promise.all([
    env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(t.id).first(),
    env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first(),
  ]);
  return json({ done, next }, 201);
}

export async function handleDeleteTask(request, env, userId, taskId) {
  const deleted = await deleteTask(env.DB, taskId, userId);
  if (!deleted) return json({ error: 'Tarefa não encontrada' }, 404);
  return json({ ok: true });
}
