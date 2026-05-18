let _goalsAPI, _goalsToken;

async function loadGoals() {
    const API = window.FLOW_API_URL || 'https://flow-produtividade-api.raulriccoads.workers.dev';
    try {
        const res = await apiRequest(`${API}/goals`);
        if (!res || !res.ok) return;
        const goals = await res.json();
        renderGoals(goals, API);
    } catch (e) {}
}

function renderGoals(goals, API) {
    const weeklyEl = document.getElementById('weekly-goals');
    const monthlyEl = document.getElementById('monthly-goals');
    const emptyWeekly = document.getElementById('empty-weekly');
    const emptyMonthly = document.getElementById('empty-monthly');

    weeklyEl.innerHTML = '';
    monthlyEl.innerHTML = '';

    const weekly = goals.filter(g => g.period === 'weekly');
    const monthly = goals.filter(g => g.period === 'monthly');

    emptyWeekly.style.display = weekly.length === 0 ? 'block' : 'none';
    emptyMonthly.style.display = monthly.length === 0 ? 'block' : 'none';

    [...weekly, ...monthly].forEach(goal => {
        const container = goal.period === 'weekly' ? weeklyEl : monthlyEl;
        const pct = Math.min(Math.round((goal.current_value / goal.target_value) * 100), 100);
        const card = document.createElement('div');
        card.className = 'goal-card mb-3';
        card.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <span class="font-medium text-sm">${escapeHtml(goal.title)}</span>
                <button class="text-gray-500 hover:text-red-500 text-xs ml-2" data-delete="${goal.id}">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
            <div class="flex justify-between text-xs text-gray-400 mb-1">
                <span>${goal.current_value} / ${goal.target_value}</span>
                <span>${pct}%</span>
            </div>
            <div class="progress-bar mb-2">
                <div class="progress-value" style="width: ${pct}%"></div>
            </div>
            <div class="flex items-center gap-2">
                <input type="number" class="goal-progress-input bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-xs w-20"
                    value="${goal.current_value}" min="0" max="${goal.target_value}" data-id="${goal.id}">
                <button class="goal-update-btn text-xs text-blue-400 hover:text-blue-300" data-id="${goal.id}">Atualizar</button>
            </div>
        `;
        container.appendChild(card);
    });

    // Delete handlers
    document.querySelectorAll('[data-delete]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.delete;
            const res = await apiRequest(`${API}/goals/${id}`, { method: 'DELETE' });
            if (res && res.ok) loadGoals();
        });
    });

    // Update handlers
    document.querySelectorAll('.goal-update-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            const input = document.querySelector(`.goal-progress-input[data-id="${id}"]`);
            const val = parseInt(input.value);
            if (isNaN(val)) return;
            const res = await apiRequest(`${API}/goals/${id}`, {
                method: 'PATCH',
                body: JSON.stringify({ current_value: val })
            });
            if (res && res.ok) loadGoals();
        });
    });
}

function escapeHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Modal de nova meta
document.addEventListener('DOMContentLoaded', () => {
    const API = window.FLOW_API_URL || 'https://flow-produtividade-api.raulriccoads.workers.dev';
    const modal = document.getElementById('goal-modal');
    const newGoalBtn = document.getElementById('new-goal-btn');
    const closeBtn = document.getElementById('close-goal-modal');
    const cancelBtn = document.getElementById('cancel-goal');
    const saveBtn = document.getElementById('save-goal');

    if (!modal) return;

    newGoalBtn.addEventListener('click', () => modal.classList.add('active'));
    closeBtn.addEventListener('click', () => modal.classList.remove('active'));
    cancelBtn.addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('active'); });

    saveBtn.addEventListener('click', async () => {
        const title = document.getElementById('goal-title').value.trim();
        const period = document.querySelector('input[name="goal-period"]:checked').value;
        const target = parseInt(document.getElementById('goal-target').value) || 100;
        if (!title) return;
        const res = await apiRequest(`${API}/goals`, {
            method: 'POST',
            body: JSON.stringify({ title, period, target_value: target })
        });
        if (res && res.ok) {
            modal.classList.remove('active');
            document.getElementById('goal-title').value = '';
            document.getElementById('goal-target').value = '100';
            loadGoals();
        }
    });
});

window.loadGoals = loadGoals;
