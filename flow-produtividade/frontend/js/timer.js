// Timer Pomodoro / Deep Work — sessão vinculada a uma tarefa, com avaliação da qualidade do foco
function initTimer(API) {
    const $ = id => document.getElementById(id);
    const timerEl = $('timer'), labelEl = $('timer-label'), startBtn = $('start-btn');
    const ring = $('timer-ring-progress');
    const taskSelect = $('timer-task');
    const areaSelect = $('timer-area');
    const stopBtn = $('stop-btn');
    const qualityBox = $('quality-box');
    const PAGE_TITLE = 'Flow Produtividade';
    const RING_LEN = 2 * Math.PI * 108;

    let settings = getSettings();
    let isRunning = false, intervalId = null;
    let currentMode = 'focus';
    let timeLeft = settings.focusTime * 60;
    let endAt = null;
    let focusToday = 0;
    let lastSessionId = null;
    let applying = false;        // aplicando estado vindo de outro aparelho (não regrava)
    let wantedTaskId = '';       // tarefa do estado sincronizado, aplicada quando a lista carregar

    // Cronômetro (contador livre) — fica na conta: continua em qualquer aparelho e após recarregar
    let sw = loadSw();
    function loadSw() { return { startAt: null, accMs: 0, ...(Prefs.get('stopwatch') || {}) }; }
    function persistSw() { Prefs.set('stopwatch', { ...sw }, { delay: 0 }); }

    // Estado do relógio (modo, rodando até quando, tempo restante, tarefa) — também na conta
    function pomodoroState() {
        const base = { mode: currentMode, taskId: taskSelect.value || null };
        if (currentMode === 'stopwatch') return base;
        return isRunning ? { ...base, endAt } : { ...base, left: timeLeft };
    }
    function persistState() { if (!applying) Prefs.set('pomodoro', pomodoroState(), { delay: 0 }); }
    function applyState(st) {
        st = st || { mode: 'focus' };
        applying = true;
        clearInterval(intervalId);
        currentMode = ['focus', 'shortBreak', 'longBreak', 'stopwatch'].includes(st.mode) ? st.mode : 'focus';
        isRunning = false; endAt = null;
        if (st.taskId !== undefined) {
            wantedTaskId = st.taskId || '';
            if ([...taskSelect.options].some(o => o.value === wantedTaskId)) taskSelect.value = wantedTaskId;
        }
        if (currentMode === 'stopwatch') {
            if (sw.startAt) intervalId = setInterval(updateDisplay, 500);
        } else if (st.endAt) {
            isRunning = true; endAt = st.endAt;
            timeLeft = Math.max(0, Math.round((endAt - Date.now()) / 1000));
            intervalId = setInterval(tick, 250);
        } else {
            timeLeft = Number.isFinite(st.left) && st.left > 0 ? Math.min(st.left, modeTotal(currentMode)) : modeTotal(currentMode);
        }
        applying = false;
        updateDisplay();
        if (isRunning && timeLeft <= 0) tick();
    }
    const swElapsed = () => sw.accMs + (sw.startAt ? Date.now() - sw.startAt : 0);
    function fmtClock(ms) {
        const t = Math.floor(ms / 1000), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60;
        return (h ? `${h}:${String(m).padStart(2, '0')}` : String(m).padStart(2, '0')) + `:${String(s).padStart(2, '0')}`;
    }

    const modeLabel = m => ({ focus: 'Deep Work', shortBreak: 'Pausa curta', longBreak: 'Pausa longa', stopwatch: 'Cronômetro' }[m]);
    const modeTotal = m => (m === 'focus' ? settings.focusTime : m === 'shortBreak' ? settings.shortBreak : settings.longBreak) * 60;

    function updateDisplay() {
        document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === currentMode));
        stopBtn.style.display = currentMode === 'stopwatch' ? '' : 'none';
        $('skip-btn').style.display = currentMode === 'stopwatch' ? 'none' : '';
        if (currentMode === 'stopwatch') {
            const ms = swElapsed();
            timerEl.textContent = fmtClock(ms);
            labelEl.textContent = sw.startAt ? 'Contando…' : ms ? 'Pausado' : 'Cronômetro';
            document.title = sw.startAt ? `${fmtClock(ms)} ⏱ — ${PAGE_TITLE}` : PAGE_TITLE;
            ring.style.strokeDasharray = RING_LEN;
            ring.style.strokeDashoffset = RING_LEN * (1 - (ms % 3600000) / 3600000);
            ring.style.stroke = 'var(--violet)';
            startBtn.innerHTML = sw.startAt ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
            return;
        }
        const mm = String(Math.floor(timeLeft / 60)).padStart(2, '0');
        const ss = String(timeLeft % 60).padStart(2, '0');
        timerEl.textContent = `${mm}:${ss}`;
        labelEl.textContent = modeLabel(currentMode);
        document.title = isRunning ? `${mm}:${ss} ${currentMode === 'focus' ? '🎯' : '☕'} — ${PAGE_TITLE}` : PAGE_TITLE;
        const pct = 1 - timeLeft / modeTotal(currentMode);
        ring.style.strokeDasharray = RING_LEN;
        ring.style.strokeDashoffset = RING_LEN * (1 - pct);
        ring.style.stroke = currentMode === 'focus' ? 'var(--accent)' : 'var(--good)';
        document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === currentMode));
        startBtn.innerHTML = isRunning ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
    }

    function updateSessionsUI() {
        $('sessions-count').textContent = `${focusToday}/${settings.sessionsCount}`;
        $('sessions-progress').style.width = `${Math.min(focusToday / settings.sessionsCount * 100, 100)}%`;
    }

    function playSound() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            [0, 0.35, 0.7].forEach(delay => {
                const osc = ctx.createOscillator(), gain = ctx.createGain();
                osc.connect(gain); gain.connect(ctx.destination);
                osc.frequency.value = 880; osc.type = 'sine';
                gain.gain.setValueAtTime(0.35, ctx.currentTime + delay);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.4);
                osc.start(ctx.currentTime + delay); osc.stop(ctx.currentTime + delay + 0.4);
            });
        } catch (e) {}
    }

    function notify(text) {
        try {
            if ('Notification' in window && Notification.permission === 'granted') new Notification(PAGE_TITLE, { body: text });
        } catch (e) {}
    }

    async function saveSession(mode, minutes) {
        const taskId = mode === 'focus' ? (taskSelect.value || null) : null;
        const task = taskId && window.FlowTasks ? window.FlowTasks.get().find(t => t.id === taskId) : null;
        // A área escolhida no relógio vale; a da tarefa só entra se nenhuma foi escolhida
        const area = mode === 'focus' ? (areaSelect.value || (task && task.area) || null) : null;
        try {
            const res = await apiRequest(`${API}/sessions`, {
                method: 'POST',
                body: JSON.stringify({
                    mode, duration_minutes: minutes || Math.round(modeTotal(mode) / 60), date: brDate(),
                    task_id: taskId, area,
                })
            });
            if (res && res.ok) {
                const s = await res.json();
                if (mode === 'focus') lastSessionId = s.id;
            }
        } catch (e) {}
        document.dispatchEvent(new CustomEvent('flow:session-logged', { detail: { mode } }));
    }

    function showQuality() {
        qualityBox.classList.add('show');
        qualityBox.querySelectorAll('[data-q]').forEach(b => b.classList.remove('on'));
    }

    qualityBox.querySelectorAll('[data-q]').forEach(btn => btn.addEventListener('click', async () => {
        qualityBox.querySelectorAll('[data-q]').forEach(b => b.classList.toggle('on', b === btn));
        if (!lastSessionId) { qualityBox.classList.remove('show'); return; }
        try {
            await apiRequest(`${API}/sessions/${lastSessionId}`, {
                method: 'PATCH', body: JSON.stringify({ focus_quality: parseInt(btn.dataset.q) })
            });
        } catch (e) {}
        setTimeout(() => qualityBox.classList.remove('show'), 500);
        document.dispatchEvent(new CustomEvent('flow:session-logged', { detail: { mode: 'rating' } }));
    }));
    $('quality-skip').addEventListener('click', () => qualityBox.classList.remove('show'));

    let completing = false;
    async function onSessionComplete() {
        if (completing) return;
        completing = true;
        clearInterval(intervalId);
        const finished = currentMode;
        const expect = Prefs.get('pomodoro');
        isRunning = false; endAt = null;
        const next = finished === 'focus' ? ((focusToday + 1) % 4 === 0 ? 'longBreak' : 'shortBreak') : 'focus';
        const nextState = { mode: next, taskId: taskSelect.value || null, left: modeTotal(next) };
        // Só um aparelho registra a sessão: quem conseguir virar o estado primeiro
        const won = await Prefs.cas('pomodoro', expect, nextState);
        completing = false;
        playSound();
        if (!won) { applyState(Prefs.get('pomodoro')); return; }
        if (finished === 'focus') {
            focusToday++;
            updateSessionsUI();
            saveSession('focus');
            showQuality();
            notify('Sessão de foco concluída. Hora da pausa!');
        } else {
            saveSession(finished);
            notify('Pausa encerrada. Bora focar!');
        }
        applying = true; applyState(nextState); applying = false;
    }

    function tick() {
        timeLeft = Math.max(0, Math.round((endAt - Date.now()) / 1000));
        updateDisplay();
        if (timeLeft <= 0) onSessionComplete();
    }

    function toggle() {
        if (currentMode === 'stopwatch') {
            if (sw.startAt) { sw.accMs = swElapsed(); sw.startAt = null; }
            else sw.startAt = Date.now();
            persistSw();
            clearInterval(intervalId);
            if (sw.startAt) intervalId = setInterval(updateDisplay, 500);
            updateDisplay();
            return;
        }
        if (isRunning) {
            clearInterval(intervalId);
            timeLeft = Math.max(0, Math.round((endAt - Date.now()) / 1000));
            isRunning = false;
            endAt = null;
            persistState();
            updateDisplay();
            return;
        }
        try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch (e) {}
        isRunning = true;
        endAt = Date.now() + timeLeft * 1000;
        intervalId = setInterval(tick, 250);
        persistState();
        updateDisplay();
    }

    function setMode(mode) {
        if (currentMode === 'stopwatch' && mode !== 'stopwatch' && swElapsed() > 0) {
            toast('O cronômetro continua guardado — volte em “Cronômetro” para salvar.');
        }
        clearInterval(intervalId);
        if (mode === 'stopwatch' && sw.startAt) intervalId = setInterval(updateDisplay, 500);
        isRunning = false;
        endAt = null;
        currentMode = mode;
        timeLeft = modeTotal(mode);
        persistState();
        updateDisplay();
    }

    startBtn.addEventListener('click', toggle);
    $('reset-btn').addEventListener('click', () => {
        if (currentMode === 'stopwatch') {
            if (swElapsed() > 60000 && !confirm('Descartar o tempo do cronômetro sem salvar?')) return;
            sw = { startAt: null, accMs: 0 }; persistSw();
        }
        setMode(currentMode);
    });
    stopBtn.addEventListener('click', async () => {
        const minutes = Math.round(swElapsed() / 60000);
        if (minutes < 1) { toast('Menos de 1 minuto — nada para salvar ainda.'); return; }
        if (!taskSelect.value && !areaSelect.value) { toast('Escolha uma área ou tarefa para lançar o tempo.'); areaSelect.focus(); return; }
        const before = Prefs.get('stopwatch');
        const cleared = { startAt: null, accMs: 0, area: sw.area };
        if (!(await Prefs.cas('stopwatch', before, cleared))) {
            sw = loadSw(); updateDisplay();
            toast('Esse tempo já foi salvo em outro aparelho.');
            return;
        }
        sw = cleared;
        clearInterval(intervalId);
        playSound();
        await saveSession('focus', minutes);
        focusToday++;
        updateSessionsUI();
        showQuality();
        toast(`${fmtMinutes(minutes)} lançados em ${areaInfo((window.FlowTasks?.get().find(t => t.id === taskSelect.value) || {}).area || areaSelect.value).name}.`);
        updateDisplay();
    });
    $('skip-btn').addEventListener('click', () => setMode(currentMode === 'focus' ? 'shortBreak' : 'focus'));
    document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));

    // Lista de tarefas no seletor "Focando em"
    function fillTaskSelect(tasks) {
        const current = taskSelect.value;
        const pending = tasks.filter(t => !t.completed);
        if (!current && wantedTaskId) setTimeout(() => { if ([...taskSelect.options].some(o => o.value === wantedTaskId)) taskSelect.value = wantedTaskId; }, 0);
        const mits = pending.filter(t => t.is_mit), rest = pending.filter(t => !t.is_mit);
        const opt = t => `<option value="${t.id}">${t.is_mit ? '★ ' : ''}${escapeHtml(t.text)}</option>`;
        taskSelect.innerHTML = '<option value="">— Sem tarefa vinculada —</option>' +
            (mits.length ? `<optgroup label="Big 3">${mits.map(opt).join('')}</optgroup>` : '') +
            (rest.length ? `<optgroup label="Outras">${rest.map(opt).join('')}</optgroup>` : '');
        if ([...taskSelect.options].some(o => o.value === current)) taskSelect.value = current;
    }
    document.addEventListener('flow:tasks-changed', e => fillTaskSelect(e.detail));
    function fillAreaSelect() {
        let cur = areaSelect.value;
        cur = cur || sw.area || Prefs.get('timer_area', '') || '';
        areaSelect.innerHTML = areaOptions(cur, { includeNone: true });
        if ([...areaSelect.options].some(o => o.value === cur)) areaSelect.value = cur;
    }
    document.addEventListener('flow:areas-changed', fillAreaSelect);
    // A área pode ser trocada a qualquer momento, inclusive com o relógio rodando
    areaSelect.addEventListener('change', () => {
        sw.area = areaSelect.value; persistSw();
        Prefs.set('timer_area', areaSelect.value, { delay: 0 });
        if (areaSelect.value) toast(`Área do relógio: ${areaInfo(areaSelect.value).name}`);
    });
    taskSelect.addEventListener('change', () => {
        wantedTaskId = taskSelect.value;
        const t = window.FlowTasks?.get().find(x => x.id === taskSelect.value);
        if (t && t.area) { areaSelect.value = t.area; sw.area = t.area; persistSw(); Prefs.set('timer_area', t.area, { delay: 0 }); }
        persistState();
    });
    document.addEventListener('flow:start-area', e => {
        areaSelect.value = e.detail; sw.area = e.detail; persistSw();
        taskSelect.value = '';
        setMode('stopwatch');
        if (!sw.startAt) toggle();
    });
    document.addEventListener('flow:focus-task', e => {
        taskSelect.value = e.detail; wantedTaskId = e.detail;
        const t = window.FlowTasks?.get().find(x => x.id === e.detail);
        if (t && t.area) { areaSelect.value = t.area; Prefs.set('timer_area', t.area, { delay: 0 }); }
        if (currentMode !== 'focus' && currentMode !== 'stopwatch') setMode('focus'); else persistState();
    });

    // Configurações
    const modal = $('settings-modal');
    const fields = [
        ['focus-time', 'focusTime', v => `${v} min`],
        ['short-break', 'shortBreak', v => `${v} min`],
        ['long-break', 'longBreak', v => `${v} min`],
        ['sessions-count-input', 'sessionsCount', v => v],
        ['deep-hours', 'dailyDeepHours', v => `${v} h`],
    ];
    fields.forEach(([id, , fmt]) => $(id).addEventListener('input', () => { $(id + '-display').textContent = fmt($(id).value); }));
    $('settings-btn').addEventListener('click', () => {
        fields.forEach(([id, key, fmt]) => { $(id).value = settings[key]; $(id + '-display').textContent = fmt(settings[key]); });
        modal.classList.add('active');
    });
    $('close-settings').addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('active'); });
    $('apply-settings').addEventListener('click', () => {
        fields.forEach(([id, key]) => { settings[key] = parseFloat($(id).value); });
        saveSettings(settings);
        updateSessionsUI();
        setMode('focus');
        modal.classList.remove('active');
        document.dispatchEvent(new CustomEvent('flow:session-logged', { detail: { mode: 'settings' } }));
    });

    // Atalho: espaço inicia/pausa (fora de campos de texto)
    document.addEventListener('keydown', e => {
        if (e.code !== 'Space' || /INPUT|TEXTAREA|SELECT|BUTTON/.test(document.activeElement.tagName)) return;
        if (!document.getElementById('section-today').classList.contains('active')) return;
        e.preventDefault();
        toggle();
    });

    window.FlowTimer = { setFocusCount(n) { focusToday = n; updateSessionsUI(); } };

    // Mudanças feitas em outro aparelho
    document.addEventListener('flow:prefs-changed', e => {
        const keys = e.detail;
        if (keys.includes('timer_settings')) {
            settings = getSettings();
            updateSessionsUI();
            if (!isRunning && currentMode !== 'stopwatch') { timeLeft = modeTotal(currentMode); updateDisplay(); }
        }
        if (keys.includes('stopwatch')) { sw = loadSw(); if (sw.area && !areaSelect.value) areaSelect.value = sw.area; }
        if (keys.includes('timer_area')) { const a = Prefs.get('timer_area', ''); if ([...areaSelect.options].some(o => o.value === a)) areaSelect.value = a; }
        if (keys.includes('pomodoro') && !completing) applyState(Prefs.get('pomodoro'));
        else if (keys.includes('stopwatch') && currentMode === 'stopwatch') applyState({ mode: 'stopwatch' });
    });

    // Retoma o relógio/cronômetro do jeito que estava (neste ou em outro aparelho)
    applyState(Prefs.get('pomodoro') || ((sw.startAt || sw.accMs) ? { mode: 'stopwatch' } : null));
    updateSessionsUI();
}

window.initTimer = initTimer;
