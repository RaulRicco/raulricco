export function uuid() {
  return crypto.randomUUID();
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPassword(password, hash) {
  const computed = await hashPassword(password);
  return computed === hash;
}

export async function getUserById(db, id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
}

export async function getUserByEmail(db, email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
}

export async function getUserByGoogleId(db, googleId) {
  return db.prepare('SELECT * FROM users WHERE google_id = ?').bind(googleId).first();
}

export async function createUser(db, { id, email, passwordHash, googleId, name }) {
  await db.prepare(
    'INSERT INTO users (id, email, password_hash, google_id, name) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, email, passwordHash || null, googleId || null, name).run();
  return getUserById(db, id);
}

export async function getTasksByDate(db, userId, date) {
  return db.prepare(
    'SELECT * FROM tasks WHERE user_id = ? AND date = ? ORDER BY sort_order ASC, created_at ASC'
  ).bind(userId, date).all();
}

export async function createTask(db, { id, userId, text, priority, date, area, important, urgent, isMit, estimate }) {
  const maxRow = await db.prepare(
    'SELECT MAX(sort_order) as max_order FROM tasks WHERE user_id = ? AND date = ?'
  ).bind(userId, date).first();
  const sortOrder = (maxRow?.max_order ?? -1) + 1;
  await db.prepare(
    'INSERT INTO tasks (id, user_id, text, priority, date, sort_order, area, important, urgent, is_mit, estimate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, userId, text, priority || 'low', date, sortOrder, area, important ? 1 : 0, urgent ? 1 : 0, isMit ? 1 : 0, estimate).run();
  return db.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first();
}

export async function updateTask(db, id, userId, fields) {
  const sets = [];
  const vals = [];
  if (fields.text !== undefined) { sets.push('text = ?'); vals.push(fields.text); }
  if (fields.completed !== undefined) {
    sets.push('completed = ?'); vals.push(fields.completed ? 1 : 0);
    sets.push('completed_at = ?'); vals.push(fields.completed ? new Date().toISOString() : null);
  }
  if (fields.date !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(fields.date)) { sets.push('date = ?'); vals.push(fields.date); }
  if (fields.area !== undefined && typeof fields.area === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(fields.area)) { sets.push('area = ?'); vals.push(fields.area); }
  if (fields.important !== undefined) { sets.push('important = ?'); vals.push(fields.important ? 1 : 0); }
  if (fields.urgent !== undefined) { sets.push('urgent = ?'); vals.push(fields.urgent ? 1 : 0); }
  if (fields.is_mit !== undefined) { sets.push('is_mit = ?'); vals.push(fields.is_mit ? 1 : 0); }
  if (fields.estimate !== undefined) { sets.push('estimate = ?'); vals.push(Math.max(1, Math.min(12, parseInt(fields.estimate) || 1))); }
  if (fields.priority !== undefined) { sets.push('priority = ?'); vals.push(fields.priority); }
  if (fields.sort_order !== undefined) { sets.push('sort_order = ?'); vals.push(fields.sort_order); }
  if (sets.length === 0) return null;
  vals.push(id, userId);
  await db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).bind(...vals).run();
  return db.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first();
}

export async function deleteTask(db, id, userId) {
  const result = await db.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?').bind(id, userId).run();
  return result.meta.changes > 0;
}

export async function getTasksRange(db, userId, from, to, status) {
  const extra = status === 'pending' ? ' AND completed = 0' : status === 'done' ? ' AND completed = 1' : '';
  return db.prepare(
    `SELECT * FROM tasks WHERE user_id = ? AND date >= ? AND date <= ?${extra} ORDER BY date ASC, sort_order ASC, created_at ASC`
  ).bind(userId, from, to).all();
}

export async function getSessionsRange(db, userId, from, to) {
  return db.prepare(
    'SELECT * FROM pomodoro_sessions WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY created_at ASC'
  ).bind(userId, from, to).all();
}

export async function deleteSession(db, id, userId) {
  const r = await db.prepare('DELETE FROM pomodoro_sessions WHERE id = ? AND user_id = ?').bind(id, userId).run();
  return r.meta.changes > 0;
}

export async function getSessionsByDate(db, userId, date) {
  return db.prepare(
    'SELECT * FROM pomodoro_sessions WHERE user_id = ? AND date = ? ORDER BY created_at ASC'
  ).bind(userId, date).all();
}

export async function createSession(db, { id, userId, date, mode, durationMinutes, taskId, area }) {
  await db.prepare(
    'INSERT INTO pomodoro_sessions (id, user_id, date, mode, duration_minutes, task_id, area) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, userId, date, mode, durationMinutes, taskId || null, area || null).run();
  return db.prepare('SELECT * FROM pomodoro_sessions WHERE id = ?').bind(id).first();
}

export async function updateSession(db, id, userId, fields) {
  const sets = [];
  const vals = [];
  if (fields.focus_quality !== undefined) {
    const q = parseInt(fields.focus_quality);
    if (q >= 1 && q <= 5) { sets.push('focus_quality = ?'); vals.push(q); }
  }
  if (fields.task_id !== undefined) { sets.push('task_id = ?'); vals.push(fields.task_id || null); }
  if (sets.length === 0) return null;
  vals.push(id, userId);
  await db.prepare(`UPDATE pomodoro_sessions SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).bind(...vals).run();
  return db.prepare('SELECT * FROM pomodoro_sessions WHERE id = ? AND user_id = ?').bind(id, userId).first();
}

export async function getReview(db, userId, date) {
  return db.prepare('SELECT * FROM daily_reviews WHERE user_id = ? AND date = ?').bind(userId, date).first();
}

export async function upsertReview(db, userId, date, f) {
  const clamp = v => { const n = parseInt(v); return n >= 1 && n <= 5 ? n : null; };
  await db.prepare(
    `INSERT INTO daily_reviews (user_id, date, energy, mood, wins, blockers, tomorrow, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, date) DO UPDATE SET
       energy = excluded.energy, mood = excluded.mood, wins = excluded.wins,
       blockers = excluded.blockers, tomorrow = excluded.tomorrow, updated_at = excluded.updated_at`
  ).bind(userId, date, clamp(f.energy), clamp(f.mood), f.wins || null, f.blockers || null, f.tomorrow || null).run();
  return getReview(db, userId, date);
}

// Dados brutos para o dashboard de análise (agregação feita no cliente)
export async function getAnalytics(db, userId, since) {
  const [sessions, tasks, reviews, goals, areas] = await db.batch([
    db.prepare(
      `SELECT id, date, mode, duration_minutes, task_id, area, focus_quality, created_at
       FROM pomodoro_sessions WHERE user_id = ? AND date >= ? AND completed = 1 ORDER BY created_at ASC`
    ).bind(userId, since),
    db.prepare(
      `SELECT id, text, date, completed, priority, area, important, urgent, is_mit, estimate, completed_at, created_at
       FROM tasks WHERE user_id = ? AND date >= ? ORDER BY date ASC`
    ).bind(userId, since),
    db.prepare(
      `SELECT date, energy, mood, wins, blockers, tomorrow FROM daily_reviews WHERE user_id = ? AND date >= ? ORDER BY date ASC`
    ).bind(userId, since),
    db.prepare('SELECT * FROM goals WHERE user_id = ? ORDER BY created_at DESC').bind(userId),
    db.prepare('SELECT * FROM areas WHERE user_id = ? ORDER BY archived ASC, sort_order ASC, created_at ASC').bind(userId),
  ]);
  return { sessions: sessions.results, tasks: tasks.results, reviews: reviews.results, goals: goals.results, areas: areas.results };
}

export async function getGoals(db, userId) {
  return db.prepare(
    'SELECT * FROM goals WHERE user_id = ? ORDER BY created_at DESC'
  ).bind(userId).all();
}

export async function createGoal(db, { id, userId, title, period, targetValue, startDate, endDate, area }) {
  await db.prepare(
    'INSERT INTO goals (id, user_id, title, period, target_value, start_date, end_date, area) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, userId, title, period, targetValue || 100, startDate, endDate, area || 'work').run();
  return db.prepare('SELECT * FROM goals WHERE id = ?').bind(id).first();
}

export async function updateGoal(db, id, userId, fields) {
  const sets = [];
  const vals = [];
  if (fields.title !== undefined) { sets.push('title = ?'); vals.push(fields.title); }
  if (fields.currentValue !== undefined) { sets.push('current_value = ?'); vals.push(fields.currentValue); }
  if (fields.targetValue !== undefined) { sets.push('target_value = ?'); vals.push(fields.targetValue); }
  if (sets.length === 0) return null;
  vals.push(id, userId);
  await db.prepare(`UPDATE goals SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).bind(...vals).run();
  return db.prepare('SELECT * FROM goals WHERE id = ?').bind(id).first();
}

export async function deleteGoal(db, id, userId) {
  const result = await db.prepare('DELETE FROM goals WHERE id = ? AND user_id = ?').bind(id, userId).run();
  return result.meta.changes > 0;
}

export async function getStats(db, userId, days) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().slice(0, 10);

  const sessions = await db.prepare(
    `SELECT date, mode, SUM(duration_minutes) as total_minutes, COUNT(*) as count
     FROM pomodoro_sessions
     WHERE user_id = ? AND date >= ? AND completed = 1
     GROUP BY date, mode
     ORDER BY date ASC`
  ).bind(userId, sinceStr).all();

  const tasks = await db.prepare(
    `SELECT date, COUNT(*) as total, SUM(completed) as done
     FROM tasks
     WHERE user_id = ? AND date >= ?
     GROUP BY date
     ORDER BY date ASC`
  ).bind(userId, sinceStr).all();

  return { sessions: sessions.results, tasks: tasks.results };
}
