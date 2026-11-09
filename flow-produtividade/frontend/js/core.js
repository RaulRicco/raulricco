// Núcleo do Flow System — configurações, quadrantes, Flow Score e utilitários compartilhados
const FLOW_API = window.FLOW_API_URL || 'https://flow-produtividade-api.raulriccoads.workers.dev';

const DEFAULT_SETTINGS = { focusTime: 25, shortBreak: 5, longBreak: 15, sessionsCount: 8, dailyDeepHours: 3 };

function getSettings() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem('flow_timer_settings') || 'null'); } catch (e) {}
    return { ...DEFAULT_SETTINGS, ...(s || {}) };
}

function saveSettings(s) {
    try { localStorage.setItem('flow_timer_settings', JSON.stringify(s)); } catch (e) {}
}

// Matriz de Eisenhower
const QUADRANTS = {
    q1: { key: 'q1', label: 'Fazer agora',  hint: 'Urgente e importante',     important: 1, urgent: 1, color: '#e66767' },
    q2: { key: 'q2', label: 'Agendar',      hint: 'Importante, não urgente',  important: 1, urgent: 0, color: '#3987e5' },
    q3: { key: 'q3', label: 'Delegar',      hint: 'Urgente, não importante',  important: 0, urgent: 1, color: '#c98500' },
    q4: { key: 'q4', label: 'Eliminar',     hint: 'Nem urgente, nem importante', important: 0, urgent: 0, color: '#8b8a84' },
};

function quadrantOf(t) {
    const imp = t.important === undefined || t.important === null ? 1 : +t.important;
    const urg = +t.urgent || 0;
    if (imp && urg) return 'q1';
    if (imp) return 'q2';
    if (urg) return 'q3';
    return 'q4';
}

// Áreas da vida — carregadas da API (o usuário cria as suas, com meta de foco)
const AREA_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
const AREA_ICONS = ['fa-briefcase', 'fa-heart', 'fa-dumbbell', 'fa-book', 'fa-users', 'fa-chart-line', 'fa-bullhorn', 'fa-code',
    'fa-pen-nib', 'fa-graduation-cap', 'fa-house', 'fa-sack-dollar', 'fa-palette', 'fa-music', 'fa-spa', 'fa-church', 'fa-baby', 'fa-plane'];
const PERIOD_LABEL = { daily: 'dia', weekly: 'semana', monthly: 'mês' };
const NO_AREA = { id: '', name: 'Sem área', label: 'Sem área', color: '#6b6a64', icon: 'fa-circle-question', target_minutes: 0, target_period: 'weekly' };

const FlowAreas = {
    list: [],
    active() { return this.list.filter(a => !a.archived); },
    get(id) {
        const a = this.list.find(x => x.id === id);
        return a ? { ...a, label: a.name } : NO_AREA;
    },
    async load() {
        try {
            const res = await apiRequest(`${FLOW_API}/areas`);
            if (res && res.ok) this.list = await res.json();
        } catch (e) {}
        document.dispatchEvent(new CustomEvent('flow:areas-changed', { detail: this.list }));
        return this.list;
    },
    set(list) { if (Array.isArray(list) && list.length) this.list = list; },
};
const areaInfo = id => FlowAreas.get(id);

function areaOptions(selected, { includeNone = false } = {}) {
    return (includeNone ? `<option value="">— Sem área —</option>` : '') +
        FlowAreas.active().map(a => `<option value="${escapeHtml(a.id)}" ${a.id === selected ? 'selected' : ''}>${escapeHtml(a.name)}</option>`).join('');
}

