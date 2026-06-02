async function loadStats() {
    const API = window.FLOW_API_URL || 'https://flow-produtividade-api.raulriccoads.workers.dev';
    const days = parseInt(document.getElementById('history-days')?.value || '7');

    try {
        const res = await apiRequest(`${API}/stats?days=${days}`);
        if (!res || !res.ok) return;
        const { sessions, tasks } = await res.json();
        renderStats(sessions, tasks, days);
    } catch (e) {}
}

function localDateStr(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() - offsetDays);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

const METRICS = [
    { key: 'hours',    label: 'Horas',   color: '#63b3ed' },
    { key: 'sessions', label: 'Sessões', color: '#68d391' },
    { key: 'tasks',    label: 'Tarefas', color: '#f6ad55' },
];

let _chartData = null;
let _activeMetric = 'hours';

function renderStats(sessions, tasks, days) {
    // Totais
    const focusSessions = sessions.filter(s => s.mode === 'focus');
    const totalMinutes = focusSessions.reduce((sum, s) => sum + (s.total_minutes || 0), 0);
    const totalSessions = focusSessions.reduce((sum, s) => sum + (s.count || 0), 0);
    const totalTasksDone = tasks.reduce((sum, t) => sum + (t.done || 0), 0);

    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    document.getElementById('hist-focus').textContent = `${h}h ${m}m`;
    document.getElementById('hist-sessions').textContent = totalSessions;
    document.getElementById('hist-tasks').textContent = totalTasksDone;

    // Gerar últimos N dias (hora local)
    const dates = [];
    for (let i = days - 1; i >= 0; i--) dates.push(localDateStr(i));

    // Mapas por data
    const minutesByDate = {};
    const sessionsByDate = {};
    focusSessions.forEach(s => {
        minutesByDate[s.date] = (minutesByDate[s.date] || 0) + (s.total_minutes || 0);
        sessionsByDate[s.date] = (sessionsByDate[s.date] || 0) + (s.count || 0);
    });
    const tasksByDate = {};
    tasks.forEach(t => { tasksByDate[t.date] = (tasksByDate[t.date] || 0) + (t.done || 0); });

    // Série de valores por métrica
    _chartData = {
        dates,
        hours:    dates.map(d => parseFloat(((minutesByDate[d] || 0) / 60).toFixed(2))),
        sessions: dates.map(d => sessionsByDate[d] || 0),
        tasks:    dates.map(d => tasksByDate[d] || 0),
    };

    buildChartUI();
    drawLine(_activeMetric);
}

function buildChartUI() {
    const chart = document.getElementById('focus-chart');
    if (!chart) return;
    chart.innerHTML = '';

    // Toggle de métricas
    const toggle = document.createElement('div');
    toggle.style.cssText = 'display:flex;gap:8px;margin-bottom:16px;';
    METRICS.forEach(({ key, label, color }) => {
        const btn = document.createElement('button');
        btn.id = `metric-btn-${key}`;
        btn.textContent = label;
        btn.style.cssText = `
            padding:4px 14px;border-radius:20px;font-size:0.75rem;font-weight:600;
            border:2px solid ${color};cursor:pointer;transition:all 0.2s;
            background:${key === _activeMetric ? color : 'transparent'};
            color:${key === _activeMetric ? '#1a202c' : color};
        `;
        btn.addEventListener('click', () => {
            _activeMetric = key;
            METRICS.forEach(m => {
                const b = document.getElementById(`metric-btn-${m.key}`);
                if (!b) return;
                b.style.background = m.key === key ? m.color : 'transparent';
                b.style.color = m.key === key ? '#1a202c' : m.color;
            });
            drawLine(key);
        });
        toggle.appendChild(btn);
    });
    chart.appendChild(toggle);

    // Canvas do SVG
    const svgWrap = document.createElement('div');
    svgWrap.id = 'line-chart-wrap';
    svgWrap.style.cssText = 'width:100%;position:relative;';
    chart.appendChild(svgWrap);
}

