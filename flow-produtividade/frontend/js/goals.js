// Metas — cascata trimestral → mensal → semanal, por área, com indicador de ritmo
const PERIODS = { quarterly: 'Trimestrais', monthly: 'Mensais', weekly: 'Semanais' };

function goalPace(goal) {
    const pct = goal.target_value > 0 ? Math.min(goal.current_value / goal.target_value, 1) : 0;
    const start = new Date(goal.start_date + 'T00:00:00');
    const end = new Date(goal.end_date + 'T23:59:59');
    const now = new Date(brDate() + 'T12:00:00');
    const elapsed = Math.min(Math.max((now - start) / (end - start), 0), 1);
    const expired = now > end;
    let status;
    if (pct >= 1) status = { key: 'done', label: 'Concluída', icon: 'fa-check-circle' };
    else if (expired) status = { key: 'late', label: 'Encerrada', icon: 'fa-flag' };
    else if (pct + 0.1 >= elapsed) status = { key: 'ok', label: 'No ritmo', icon: 'fa-circle-check' };
    else status = { key: 'late', label: 'Atrasada', icon: 'fa-triangle-exclamation' };
    return { pct, elapsed, status, expired };
}

async function fetchGoals() {
    try {
        const res = await apiRequest(`${FLOW_API}/goals`);
        if (!res || !res.ok) return [];
        return await res.json();
    } catch (e) { return []; }
}

async function loadGoals() {
    renderGoals(await fetchGoals());
}

function goalCard(goal) {
    const { pct, elapsed, status } = goalPace(goal);
    const area = areaInfo(goal.area);
    return `
    <div class="goal-card">
        <div class="goal-top">
            <span class="goal-title">${escapeHtml(goal.title)}</span>
            <button class="icon-btn del" data-delete="${goal.id}" title="Excluir meta"><i class="fas fa-trash-alt"></i></button>
        </div>
        <div class="goal-tags">
            <span class="chip"><i class="fas ${area.icon}" style="color:${area.color}"></i>${area.label}</span>
            <span class="status status-${status.key}"><i class="fas ${status.icon}"></i>${status.label}</span>
            <span class="muted small">até ${fmtDateShort(goal.end_date)}</span>
        </div>
        <div class="goal-bar" title="Marcador = onde você deveria estar hoje">
            <div class="goal-fill" style="width:${pct * 100}%"></div>
            <div class="goal-marker" style="left:${elapsed * 100}%"></div>
        </div>
        <div class="goal-foot">
            <span class="muted small">${goal.current_value} / ${goal.target_value} · ${Math.round(pct * 100)}%</span>
            <span class="goal-edit">
                <button class="icon-btn" data-step="-1" data-id="${goal.id}" title="−1"><i class="fas fa-minus"></i></button>
                <input type="number" class="input goal-progress-input" value="${goal.current_value}" min="0" data-id="${goal.id}">
                <button class="icon-btn" data-step="1" data-id="${goal.id}" title="+1"><i class="fas fa-plus"></i></button>
            </span>
        </div>
    </div>`;
}

function renderGoals(goals) {
    const wrap = document.getElementById('goals-columns');
    if (!wrap) return;
    const areaFilter = document.getElementById('goal-area-filter')?.value || 'all';
    const list = goals.filter(g => areaFilter === 'all' || (g.area || '') === areaFilter);
    wrap.innerHTML = Object.entries(PERIODS).map(([period, label]) => {
        const items = list.filter(g => g.period === period);
        return `<div class="card">
            <div class="card-head"><h3>${label}</h3><span class="muted small">${items.length}</span></div>
            ${items.map(goalCard).join('') || `<p class="empty">Nenhuma meta ${label.toLowerCase().slice(0, -1)}.</p>`}
        </div>`;
    }).join('');

    wrap.querySelectorAll('[data-delete]').forEach(btn => btn.addEventListener('click', async () => {
        if (!confirm('Excluir esta meta?')) return;
        const res = await apiRequest(`${FLOW_API}/goals/${btn.dataset.delete}`, { method: 'DELETE' });
        if (res && res.ok) loadGoals();
    }));
    const save = async (id, val) => {
        if (isNaN(val) || val < 0) return;
        const res = await apiRequest(`${FLOW_API}/goals/${id}`, { method: 'PATCH', body: JSON.stringify({ current_value: val }) });
        if (res && res.ok) loadGoals();
    };
    wrap.querySelectorAll('[data-step]').forEach(btn => btn.addEventListener('click', () => {
        const input = wrap.querySelector(`.goal-progress-input[data-id="${btn.dataset.id}"]`);
        save(btn.dataset.id, Math.max(0, parseInt(input.value || 0) + parseInt(btn.dataset.step)));
    }));
    wrap.querySelectorAll('.goal-progress-input').forEach(input => input.addEventListener('change', () => save(input.dataset.id, parseInt(input.value))));
}

document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('goal-modal');
    if (!modal) return;
    const close = () => modal.classList.remove('active');
    document.getElementById('new-goal-btn').addEventListener('click', () => modal.classList.add('active'));
    document.getElementById('close-goal-modal').addEventListener('click', close);
    document.getElementById('cancel-goal').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });

    const filter = document.getElementById('goal-area-filter');
    document.addEventListener('flow:areas-changed', () => {
        const cur = filter.value || 'all';
        filter.innerHTML = '<option value="all">Todas as áreas</option>' + areaOptions(cur);
        filter.value = [...filter.options].some(o => o.value === cur) ? cur : 'all';
        document.getElementById('goal-area').innerHTML = areaOptions('work');
    });
    filter.addEventListener('change', loadGoals);

    document.getElementById('save-goal').addEventListener('click', async () => {
        const title = document.getElementById('goal-title').value.trim();
        const period = document.querySelector('input[name="goal-period"]:checked').value;
        const area = document.getElementById('goal-area').value;
        const target = parseInt(document.getElementById('goal-target').value) || 100;
        if (!title) { document.getElementById('goal-title').focus(); return; }
        const res = await apiRequest(`${FLOW_API}/goals`, {
            method: 'POST', body: JSON.stringify({ title, period, area, target_value: target })
        });
        if (res && res.ok) {
            close();
            document.getElementById('goal-title').value = '';
            document.getElementById('goal-target').value = '100';
            loadGoals();
        }
    });
});

window.loadGoals = loadGoals;
window.fetchGoals = fetchGoals;
window.goalPace = goalPace;
