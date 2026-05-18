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

export async function createTask(db, { id, userId, text, priority, date }) {
  const maxRow = await db.prepare(
    'SELECT MAX(sort_order) as max_order FROM tasks WHERE user_id = ? AND date = ?'
  ).bind(userId, date).first();
  const sortOrder = (maxRow?.max_order ?? -1) + 1;
  await db.prepare(
    'INSERT INTO tasks (id, user_id, text, priority, date, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, userId, text, priority || 'low', date, sortOrder).run();
  return db.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first();
}

export async function updateTask(db, id, userId, fields) {
  const sets = [];
  const vals = [];
  if (fields.text !== undefined) { sets.push('text = ?'); vals.push(fields.text); }
  if (fields.completed !== undefined) { sets.push('completed = ?'); vals.push(fields.completed ? 1 : 0); }
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

export async function getSessionsByDate(db, userId, date) {
  return db.prepare(
    'SELECT * FROM pomodoro_sessions WHERE user_id = ? AND date = ? ORDER BY created_at ASC'
  ).bind(userId, date).all();
}

export async function createSession(db, { id, userId, date, mode, durationMinutes }) {
  await db.prepare(
    'INSERT INTO pomodoro_sessions (id, user_id, date, mode, duration_minutes) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, userId, date, mode, durationMinutes).run();
  return db.prepare('SELECT * FROM pomodoro_sessions WHERE id = ?').bind(id).first();
}

export async function getGoals(db, userId) {
  return db.prepare(
    'SELECT * FROM goals WHERE user_id = ? ORDER BY created_at DESC'
  ).bind(userId).all();
}

export async function createGoal(db, { id, userId, title, period, targetValue, startDate, endDate }) {
  await db.prepare(
    'INSERT INTO goals (id, user_id, title, period, target_value, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, userId, title, period, targetValue || 100, startDate, endDate).run();
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