function drawLine(metricKey) {
    const wrap = document.getElementById('line-chart-wrap');
    if (!wrap || !_chartData) return;
    wrap.innerHTML = '';

    const { dates, [metricKey]: values } = _chartData;
    const metric = METRICS.find(m => m.key === metricKey);
    const color = metric.color;

    const W = wrap.clientWidth || 600;
    const H = 180;
    const padL = 42, padR = 16, padT = 16, padB = 36;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;

    const maxVal = Math.max(...values, metricKey === 'hours' ? 0.5 : 1);
    const n = dates.length;

    const xOf = i => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const yOf = v => padT + innerH - (v / maxVal) * innerH;

    // Criar SVG
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', H);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.style.overflow = 'visible';

    // Grid horizontal (4 linhas)
    for (let i = 0; i <= 4; i++) {
        const y = padT + (i / 4) * innerH;
        const val = maxVal * (1 - i / 4);
        const label = metricKey === 'hours'
            ? (val >= 1 ? `${val.toFixed(1)}h` : `${Math.round(val * 60)}m`)
            : Math.round(val);

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', padL); line.setAttribute('x2', W - padR);
        line.setAttribute('y1', y);    line.setAttribute('y2', y);
        line.setAttribute('stroke', 'rgba(255,255,255,0.07)');
        line.setAttribute('stroke-width', '1');
        svg.appendChild(line);

        const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        txt.setAttribute('x', padL - 6); txt.setAttribute('y', y + 4);
        txt.setAttribute('text-anchor', 'end');
        txt.setAttribute('font-size', '10');
        txt.setAttribute('fill', '#718096');
        txt.textContent = label;
        svg.appendChild(txt);
    }

    // Área preenchida sob a linha
    if (values.some(v => v > 0)) {
        const areaPoints = [
            `${xOf(0)},${padT + innerH}`,
            ...values.map((v, i) => `${xOf(i)},${yOf(v)}`),
            `${xOf(n - 1)},${padT + innerH}`,
        ].join(' ');
        const area = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        area.setAttribute('points', areaPoints);
        area.setAttribute('fill', color);
        area.setAttribute('fill-opacity', '0.12');
        svg.appendChild(area);

        // Linha principal
        const pathD = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${xOf(i)},${yOf(v)}`).join(' ');
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathD);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', color);
        path.setAttribute('stroke-width', '2.5');
        path.setAttribute('stroke-linejoin', 'round');
        path.setAttribute('stroke-linecap', 'round');
        svg.appendChild(path);

        // Pontos e tooltips
        values.forEach((v, i) => {
            const cx = xOf(i);
            const cy = yOf(v);

            // Círculo hover (invisível, área clicável maior)
            const hitArea = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            hitArea.setAttribute('cx', cx); hitArea.setAttribute('cy', cy);
            hitArea.setAttribute('r', '12');
            hitArea.setAttribute('fill', 'transparent');

            // Ponto visível
            const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            dot.setAttribute('cx', cx); dot.setAttribute('cy', cy);
            dot.setAttribute('r', v > 0 ? '4' : '3');
            dot.setAttribute('fill', v > 0 ? color : '#4a5568');
            dot.setAttribute('stroke', '#1a202c');
            dot.setAttribute('stroke-width', '1.5');

            const [, mm, dd] = dates[i].split('-');
            const valLabel = metricKey === 'hours'
                ? (v >= 1 ? `${Math.floor(v)}h${Math.round((v % 1) * 60) > 0 ? ` ${Math.round((v % 1) * 60)}m` : ''}` : `${Math.round(v * 60)}m`)
                : v;
            const tip = document.createElementNS('http://www.w3.org/2000/svg', 'title');
            tip.textContent = `${dd}/${mm}: ${valLabel}`;
            dot.appendChild(tip);

            svg.appendChild(hitArea);
            svg.appendChild(dot);
        });
    }

    // Labels do eixo X (datas)
    const step = n <= 7 ? 1 : n <= 14 ? 2 : 5;
    dates.forEach((date, i) => {
        if (i % step !== 0 && i !== n - 1) return;
        const [, mm, dd] = date.split('-');
        const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        txt.setAttribute('x', xOf(i));
        txt.setAttribute('y', H - 8);
        txt.setAttribute('text-anchor', 'middle');
        txt.setAttribute('font-size', '10');
        txt.setAttribute('fill', '#718096');
        txt.textContent = `${dd}/${mm}`;
        svg.appendChild(txt);
    });

    wrap.appendChild(svg);
}

document.addEventListener('DOMContentLoaded', () => {
    const select = document.getElementById('history-days');
    if (select) select.addEventListener('change', loadStats);
});

window.loadStats = loadStats;
