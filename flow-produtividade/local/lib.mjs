// Flow Produtividade — cliente local (sem dependências, Node 18+)
// Usado pela CLI (flow.mjs) e pelo servidor MCP (mcp.mjs).
import { readFileSync, writeFileSync, mkdirSync, chmodSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const CONFIG_DIR = process.env.FLOW_HOME || join(homedir(), '.flow');
export const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
export const DEFAULT_API = 'https://flow-produtividade-api.raulriccoads.workers.dev';

export function loadConfig() {
    let cfg = {};
    if (existsSync(CONFIG_FILE)) {
        try { cfg = JSON.parse(readFileSync(CONFIG_FILE, 'utf8')); } catch { cfg = {}; }
    }
    return {
        api: process.env.FLOW_API_URL || cfg.api || DEFAULT_API,
        token: process.env.FLOW_TOKEN || cfg.token || null,
    };
}

export function saveConfig(cfg) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
    chmodSync(CONFIG_FILE, 0o600);
}

export class FlowError extends Error {
    constructor(message, status) { super(message); this.status = status; }
}

export async function api(method, path, body, { token, apiUrl } = {}) {
    const cfg = loadConfig();
    const t = token || cfg.token;
    if (!t) throw new FlowError('Sem chave de API. Rode: flow login', 401);
    const res = await fetch((apiUrl || cfg.api) + path, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) throw new FlowError((data && data.error) || `HTTP ${res.status}`, res.status);
    return data;
}

