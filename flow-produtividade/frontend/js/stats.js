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

    const chart = document.getElementById('focus-chart');
    if (!chart) return;
    chart.innerHTML = '';

    // Gerar últimos N dias (usando hora local)
    const dates = [];
    for (let i = days - 1; i >= 0; i--) {
        dates.push(localDateStr(i));
    }

    // Mapas por data
    const minutesByDate = {};
    const sessionsByDate = {};
    focusSessions.forEach(s => {
        minutesByDate[s.date] = (minutesByDate[s.date] || 0) + (s.total_minutes || 0);
        sessionsByDate[s.date] = (sessionsByDate[s.date] || 0) + (s.count || 0);
    });
    const tasksByDate = {};
    tasks.forEach(t => {
        tasksByDate[t.date] = (tasksByDate[t.date] || 0) + (t.done || 0);
    });

    // Máximos para normalizar cada série
    const maxHours = Math.max(...dates.map(d => (minutesByDate[d] || 0) / 60), 0.1);
    const maxSessions = Math.max(...dates.map(d => sessionsByDate[d] || 0), 1);
    const maxTasks = Math.max(...dates.map(d => tasksByDate[d] || 0), 1);

    // Container externo
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:column;gap:12px;';

    // Legenda
    const legend = document.createElement('div');
    legend.style.cssText = 'display:flex;gap:16px;font-size:0.75rem;color:#a0aec0;';
    legend.innerHTML = `
        <span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:2px;background:#63b3ed;display:inline-block;"></span>Horas</span>
        <span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:2px;background:#68d391;display:inline-block;"></span>Sessões</span>
        <span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:2px;background:#f6ad55;display:inline-block;"></span>Tarefas</span>
    `;
    wrapper.appendChild(legend);

    // Área do gráfico
    const chartArea = document.createElement('div');
    chartArea.style.cssText = 'display:flex;align-items:flex-end;gap:6px;height:140px;';

    dates.forEach(date => {
        const mins = minutesByDate[date] || 0;
        const hrs = mins / 60;
        const sess = sessionsByDate[date] || 0;
        const done = tasksByDate[date] || 0;

        const hH = Math.round((hrs / maxHours) * 100);
        const hS = Math.round((sess / maxSessions) * 100);
        const hT = Math.round((done / maxTasks) * 100);

        const hDisplay = mins >= 60
            ? `${Math.floor(hrs)}h${mins % 60 > 0 ? ` ${mins % 60}m` : ''}`
            : `${mins}m`;

        // Dia abreviado
        const [, mm, dd] = date.split('-');
        const label = `${dd}/${mm}`;

        const col = document.createElement('div');
        col.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;height:100%;justify-content:flex-end;';

        col.innerHTML = `
            <div style="width:100%;display:flex;gap:2px;align-items:flex-end;height:120px;position:relative;" class="bar-group" title="${date}: ${hDisplay} foco · ${sess} sessões · ${done} tarefas">
                <div style="flex:1;background:#63b3ed;border-radius:3px 3px 0 0;height:${hH}%;min-height:${mins>0?'3px':'0'};transition:height 0.5s;" title="${hDisplay} de foco"></div>
                <div style="flex:1;background:#68d391;border-radius:3px 3px 0 0;height:${hS}%;min-height:${sess>0?'3px':'0'};transition:height 0.5s;" title="${sess} sessão(ões)"></div>
                <div style="flex:1;background:#f6ad55;border-radius:3px 3px 0 0;height:${hT}%;min-height:${done>0?'3px':'0'};transition:height 0.5s;" title="${done} tarefa(s)"></div>
            </div>
            <span style="font-size:0.6rem;color:#a0aec0;white-space:nowrap;">${label}</span>
        `;
        chartArea.appendChild(col);
    });

    wrapper.appendChild(chartArea);
    chart.appendChild(wrapper);
}

document.addEventListener('DOMContentLoaded', () => {
    const select = document.getElementById('history-days');
    if (select) select.addEventListener('change', loadStats);
});

window.loadStats = loadStats;
