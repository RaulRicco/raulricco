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

    // Gráfico de barras: minutos de foco por dia
    const chart = document.getElementById('focus-chart');
    if (!chart) return;
    chart.innerHTML = '';

    // Construir mapa de data -> minutos
    const dateMap = {};
    focusSessions.forEach(s => {
        dateMap[s.date] = (dateMap[s.date] || 0) + (s.total_minutes || 0);
    });

    // Gerar últimos N dias
    const dates = [];
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().slice(0, 10));
    }

    const maxMinutes = Math.max(...dates.map(d => dateMap[d] || 0), 1);

    dates.forEach(date => {
        const mins = dateMap[date] || 0;
        const heightPct = (mins / maxMinutes) * 100;
        const label = date.slice(5); // MM-DD

        const col = document.createElement('div');
        col.className = 'bar-col';
        col.innerHTML = `
            <div class="bar" style="height: ${heightPct}%" title="${mins} min"></div>
            <span class="bar-label">${label}</span>
        `;
        chart.appendChild(col);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const select = document.getElementById('history-days');
    if (select) select.addEventListener('change', loadStats);
});

window.loadStats = loadStats;
