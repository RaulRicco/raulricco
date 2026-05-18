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

  const { text, priority, date } = body;
  if (!text || !text.trim()) return json({ error: 'text é obrigatório' }, 400);

  const valid = ['low', 'medium', 'high'];
  const task = await createTask(env.DB, {
    id: uuid(),
    userId,
    text: text.trim(),
    priority: valid.includes(priority) ? priority : 'low',
    date: date || today()
  });
  return json(task, 201);
}

export async function handleUpdateTask(request, env, userId, taskId) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

  const task = await updateTask(env.DB, taskId, userId, body);
  if (!task) return json({ error: 'Tarefa não encontrada' }, 404);
  return json(task);
}

export async function handleDeleteTask(request, env, userId, taskId) {
  const deleted = await deleteTask(env.DB, taskId, userId);
  if (!deleted) return json({ error: 'Tarefa não encontrada' }, 404);
  return json({ ok: true });
}
