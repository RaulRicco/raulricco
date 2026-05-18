import { uuid, getGoals, createGoal, updateGoal, deleteGoal } from './db.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function periodDates(period) {
  const now = new Date();
  if (period === 'weekly') {
    const day = now.getDay();
    const start = new Date(now);
    start.setDate(now.getDate() - day);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  }
  // monthly
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export async function handleGetGoals(request, env, userId) {
  const result = await getGoals(env.DB, userId);
  return json(result.results);
}

export async function handleCreateGoal(request, env, userId) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

  const { title, period, target_value } = body;
  if (!title || !title.trim()) return json({ error: 'title é obrigatório' }, 400);

  const validPeriods = ['weekly', 'monthly'];
  if (!validPeriods.includes(period)) return json({ error: 'period deve ser weekly ou monthly' }, 400);

  const { start, end } = periodDates(period);

  const goal = await createGoal(env.DB, {
    id: uuid(),
    userId,
    title: title.trim(),
    period,
    targetValue: target_value || 100,
    startDate: start,
    endDate: end
  });
  return json(goal, 201);
}

export async function handleUpdateGoal(request, env, userId, goalId) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

  const goal = await updateGoal(env.DB, goalId, userId, {
    title: body.title,
    currentValue: body.current_value,
    targetValue: body.target_value
  });
  if (!goal) return json({ error: 'Meta não encontrada' }, 404);
  return json(goal);
}

export async function handleDeleteGoal(request, env, userId, goalId) {
  const deleted = await deleteGoal(env.DB, goalId, userId);
  if (!deleted) return json({ error: 'Meta não encontrada' }, 404);
  return json({ ok: true });
}