// ---------- Datas (fuso de São Paulo, igual ao app) ----------
export function brDate(offsetDays = 0) {
    const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    d.setDate(d.getDate() - offsetDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function resolveDate(v) {
    if (!v || v === 'hoje' || v === 'today') return brDate();
    if (v === 'ontem' || v === 'yesterday') return brDate(1);
    if (v === 'amanha' || v === 'amanhã' || v === 'tomorrow') return brDate(-1);
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(v);
    if (m) return `${m[3] || brDate().slice(0, 4)}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    throw new FlowError(`Data inválida: ${v} (use YYYY-MM-DD, DD/MM, hoje, ontem, amanhã)`, 400);
}

const weekday = d => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd).getDay(); };

export function periodDates(period, offset = 0) {
    const today = brDate();
    if (period === 'daily') return [brDate(offset)];
    if (period === 'weekly') {
        const back = (weekday(today) + 6) % 7 + offset * 7;
        return Array.from({ length: 7 }, (_, i) => brDate(back - i));
    }
    const [y, m] = today.split('-').map(Number);
    const first = new Date(y, m - 1 - offset, 1);
    const n = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    return Array.from({ length: n }, (_, i) => `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`);
}

// "90", "90m", "1h30", "1h 30m", "1.5h", "1:30" → minutos
export function parseMinutes(v) {
    if (typeof v === 'number') return Math.round(v);
    const s = String(v).trim().toLowerCase().replace(/\s+/g, '');
    let m;
    if ((m = /^(\d+):(\d{1,2})$/.exec(s))) return +m[1] * 60 + +m[2];
    if ((m = /^(\d+(?:[.,]\d+)?)h(?:(\d+)m?(?:in)?)?$/.exec(s))) return Math.round(parseFloat(m[1].replace(',', '.')) * 60 + (+m[2] || 0));
    if ((m = /^(\d+)(?:m|min)?$/.exec(s))) return +m[1];
    throw new FlowError(`Duração inválida: ${v} (ex.: 45, 45m, 1h30, 2h)`, 400);
}

export function fmtMinutes(min) {
    min = Math.round(min || 0);
    const h = Math.floor(min / 60), m = min % 60;
    return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

// ---------- Quadrantes ----------
export const QUADRANTS = {
    q1: { label: 'Fazer agora', important: 1, urgent: 1, priority: 'high' },
    q2: { label: 'Agendar', important: 1, urgent: 0, priority: 'medium' },
    q3: { label: 'Delegar', important: 0, urgent: 1, priority: 'low' },
    q4: { label: 'Eliminar', important: 0, urgent: 0, priority: 'low' },
};
export const quadrantOf = t => (+t.important ? (+t.urgent ? 'q1' : 'q2') : (+t.urgent ? 'q3' : 'q4'));

// ---------- Áreas ----------
export async function listAreas() { return api('GET', '/areas'); }

export async function resolveArea(ref, areas) {
    if (ref === undefined || ref === null || ref === '') return undefined;
    areas = areas || await listAreas();
    const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const hit = areas.find(a => a.id === ref) || areas.find(a => norm(a.name) === norm(ref)) ||
        areas.find(a => norm(a.name).startsWith(norm(ref)));
    if (!hit) throw new FlowError(`Área não encontrada: ${ref}. Áreas: ${areas.filter(a => !a.archived).map(a => a.name).join(', ')}`, 404);
    return hit.id;
}

export async function upsertArea({ id, name, target, period, color, icon, archived }) {
    const body = {};
    if (name !== undefined) body.name = name;
    if (target !== undefined) body.target_minutes = parseMinutes(target);
    if (period !== undefined) body.target_period = normPeriod(period);
    if (color !== undefined) body.color = color;
    if (icon !== undefined) body.icon = icon.startsWith('fa-') ? icon : `fa-${icon}`;
    if (archived !== undefined) body.archived = !!archived;
    if (id) return api('PATCH', `/areas/${encodeURIComponent(await resolveArea(id))}`, body);
    if (!name) throw new FlowError('name é obrigatório para criar área', 400);
    return api('POST', '/areas', body);
}

function normPeriod(p) {
    const map = { dia: 'daily', diario: 'daily', daily: 'daily', day: 'daily', semana: 'weekly', semanal: 'weekly', weekly: 'weekly', week: 'weekly', mes: 'monthly', 'mês': 'monthly', mensal: 'monthly', monthly: 'monthly', month: 'monthly' };
    const v = map[String(p).toLowerCase()];
    if (!v) throw new FlowError(`Período inválido: ${p} (dia, semana, mes)`, 400);
    return v;
}

// ---------- Tarefas ----------
export async function listTasks({ date, from, to, status } = {}) {
    if (from || to) {
        const qs = new URLSearchParams({ from: resolveDate(from || to), to: resolveDate(to || from) });
        if (status) qs.set('status', status);
        return api('GET', `/tasks?${qs}`);
    }
    const tasks = await api('GET', `/tasks?date=${resolveDate(date)}`);
    return status === 'pending' ? tasks.filter(t => !t.completed) : status === 'done' ? tasks.filter(t => t.completed) : tasks;
}

export async function addTask({ text, area, quadrant, mit, estimate, date }) {
    if (!text || !String(text).trim()) throw new FlowError('text é obrigatório', 400);
    const Q = QUADRANTS[quadrant || 'q2'];
    if (!Q) throw new FlowError('quadrant deve ser q1, q2, q3 ou q4', 400);
    return api('POST', '/tasks', {
        text: String(text).trim(), date: resolveDate(date), area: (await resolveArea(area)) || 'work',
        important: Q.important, urgent: Q.urgent, priority: Q.priority, is_mit: !!mit, estimate: estimate || 1,
    });
}

export async function updateTask(id, { text, area, quadrant, mit, estimate, date, completed }) {
    if (!id) throw new FlowError('id é obrigatório', 400);
    const body = {};
    if (text !== undefined) body.text = text;
    if (area !== undefined) body.area = await resolveArea(area);
    if (quadrant !== undefined) {
        const Q = QUADRANTS[quadrant];
        if (!Q) throw new FlowError('quadrant deve ser q1, q2, q3 ou q4', 400);
        Object.assign(body, { important: Q.important, urgent: Q.urgent, priority: Q.priority });
    }
    if (mit !== undefined) body.is_mit = !!mit;
    if (estimate !== undefined) body.estimate = estimate;
    if (date !== undefined) body.date = resolveDate(date);
    if (completed !== undefined) body.completed = !!completed;
    return api('PATCH', `/tasks/${encodeURIComponent(id)}`, body);
}

function need(id, what = 'id') { if (!id) throw new FlowError(`${what} é obrigatório`, 400); return encodeURIComponent(id); }

export const deleteTask = id => api('DELETE', `/tasks/${need(id)}`);

// Conclui a etapa de hoje (conta como feita hoje) e cria a próxima etapa (padrão: amanhã)
export async function completeStep(id, { next, date, keepMit } = {}) {
    return api('POST', `/tasks/${need(id)}/continue`, {
        text: next || undefined, date: date ? resolveDate(date) : brDate(-1), keep_mit: !!keepMit,
    });
}

// ---------- Sessões / tempo ----------
export async function logTime({ minutes, area, task, date, quality }) {
    const m = parseMinutes(minutes);
    if (m < 1 || m > 720) throw new FlowError('Duração deve ficar entre 1 minuto e 12 horas', 400);
    let areaId = await resolveArea(area);
    if (!areaId && task) {
        const t = (await listTasks({ from: brDate(60), to: brDate(-30) })).find(x => x.id === task);
        areaId = t ? t.area : undefined;
    }
    if (!areaId && !task) throw new FlowError('Informe area ou task', 400);
    const s = await api('POST', '/sessions', { mode: 'focus', duration_minutes: m, date: resolveDate(date), area: areaId, task_id: task || null });
    if (quality) return api('PATCH', `/sessions/${s.id}`, { focus_quality: quality });
    return s;
}

export async function listSessions({ date, from, to } = {}) {
    if (from || to) return api('GET', `/sessions?from=${resolveDate(from || to)}&to=${resolveDate(to || from)}`);
    return api('GET', `/sessions?date=${resolveDate(date)}`);
}
export const deleteSession = id => api('DELETE', `/sessions/${need(id)}`);
export const rateSession = (id, quality) => api('PATCH', `/sessions/${need(id)}`, { focus_quality: quality });

// ---------- Metas ----------
export const listGoals = () => api('GET', '/goals');
export async function addGoal({ title, period = 'quarterly', area, target = 100 }) {
    const p = { trimestral: 'quarterly', quarterly: 'quarterly', mensal: 'monthly', monthly: 'monthly', semanal: 'weekly', weekly: 'weekly' }[String(period).toLowerCase()];
    if (!p) throw new FlowError('period: trimestral, mensal ou semanal', 400);
    return api('POST', '/goals', { title, period: p, area: (await resolveArea(area)) || 'work', target_value: +target });
}
export const updateGoal = (id, { title, current, target }) => api('PATCH', `/goals/${need(id)}`,
    { title, current_value: current === undefined ? undefined : +current, target_value: target === undefined ? undefined : +target });
export const deleteGoal = id => api('DELETE', `/goals/${need(id)}`);

// ---------- Shutdown diário ----------
export const getReview = date => api('GET', `/reviews?date=${resolveDate(date)}`);
export async function setReview({ date, ...fields }) {
    const d = resolveDate(date);
    const cur = (await api('GET', `/reviews?date=${d}`)) || {};
    const merged = { energy: cur.energy, mood: cur.mood, wins: cur.wins, blockers: cur.blockers, tomorrow: cur.tomorrow };
    for (const k of Object.keys(merged)) if (fields[k] !== undefined) merged[k] = fields[k];
    return api('PUT', `/reviews?date=${d}`, merged);
}

// ---------- Resumos ----------
const DAILY_DEEP_DEFAULT = 180;

function scoreDay({ focusMin, mitTotal, mitDone, taskTotal, taskDone, qualities, sessions }, target = DAILY_DEEP_DEFAULT) {
    const deep = Math.min(focusMin / target, 1) * 40;
    const mit = mitTotal ? (mitDone / mitTotal) * 30 : 0;
    const exec = taskTotal ? (taskDone / taskTotal) * 20 : 0;
    let q = 0;
    if (sessions) {
        const rated = qualities.filter(Boolean);
        q = ((rated.reduce((a, b) => a + b, 0) + (sessions - rated.length) * 3) / sessions / 5) * 10;
    }
    return Math.round(deep + mit + exec + q);
}

export async function stats({ days = 30 } = {}) {
    days = Math.max(1, Math.min(180, +days || 30));
    const raw = await api('GET', `/analytics?since=${brDate(Math.max(days - 1, 31))}`);
    const areas = raw.areas || [];
    const taskById = Object.fromEntries(raw.tasks.map(t => [t.id, t]));
    const areaOf = s => s.area || (s.task_id && taskById[s.task_id] ? taskById[s.task_id].area : '') || '';
    const range = new Set(Array.from({ length: days }, (_, i) => brDate(i)));
    const focus = raw.sessions.filter(s => s.mode === 'focus');

    const byDay = {};
    for (const d of range) byDay[d] = { focusMin: 0, sessions: 0, qualities: [], taskTotal: 0, taskDone: 0, mitTotal: 0, mitDone: 0 };
    focus.forEach(s => { const d = byDay[s.date]; if (d) { d.focusMin += s.duration_minutes; d.sessions++; d.qualities.push(s.focus_quality); } });
    raw.tasks.forEach(t => { const d = byDay[t.date]; if (d) { d.taskTotal++; if (t.completed) d.taskDone++; if (t.is_mit) { d.mitTotal++; if (t.completed) d.mitDone++; } } });
    const dayList = Object.values(byDay);
    const sum = f => dayList.reduce((a, d) => a + f(d), 0);

    const minutesIn = dates => {
        const set = new Set(dates); const out = {};
        focus.forEach(s => { if (set.has(s.date)) out[areaOf(s)] = (out[areaOf(s)] || 0) + s.duration_minutes; });
        return out;
    };
    const rangeMin = minutesIn([...range]);
    const perArea = areas.filter(a => !a.archived).map(a => {
        const cur = periodDates(a.target_period);
        const done = minutesIn(cur)[a.id] || 0;
        const today = brDate();
        const daysLeft = cur.filter(d => d >= today).length;
        return {
            id: a.id, name: a.name,
            target: a.target_minutes ? `${fmtMinutes(a.target_minutes)}/${{ daily: 'dia', weekly: 'semana', monthly: 'mês' }[a.target_period]}` : null,
            current_period: { done_minutes: done, target_minutes: a.target_minutes, percent: a.target_minutes ? Math.round(done / a.target_minutes * 100) : null,
                missing_minutes: Math.max(0, a.target_minutes - done), days_left: daysLeft,
                needed_per_day_minutes: daysLeft && a.target_minutes > done ? Math.round((a.target_minutes - done) / daysLeft) : 0 },
            range_minutes: rangeMin[a.id] || 0,
        };
    });
    const mitT = sum(d => d.mitTotal), mitD = sum(d => d.mitDone);
    const quals = focus.filter(s => range.has(s.date) && s.focus_quality).map(s => s.focus_quality);
    return {
        period: { from: brDate(days - 1), to: brDate(), days },
        deep_work_minutes: sum(d => d.focusMin),
        deep_work: fmtMinutes(sum(d => d.focusMin)),
        sessions: sum(d => d.sessions),
        flow_score_avg: Math.round(dayList.reduce((a, d) => a + scoreDay(d), 0) / dayList.length),
        tasks_done: sum(d => d.taskDone), tasks_total: sum(d => d.taskTotal),
        big3_rate_percent: mitT ? Math.round(mitD / mitT * 100) : null,
        focus_quality_avg: quals.length ? +(quals.reduce((a, b) => a + b, 0) / quals.length).toFixed(1) : null,
        unassigned_minutes: rangeMin[''] || 0,
        areas: perArea,
    };
}

export async function today() {
    const date = brDate();
    const [tasks, sessions, s, review] = await Promise.all([listTasks({ date }), listSessions({ date }), stats({ days: 1 }), getReview(date)]);
    const focusMin = sessions.filter(x => x.mode === 'focus').reduce((a, x) => a + x.duration_minutes, 0);
    return {
        date,
        flow_score: s.flow_score_avg,
        deep_work: fmtMinutes(focusMin), deep_work_minutes: focusMin,
        big3: tasks.filter(t => t.is_mit).map(t => ({ id: t.id, text: t.text, done: !!t.completed })),
        tasks: tasks.map(t => ({ id: t.id, text: t.text, done: !!t.completed, area: t.area, quadrant: quadrantOf(t), mit: !!t.is_mit, estimate: t.estimate })),
        areas: s.areas.map(a => ({ id: a.id, name: a.name, target: a.target, ...a.current_period })),
        shutdown: review || null,
    };
}
