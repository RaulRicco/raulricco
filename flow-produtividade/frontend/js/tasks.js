function initTasks(API, token) {
    const listEl = document.getElementById('tasks-list');
    const counterEl = document.getElementById('task-counter');
    const emptyEl = document.getElementById('empty-state');
    const input = document.getElementById('new-task-input');
    const prioritySelect = document.getElementById('task-priority');
    const addBtn = document.getElementById('add-task-btn');

    let tasks = [];
    let dragSrcId = null;
    const today = brDate();

    let migrated = false;

    async function migratePending() {
        if (migrated) return;
        migrated = true;
        // Verifica os últimos 7 dias e migra tarefas pendentes para hoje
        for (let i = 1; i <= 7; i++) {
            const date = brDate(i);
            try {
                const res = await apiRequest(`${API}/tasks?date=${date}`);
                if (!res || !res.ok) continue;
                const old = await res.json();
                const pending = old.filter(t => !t.completed);
                for (const task of pending) {
                    await apiRequest(`${API}/tasks`, {
                        method: 'POST',
                        body: JSON.stringify({ text: task.text, priority: task.priority, date: today })
                    });
                    await apiRequest(`${API}/tasks/${task.id}`, { method: 'DELETE' });
                }
            } catch (e) {}
        }
    }

    async function loadTasks() {
        try {
            await migratePending();
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
            el.dataset.id = task.id;
            el.draggable = true;

            // Drag handle
            const handle = document.createElement('div');
            handle.className = 'drag-handle text-gray-600 hover:text-gray-400 cursor-grab mr-2 flex-shrink-0 px-1';
            handle.innerHTML = '<i class="fas fa-grip-vertical text-xs"></i>';

            // Checkbox
            const check = document.createElement('div');
            check.className = `w-5 h-5 rounded-full border flex-shrink-0 ${task.completed ? 'bg-blue-500 border-blue-500' : 'border-gray-500'} mr-3 flex items-center justify-center cursor-pointer`;
            if (task.completed) check.innerHTML = '<i class="fas fa-check text-xs text-white"></i>';
            check.addEventListener('click', () => toggleComplete(task.id, task.completed));

            // Texto (clique para editar)
            const textEl = document.createElement('span');
            textEl.className = `task-text flex-1 min-w-0 truncate ${task.completed ? 'text-gray-400' : 'text-white'} cursor-pointer`;
            textEl.title = 'Clique para editar';
            textEl.textContent = task.text;
            textEl.addEventListener('click', () => startEdit(task, textEl, badge));

            // Badge de prioridade
            const badge = document.createElement('span');
            const badgeColors = { high: 'bg-red-900 text-red-300', medium: 'bg-yellow-900 text-yellow-300', low: 'bg-blue-900 text-blue-300' };
            const badgeLabels = { high: 'Alta', medium: 'Média', low: 'Baixa' };
            badge.className = `text-xs px-2 py-0.5 rounded ml-2 flex-shrink-0 cursor-pointer ${badgeColors[task.priority] || badgeColors.low}`;
            badge.textContent = badgeLabels[task.priority] || 'Baixa';
            badge.title = 'Clique para alterar prioridade';
            badge.addEventListener('click', () => cyclePriority(task));

            // Botão deletar
            const delBtn = document.createElement('button');
            delBtn.className = 'text-gray-500 hover:text-red-500 transition-all ml-2 flex-shrink-0';
            delBtn.innerHTML = '<i class="fas fa-trash-alt text-xs"></i>';
            delBtn.addEventListener('click', () => deleteTask(task.id));

            el.appendChild(handle);
            el.appendChild(check);
            el.appendChild(textEl);
            el.appendChild(badge);
            el.appendChild(delBtn);

            // Drag events
            el.addEventListener('dragstart', onDragStart);
            el.addEventListener('dragover', onDragOver);
            el.addEventListener('dragleave', onDragLeave);
            el.addEventListener('drop', onDrop);
            el.addEventListener('dragend', onDragEnd);

            listEl.appendChild(el);
        });
        updateCounter();
    }

    // Edição inline do texto
    function startEdit(task, textEl, badge) {
        if (task.completed) return;
        const original = task.text;

        const wrapper = document.createElement('div');
        wrapper.className = 'flex items-center gap-2 flex-1 min-w-0';

        const editInput = document.createElement('input');
        editInput.type = 'text';
        editInput.value = original;
        editInput.className = 'flex-1 bg-gray-600 border border-blue-400 rounded px-2 py-0.5 text-white text-sm focus:outline-none';

        const saveBtn = document.createElement('button');
        saveBtn.className = 'text-blue-400 hover:text-blue-300 text-xs flex-shrink-0';
        saveBtn.innerHTML = '<i class="fas fa-check"></i>';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'text-gray-500 hover:text-gray-300 text-xs flex-shrink-0';
        cancelBtn.innerHTML = '<i class="fas fa-times"></i>';

        wrapper.appendChild(editInput);
        wrapper.appendChild(saveBtn);
        wrapper.appendChild(cancelBtn);

        textEl.replaceWith(wrapper);
        badge.style.display = 'none';
        editInput.focus();
        editInput.select();

        async function save() {
            const newText = editInput.value.trim();
            if (!newText || newText === original) { cancel(); return; }
            await updateTaskField(task.id, { text: newText });
        }

        function cancel() {
            wrapper.replaceWith(textEl);
            badge.style.display = '';
        }

        saveBtn.addEventListener('click', save);
        cancelBtn.addEventListener('click', cancel);
        editInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') cancel();
        });
    }

    // Ciclar prioridade ao clicar no badge
    async function cyclePriority(task) {
        const order = ['low', 'medium', 'high'];
        const next = order[(order.indexOf(task.priority) + 1) % order.length];
        await updateTaskField(task.id, { priority: next });
    }

    async function updateTaskField(id, fields) {
        try {
            const res = await apiRequest(`${API}/tasks/${id}`, {
                method: 'PATCH',
                body: JSON.stringify(fields)
            });
            if (!res || !res.ok) return;
            const updated = await res.json();
            const idx = tasks.findIndex(t => t.id === id);
            if (idx !== -1) tasks[idx] = updated;
            render();
        } catch (e) {}
    }

    // Drag and drop
    function onDragStart(e) {
        dragSrcId = e.currentTarget.dataset.id;
        e.currentTarget.style.opacity = '0.4';
        e.dataTransfer.effectAllowed = 'move';
    }

    function onDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        e.currentTarget.classList.add('ring-2', 'ring-blue-400');
    }

    function onDragLeave(e) {
        e.currentTarget.classList.remove('ring-2', 'ring-blue-400');
    }

    async function onDrop(e) {
        e.preventDefault();
        e.currentTarget.classList.remove('ring-2', 'ring-blue-400');
        const dropId = e.currentTarget.dataset.id;
        if (!dragSrcId || dragSrcId === dropId) return;

        const srcIdx = tasks.findIndex(t => t.id === dragSrcId);
        const dstIdx = tasks.findIndex(t => t.id === dropId);
        if (srcIdx === -1 || dstIdx === -1) return;

        // Reordena localmente
        const [moved] = tasks.splice(srcIdx, 1);
        tasks.splice(dstIdx, 0, moved);
        render();

        // Persiste nova ordem no backend
        await persistOrder();
    }

    function onDragEnd(e) {
        e.currentTarget.style.opacity = '';
        listEl.querySelectorAll('.task-item').forEach(el => {
            el.classList.remove('ring-2', 'ring-blue-400');
        });
        dragSrcId = null;
    }

    async function persistOrder() {
        try {
            await Promise.all(tasks.map((task, idx) =>
                apiRequest(`${API}/tasks/${task.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ sort_order: idx })
                })
            ));
        } catch (e) {}
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

    window._reloadTasks = loadTasks;
}

window.initTasks = initTasks;
