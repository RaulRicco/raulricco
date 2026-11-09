// Tarefas — captura (GTD), priorização (Eisenhower), Big 3 (MIT) e áreas da vida
function initTasks(API) {
    const listEl = document.getElementById('tasks-list');
    const mitEl = document.getElementById('mit-list');
    const matrixEl = document.getElementById('tasks-matrix');
    const counterEl = document.getElementById('task-counter');
    const emptyEl = document.getElementById('empty-state');
    const input = document.getElementById('new-task-input');
    const quadrantSelect = document.getElementById('task-quadrant');
    const estimateInput = document.getElementById('task-estimate');
    const mitToggle = document.getElementById('task-mit');
    const addBtn = document.getElementById('add-task-btn');

    let tasks = [];
    let pomodoroCount = {};   // task_id -> sessões de foco concluídas
    let dragSrcId = null;
    let view = localStorageGet('flow_task_view') || 'list';
    let newMit = false;
    const today = brDate();

    function localStorageGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function localStorageSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

    // Tarefas pendentes de dias anteriores são movidas para hoje (preserva id, sessões e campos)
    async function migratePending() {
        const flag = 'flow_migrated_' + today;
        if (localStorageGet(flag)) return;
        for (let i = 1; i <= 7; i++) {
            try {
                const res = await apiRequest(`${API}/tasks?date=${brDate(i)}`);
                if (!res || !res.ok) continue;
                const pending = (await res.json()).filter(t => !t.completed);
                await Promise.all(pending.map(t => apiRequest(`${API}/tasks/${t.id}`, {
                    method: 'PATCH', body: JSON.stringify({ date: today, is_mit: false })
                })));
            } catch (e) {}
        }
        localStorageSet(flag, '1');
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

    function emit() {
        document.dispatchEvent(new CustomEvent('flow:tasks-changed', { detail: tasks }));
    }

    function updateCounter() {
        const done = tasks.filter(t => t.completed).length;
        counterEl.textContent = `${done}/${tasks.length} concluídas`;
        emptyEl.style.display = tasks.length === 0 ? 'block' : 'none';
        const mits = tasks.filter(t => t.is_mit);
        document.getElementById('mit-counter').textContent = `${mits.filter(t => t.completed).length}/${mits.length || 3}`;
        document.getElementById('mit-empty').style.display = mits.length === 0 ? 'block' : 'none';
    }

    function taskRow(task, { compact = false } = {}) {
        const q = quadrantOf(task);
        const area = areaInfo(task.area);
        const el = document.createElement('div');
        el.className = `task-item ${task.completed ? 'completed' : ''}`;
        el.style.setProperty('--q-color', QUADRANTS[q].color);
        el.dataset.id = task.id;
        el.draggable = !compact;

        const done = pomodoroCount[task.id] || 0;
        const est = task.estimate || 1;
        el.innerHTML = `
            ${compact ? '' : '<span class="drag-handle" title="Arraste para reordenar"><i class="fas fa-grip-vertical"></i></span>'}
            <button class="task-check" aria-label="Concluir">${task.completed ? '<i class="fas fa-check"></i>' : ''}</button>
            <span class="task-text" title="Clique para editar">${escapeHtml(task.text)}</span>
            <span class="task-meta">
                ${compact ? '' : `<button class="chip chip-q" title="${QUADRANTS[q].hint} — clique para mudar">${QUADRANTS[q].label}</button>`}
                <label class="chip chip-area" title="Área"><i class="fas ${area.icon}" style="color:${area.color}"></i><select class="chip-select" aria-label="Área">${areaOptions(task.area, { includeNone: !task.area })}</select></label>
                <span class="chip chip-pomo ${done > est ? 'over' : ''}" title="Pomodoros feitos / estimados">🍅 ${done}/${est}</span>
                <button class="icon-btn star ${task.is_mit ? 'on' : ''}" title="${task.is_mit ? 'Remover do Big 3' : 'Marcar como Big 3'}"><i class="fas fa-star"></i></button>
                ${task.completed ? '' : '<button class="icon-btn focus-btn" title="Focar nesta tarefa"><i class="fas fa-crosshairs"></i></button>'}
                ${compact ? '' : '<button class="icon-btn del" title="Excluir"><i class="fas fa-trash-alt"></i></button>'}
            </span>`;

        el.querySelector('.task-check').addEventListener('click', () => updateTask(task.id, { completed: !task.completed }));
        el.querySelector('.task-text').addEventListener('click', e => startEdit(task, e.currentTarget));
        el.querySelector('.chip-select').addEventListener('change', e => updateTask(task.id, { area: e.target.value }));
        el.querySelector('.star').addEventListener('click', () => toggleMit(task));
        const qBtn = el.querySelector('.chip-q');
        if (qBtn) qBtn.addEventListener('click', () => {
            const order = ['q1', 'q2', 'q3', 'q4'];
            const next = QUADRANTS[order[(order.indexOf(q) + 1) % 4]];
            updateTask(task.id, { important: next.important, urgent: next.urgent, priority: next.key === 'q1' ? 'high' : next.key === 'q2' ? 'medium' : 'low' });
        });
        const fBtn = el.querySelector('.focus-btn');
        if (fBtn) fBtn.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('flow:focus-task', { detail: task.id }));
            document.getElementById('timer-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        const dBtn = el.querySelector('.del');
        if (dBtn) dBtn.addEventListener('click', () => deleteTask(task.id));

        if (!compact) {
            el.addEventListener('dragstart', onDragStart);
            el.addEventListener('dragover', onDragOver);
            el.addEventListener('dragleave', onDragLeave);
            el.addEventListener('drop', onDrop);
            el.addEventListener('dragend', onDragEnd);
        }
        return el;
    }

    function render() {
        // Big 3
        mitEl.innerHTML = '';
        tasks.filter(t => t.is_mit).forEach(t => mitEl.appendChild(taskRow(t, { compact: true })));

        // Lista ou matriz
        listEl.innerHTML = '';
        matrixEl.innerHTML = '';
        listEl.style.display = view === 'list' ? '' : 'none';
        matrixEl.style.display = view === 'matrix' ? '' : 'none';
        document.querySelectorAll('[data-task-view]').forEach(b => b.classList.toggle('active', b.dataset.taskView === view));

        if (view === 'list') {
            // pendentes primeiro, concluídas no fim
            [...tasks.filter(t => !t.completed), ...tasks.filter(t => t.completed)].forEach(t => listEl.appendChild(taskRow(t)));
        } else {
            Object.values(QUADRANTS).forEach(Q => {
                const box = document.createElement('div');
                box.className = 'matrix-cell';
                box.style.setProperty('--q-color', Q.color);
                const items = tasks.filter(t => quadrantOf(t) === Q.key);
                box.innerHTML = `<div class="matrix-head"><span><b>${Q.label}</b> <small>${Q.hint}</small></span><span class="muted">${items.length}</span></div>`;
                box.addEventListener('dragover', e => { e.preventDefault(); box.classList.add('drop'); });
                box.addEventListener('dragleave', () => box.classList.remove('drop'));
                box.addEventListener('drop', e => {
                    e.preventDefault(); box.classList.remove('drop');
                    if (dragSrcId) updateTask(dragSrcId, { important: Q.important, urgent: Q.urgent });
                });
                items.forEach(t => {
                    const row = taskRow(t);
                    row.removeEventListener('drop', onDrop);
                    box.appendChild(row);
                });
                matrixEl.appendChild(box);
            });
        }
        updateCounter();
        emit();
    }

    function startEdit(task, textEl) {
        if (task.completed) return;
        const editInput = document.createElement('input');
        editInput.type = 'text';
        editInput.value = task.text;
        editInput.className = 'input task-edit';
        textEl.replaceWith(editInput);
        editInput.focus();
        editInput.select();
        let finished = false;
        const finish = async (save) => {
            if (finished) return;
            finished = true;
            const v = editInput.value.trim();
            if (save && v && v !== task.text) await updateTask(task.id, { text: v });
            else render();
        };
        editInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') finish(true);
            if (e.key === 'Escape') finish(false);
        });
        editInput.addEventListener('blur', () => finish(true));
    }

    async function toggleMit(task) {
        if (!task.is_mit && tasks.filter(t => t.is_mit).length >= 3) {
            toast('O Big 3 tem no máximo 3 tarefas. Escolha o que realmente importa hoje.');
            return;
        }
        await updateTask(task.id, { is_mit: !task.is_mit });
    }

    async function updateTask(id, fields) {
        try {
            const res = await apiRequest(`${API}/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(fields) });
            if (!res || !res.ok) return;
            const updated = await res.json();
            const idx = tasks.findIndex(t => t.id === id);
            if (idx !== -1) tasks[idx] = updated;
            if (fields.completed && updated.is_mit) toast('Big 3 concluída. Ótimo trabalho!');
            render();
        } catch (e) {}
    }

    // Drag and drop (reordenação na lista; troca de quadrante na matriz)
    function onDragStart(e) {
        dragSrcId = e.currentTarget.dataset.id;
        e.currentTarget.style.opacity = '0.4';
        e.dataTransfer.effectAllowed = 'move';
    }
    function onDragOver(e) {
        if (view !== 'list') return;
        e.preventDefault();
        e.currentTarget.classList.add('drag-over');
    }
    function onDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }
    async function onDrop(e) {
        if (view !== 'list') return;
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');
        const dropId = e.currentTarget.dataset.id;
        if (!dragSrcId || dragSrcId === dropId) return;
        const srcIdx = tasks.findIndex(t => t.id === dragSrcId);
        const dstIdx = tasks.findIndex(t => t.id === dropId);
        if (srcIdx === -1 || dstIdx === -1) return;
        const [moved] = tasks.splice(srcIdx, 1);
        tasks.splice(dstIdx, 0, moved);
        render();
        try {
            await Promise.all(tasks.map((t, idx) => apiRequest(`${API}/tasks/${t.id}`, {
                method: 'PATCH', body: JSON.stringify({ sort_order: idx })
            })));
        } catch (e) {}
    }
    function onDragEnd(e) {
        e.currentTarget.style.opacity = '';
        document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        setTimeout(() => { dragSrcId = null; }, 0);
    }

    async function addTask() {
        const text = input.value.trim();
        if (!text) { input.focus(); return; }
        const Q = QUADRANTS[quadrantSelect.value] || QUADRANTS.q2;
        if (newMit && tasks.filter(t => t.is_mit).length >= 3) {
            toast('O Big 3 já está cheio — a tarefa entra sem estrela.');
            setMit(false);
        }
        input.value = '';
        try {
            const res = await apiRequest(`${API}/tasks`, {
                method: 'POST',
                body: JSON.stringify({
                    text, date: today, area: document.getElementById('task-area').value,
                    important: Q.important, urgent: Q.urgent,
                    priority: Q.key === 'q1' ? 'high' : Q.key === 'q2' ? 'medium' : 'low',
                    is_mit: newMit, estimate: parseInt(estimateInput.value) || 1,
                })
            });
            if (!res || !res.ok) return;
            tasks.push(await res.json());
            setMit(false);
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

    function setMit(on) {
        newMit = on;
        mitToggle.classList.toggle('on', on);
        mitToggle.setAttribute('aria-pressed', on);
    }

    // Controles do formulário
    const areaSelect = document.getElementById('task-area');
    document.addEventListener('flow:areas-changed', () => {
        const cur = areaSelect.value || (localStorageGet('flow_last_area') || 'work');
        areaSelect.innerHTML = areaOptions(cur);
        if (!areaSelect.value && areaSelect.options.length) areaSelect.selectedIndex = 0;
        render();
    });
    areaSelect.addEventListener('change', () => localStorageSet('flow_last_area', areaSelect.value));
    mitToggle.addEventListener('click', () => setMit(!newMit));
    document.querySelectorAll('[data-task-view]').forEach(btn => btn.addEventListener('click', () => {
        view = btn.dataset.taskView;
        localStorageSet('flow_task_view', view);
        render();
    }));
    addBtn.addEventListener('click', addTask);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') addTask(); });

    loadTasks();

    window.FlowTasks = {
        get: () => tasks,
        reload: loadTasks,
        setPomodoroCounts(map) { pomodoroCount = map; render(); },
    };
}

window.initTasks = initTasks;
