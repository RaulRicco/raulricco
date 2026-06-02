function initTimer(API, token) {
    const timerEl = document.getElementById('timer');
    const labelEl = document.getElementById('timer-label');
    const startBtn = document.getElementById('start-btn');
    const resetBtn = document.getElementById('reset-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const sessionsCountEl = document.getElementById('sessions-count');
    const sessionsProgress = document.getElementById('sessions-progress');
    const circleEl = document.getElementById('pomodoro-circle');

    const settingsModal = document.getElementById('settings-modal');
    const closeSettingsBtn = document.getElementById('close-settings');
    const applySettingsBtn = document.getElementById('apply-settings');

    const focusTimeInput = document.getElementById('focus-time');
    const shortBreakInput = document.getElementById('short-break');
    const longBreakInput = document.getElementById('long-break');
    const sessionsInput = document.getElementById('sessions-count-input');
    const focusDisplay = document.getElementById('focus-time-display');
    const shortDisplay = document.getElementById('short-break-display');
    const longDisplay = document.getElementById('long-break-display');
    const sessionsDisplay = document.getElementById('sessions-display');

    const PAGE_TITLE = 'Flow Produtividade';

    let settings = JSON.parse(localStorage.getItem('flow_timer_settings') || 'null') || {
        focusTime: 25, shortBreak: 5, longBreak: 15, sessionsCount: 8
    };

    let intervalId = null;
    let isRunning = false;
    let timeLeft = settings.focusTime * 60;
    let sessionsToday = 0;
    let currentMode = 'focus';

    function modeLabel(mode) {
        return { focus: 'Sessão de Foco', shortBreak: 'Intervalo Curto', longBreak: 'Intervalo Longo' }[mode];
    }

    function modeEmoji(mode) {
        return mode === 'focus' ? '🎯' : '☕';
    }

    function updateDisplay() {
        const mm = String(Math.floor(timeLeft / 60)).padStart(2, '0');
        const ss = String(timeLeft % 60).padStart(2, '0');
        timerEl.textContent = `${mm}:${ss}`;
        labelEl.textContent = modeLabel(currentMode);

        // Título da aba
        if (isRunning) {
            document.title = `${mm}:${ss} ${modeEmoji(currentMode)} — ${PAGE_TITLE}`;
        } else {
            document.title = PAGE_TITLE;
        }

        // Círculo de progresso
        const totalTime = currentMode === 'focus'
            ? settings.focusTime * 60
            : currentMode === 'shortBreak'
                ? settings.shortBreak * 60
                : settings.longBreak * 60;
        const pct = 100 - (timeLeft / totalTime * 100);
        circleEl.style.background = `conic-gradient(var(--accent) ${pct}%, transparent ${pct}%)`;
    }

    function playSound() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            [0, 0.35, 0.7].forEach(delay => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.frequency.value = 880;
                osc.type = 'sine';
                gain.gain.setValueAtTime(0.35, ctx.currentTime + delay);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.4);
                osc.start(ctx.currentTime + delay);
                osc.stop(ctx.currentTime + delay + 0.4);
            });
        } catch (e) {
            // AudioContext não disponível — silêncio
        }
    }

    async function saveSession(mode) {
        const duration = mode === 'focus'
            ? settings.focusTime
            : mode === 'shortBreak'
                ? settings.shortBreak
                : settings.longBreak;
        try {
            await apiRequest(`${API}/sessions`, {
                method: 'POST',
                body: JSON.stringify({ mode, duration_minutes: duration, date: brDate() })
            });
        } catch (e) {
            // Não bloqueia o timer por falha de rede
        }
    }

    function updateSessionsUI() {
        sessionsCountEl.textContent = `${sessionsToday}/${settings.sessionsCount}`;
        sessionsProgress.style.width = `${Math.min((sessionsToday / settings.sessionsCount) * 100, 100)}%`;
        document.getElementById('stat-sessions').textContent = sessionsToday;
        const focusMinutes = sessionsToday * settings.focusTime;
        const h = Math.floor(focusMinutes / 60);
        const m = focusMinutes % 60;
        document.getElementById('stat-focus-time').textContent = `${h}h ${m}m`;
    }

    function onSessionComplete() {
        playSound();

        if (currentMode === 'focus') {
            sessionsToday++;
            updateSessionsUI();
            saveSession('focus');
            currentMode = sessionsToday % 4 === 0 ? 'longBreak' : 'shortBreak';
            timeLeft = currentMode === 'longBreak' ? settings.longBreak * 60 : settings.shortBreak * 60;
        } else {
            saveSession(currentMode);
            currentMode = 'focus';
            timeLeft = settings.focusTime * 60;
        }

        updateDisplay();
        startBtn.innerHTML = '<i class="fas fa-play"></i>';
        isRunning = false;
        document.title = PAGE_TITLE;
    }

    function startTimer() {
        if (isRunning) {
            clearInterval(intervalId);
            isRunning = false;
            startBtn.innerHTML = '<i class="fas fa-play"></i>';
            document.title = PAGE_TITLE;
        } else {
            isRunning = true;
            startBtn.innerHTML = '<i class="fas fa-pause"></i>';
            intervalId = setInterval(() => {
                if (timeLeft > 0) {
                    timeLeft--;
                    updateDisplay();
                } else {
                    clearInterval(intervalId);
                    onSessionComplete();
                }
            }, 1000);
        }
    }

    function resetTimer() {
        clearInterval(intervalId);
        isRunning = false;
        currentMode = 'focus';
        timeLeft = settings.focusTime * 60;
        updateDisplay();
        startBtn.innerHTML = '<i class="fas fa-play"></i>';
        document.title = PAGE_TITLE;
    }

    startBtn.addEventListener('click', startTimer);
    resetBtn.addEventListener('click', resetTimer);

    // Slider sync
    focusTimeInput.addEventListener('input', () => { focusDisplay.textContent = `${focusTimeInput.value} min`; });
    shortBreakInput.addEventListener('input', () => { shortDisplay.textContent = `${shortBreakInput.value} min`; });
    longBreakInput.addEventListener('input', () => { longDisplay.textContent = `${longBreakInput.value} min`; });
    sessionsInput.addEventListener('input', () => { sessionsDisplay.textContent = sessionsInput.value; });

    settingsBtn.addEventListener('click', () => {
        focusTimeInput.value = settings.focusTime;
        shortBreakInput.value = settings.shortBreak;
        longBreakInput.value = settings.longBreak;
        sessionsInput.value = settings.sessionsCount;
        focusDisplay.textContent = `${settings.focusTime} min`;
        shortDisplay.textContent = `${settings.shortBreak} min`;
        longDisplay.textContent = `${settings.longBreak} min`;
        sessionsDisplay.textContent = settings.sessionsCount;
        settingsModal.classList.add('active');
    });

    closeSettingsBtn.addEventListener('click', () => settingsModal.classList.remove('active'));
    settingsModal.addEventListener('click', e => { if (e.target === settingsModal) settingsModal.classList.remove('active'); });

    applySettingsBtn.addEventListener('click', () => {
        settings.focusTime = parseInt(focusTimeInput.value);
        settings.shortBreak = parseInt(shortBreakInput.value);
        settings.longBreak = parseInt(longBreakInput.value);
        settings.sessionsCount = parseInt(sessionsInput.value);
        localStorage.setItem('flow_timer_settings', JSON.stringify(settings));
        updateSessionsUI();
        resetTimer();
        settingsModal.classList.remove('active');
    });

    // Carregar sessões do dia já registradas
    async function loadTodaySessions() {
        try {
            const res = await apiRequest(`${API}/sessions?date=${brDate()}`);
            if (res && res.ok) {
                const sessions = await res.json();
                sessionsToday = sessions.filter(s => s.mode === 'focus').length;
                updateSessionsUI();
            }
        } catch (e) {}
    }

    loadTodaySessions();
    updateDisplay();
    updateSessionsUI();

    // Botão de reset do dia — zera contador e reinicia timer
    const resetDayBtn = document.getElementById('reset-day-btn');
    if (resetDayBtn) {
        resetDayBtn.addEventListener('click', () => {
            sessionsToday = 0;
            resetTimer();
            updateSessionsUI();
        });
    }

    window._resetTimer = () => {
        sessionsToday = 0;
        resetTimer();
        updateSessionsUI();
    };
}

window.initTimer = initTimer;