// Datas (fuso BR) do período atual: dia, semana (seg–dom) ou mês
function periodDates(period, offset = 0) {
    const today = brDate();
    if (period === 'daily') return [brDate(offset)];
    if (period === 'weekly') {
        const sinceMonday = (weekdayOf(today) + 6) % 7 + offset * 7;
        const out = [];
        for (let i = 0; i < 7; i++) out.push(brDate(sinceMonday - i));
        return out;
    }
    const [y, m] = today.split('-').map(Number);
    const first = new Date(y, m - 1 - offset, 1);
    const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const out = [];
    for (let d = 1; d <= days; d++) out.push(`${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    return out;
}

// Área efetiva de uma sessão: a da sessão, senão a da tarefa vinculada
function sessionArea(s, taskById) {
    if (s.area) return s.area;
    const t = s.task_id && taskById ? taskById[s.task_id] : null;
    return t ? (t.area || '') : '';
}

// Minutos de foco por área em um conjunto de datas
function minutesByArea(raw, dates) {
    const set = new Set(dates);
    const taskById = Object.fromEntries((raw.tasks || []).map(t => [t.id, t]));
    const out = {};
    (raw.sessions || []).forEach(s => {
        if (s.mode !== 'focus' || !set.has(s.date)) return;
        const a = sessionArea(s, taskById);
        out[a] = (out[a] || 0) + (s.duration_minutes || 0);
    });
    return out;
}

// Hora (fuso BR) em que a sessão começou — created_at é gravado ao concluir, em UTC
function sessionStartHourBR(s) {
    if (!s.created_at) return null;
    const end = new Date(s.created_at.replace(' ', 'T') + (s.created_at.endsWith('Z') ? '' : 'Z'));
    if (isNaN(end)) return null;
    const start = new Date(end.getTime() - (s.duration_minutes || 0) * 60000);
    return parseInt(start.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }), 10) % 24;
}

function fmtMinutes(min) {
    min = Math.round(min || 0);
    const h = Math.floor(min / 60), m = min % 60;
    if (h === 0) return `${m}m`;
    return m ? `${h}h ${m}m` : `${h}h`;
}

function weekdayOf(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).getDay();
}

function fmtDateShort(dateStr) {
    const [, m, d] = dateStr.split('-');
    return `${d}/${m}`;
}

/**
 * Flow Score diário (0–100)
 *  40 pts — Deep work: minutos de foco / meta diária
 *  30 pts — Big 3: MITs concluídas / MITs definidas (0 se não planejou)
 *  20 pts — Execução: tarefas concluídas / tarefas do dia
 *  10 pts — Qualidade média do foco (1–5); sessão sem nota conta como 3
 */
function dayScore({ focusMin, mitTotal, mitDone, taskTotal, taskDone, qualities, sessions }, settings) {
    const target = (settings.dailyDeepHours || 3) * 60;
    const deep = Math.min(focusMin / target, 1) * 40;
    const mit = mitTotal > 0 ? (mitDone / mitTotal) * 30 : 0;
    const exec = taskTotal > 0 ? (taskDone / taskTotal) * 20 : 0;
    let qual = 0;
    if (sessions > 0) {
        const rated = qualities.filter(q => q);
        const avg = (rated.reduce((a, b) => a + b, 0) + (sessions - rated.length) * 3) / sessions;
        qual = (avg / 5) * 10;
    }
    return Math.round(deep + mit + exec + qual);
}

// Agrega dados brutos por dia
function buildDays(raw, dates, areaFilter = 'all') {
    const byDate = {};
    dates.forEach(d => byDate[d] = {
        date: d, focusMin: 0, byArea: {}, sessions: 0, qualities: [],
        taskTotal: 0, taskDone: 0, mitTotal: 0, mitDone: 0, review: null,
    });
    const taskById = {};
    raw.tasks.forEach(t => taskById[t.id] = t);

    raw.sessions.forEach(s => {
        if (s.mode !== 'focus') return;
        const day = byDate[s.date];
        if (!day) return;
        const area = sessionArea(s, taskById);
        if (areaFilter !== 'all' && area !== areaFilter) return;
        day.focusMin += s.duration_minutes || 0;
        day.sessions += 1;
        day.qualities.push(s.focus_quality || null);
        day.byArea[area] = (day.byArea[area] || 0) + (s.duration_minutes || 0);
    });

    raw.tasks.forEach(t => {
        const day = byDate[t.date];
        if (!day) return;
        if (areaFilter !== 'all' && (t.area || '') !== areaFilter) return;
        day.taskTotal++;
        if (t.completed) day.taskDone++;
        if (t.is_mit) { day.mitTotal++; if (t.completed) day.mitDone++; }
    });

    (raw.reviews || []).forEach(r => { if (byDate[r.date]) byDate[r.date].review = r; });

    const settings = getSettings();
    return dates.map(d => ({ ...byDate[d], score: dayScore(byDate[d], settings) }));
}

function lastNDates(n, offset = 0) {
    const out = [];
    for (let i = n - 1 + offset; i >= offset; i--) out.push(brDate(i));
    return out;
}

function escapeHtml(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function toast(msg) {
    let el = document.getElementById('flow-toast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'flow-toast';
        el.className = 'toast';
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 2600);
}

Object.assign(window, {
    FLOW_API, getSettings, saveSettings, QUADRANTS, quadrantOf, FlowAreas, areaInfo, areaOptions, AREA_COLORS, AREA_ICONS,
    PERIOD_LABEL, periodDates, sessionArea, minutesByArea, sessionStartHourBR,
    fmtMinutes, weekdayOf, fmtDateShort, dayScore, buildDays, lastNDates, escapeHtml, toast,
});
