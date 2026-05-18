function initTasks(API, token) {
    const listEl = document.getElementById('tasks-list');
    const counterEl = document.getElementById('task-counter');
    const emptyEl = document.getElementById('empty-state');
    const input = document.getElementById('new-task-input');
    const prioritySelect = document.getElementById('task-priority');
    const addBtn = document.getElementById('add-task-btn');

    let tasks = [];
    const today = new Date().toISOString().slice(0, 10);

    async function loadTasks() {
        try {
            const res = await apiRequest(`${API}/tasks?date=${today}`);
            if (!res || !res.ok) return;
            tasks = await res.json();
            render();
        } catch (e) {}
    }

    function updateCounter() {
        const done = tasks.filter(t => t.completed).length;
        counterEl.textContent = `${done}/${tasks.length} tarefas`;
        emptyEl.style.display = tasks.length === 0 ? 'block' : 'none';
        const pct = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
        const completionEl = document.getElementById('stat-completion');
        if (completionEl) completionEl.textContent = `${pct}%`;
    }

    function render() {
        listEl.innerHTML = '';
        tasks.forEach(task => {
            const el = document.createElement('div');
            el.className = `task-item p-3 mb-2 rounded-lg flex items-center justify-between ${task.completed ? 'completed bg-gray-700 bg-opacity-40' : 'bg-gray-700'} priority-${task.priority || 'low'}`;

            const left = document.createElement('div');
            left.className = 'flex items-center flex-1 min-w-0';

            const check = document.createElement('div');
            check.className = `w-5 h-5 rounded-full border flex-shrink-0 ${task.completed ? 'bg-blue-500 border-blue-500' : 'border-gray-500'} mr-3 flex items-center justify-center cursor-pointer`;
            if (task.completed) check.innerHTML = '<i class="fas fa-check text-xs text-white"></i>';
            check.addEventListener('click', () => toggleComplete(task.id, task.completed));

            const textEl = document.createElement('span');
            textEl.className = `task-text truncate ${task.completed ? 'text-gray-400' : 'text-white'}`;
            textEl.textContent = task.text;

            const badge = document.createElement('span');
            const badgeColors = { high: 'bg-red-900 text-red-300', medium: 'bg-yellow-900 text-yellow-300', low: 'bg-blue-900 text-blue-300' };
            const badgeLabels = { high: 'Alta', medium: 'Média', low: 'Baixa' };
            badge.className = `text-xs px-2 py-0.5 rounded ml-2 flex-shrink-0 ${badgeColors[task.priority] || badgeColors.low}`;
            badge.textContent = badgeLabels[task.priority] || 'Baixa';

            left.appendChild(check);
            left.appendChild(textEl);
            left.appendChild(badge);

            const delBtn = document.createElement('button');
            delBtn.className = 'text-gray-500 hover:text-red-500 transition-all ml-3 flex-shrink-0';
            delBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
            delBtn.addEventListener('click', () => deleteTask(task.id));

            el.appendChild(left);
            el.appendChild(delBtn);
            listEl.appendChild(el);
        });
        updateCounter();
    }

    async function addTask() {
        const text = input.value.trim();
        if (!text) return;
        const priority = prioritySelect.value;
        input.value = '';
        try {
            const res = await apiRequest(`${API}/tasks`, {
                method: 'POST',
                body: JSON.stringify({ text, priority, date: today })
            });
            if (!res || !res.ok) return;
            const task = await res.json();
            tasks.push(task);
            render();
        } catch (e) {}
    }

    async function toggleComplete(id, currentCompleted) {
        try {
            const res = await apiRequest(`${API}/tasks/${id}`, {
                method: 'PATCH',
                body: JSON.stringify({ completed: !currentCompleted })
            });
            if (!res || !res.ok) return;
            const updated = await res.json();
            const idx = tasks.findIndex(t => t.id === id);
            if (idx !== -1) tasks[idx] = updated;
            render();
        } catch (e) {}
    }

    async function deleteTask(id) {
        try {
            const res = await apiRequest(`${API}/tasks/${id}`, { method: 'DELETE' });
            if (!res || !res.ok) return;
            tasks = tasks.filter(t => t.id !== id);
            render();
        } catch (e) {}
    }

    addBtn.addEventListener('click', addTask);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') addTask(); });

    loadTasks();

    // Expõe reload para uso externo (ex: Novo Dia)
    window._reloadTasks = loadTasks;
}

window.initTasks = initTasks;
