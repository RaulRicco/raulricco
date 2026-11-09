// Reflexão — Shutdown diário e Revisão semanal (GTD Weekly Review + 12 Week Year)
const Review = (() => {
    const $ = id => document.getElementById(id);
    let shutdown = { energy: null, mood: null };

    // ---------- Shutdown diário ----------
    async function openShutdown() {
        const date = brDate();
        $('shutdown-date').textContent = fmtDateShort(date);
        shutdown = { energy: null, mood: null };
        ['wins', 'blockers', 'tomorrow'].forEach(k => $('sd-' + k).value = '');
        try {
            const res = await apiRequest(`${FLOW_API}/reviews?date=${date}`);
            if (res && res.ok) {
                const r = await res.json();
                if (r) {
                    shutdown = { energy: r.energy, mood: r.mood };
                    ['wins', 'blockers', 'tomorrow'].forEach(k => $('sd-' + k).value = r[k] || '');
                }
            }
        } catch (e) {}
        paintScales();

        // Resumo automático do dia
        const tasks = window.FlowTasks ? window.FlowTasks.get() : [];
        const mits = tasks.filter(t => t.is_mit);
        const pending = tasks.filter(t => !t.completed);
        $('shutdown-summary').innerHTML = `
            <span><b>${$('today-deep').textContent}</b> deep work</span>
            <span><b>${mits.filter(t => t.completed).length}/${mits.length}</b> Big 3</span>
            <span><b>${tasks.filter(t => t.completed).length}/${tasks.length}</b> tarefas</span>
            <span><b>${$('today-score').textContent}</b> Flow Score</span>`;
        $('shutdown-pending').textContent = pending.length
            ? `${pending.length} tarefa(s) pendente(s) serão levadas para amanhã automaticamente.`
            : 'Nenhuma pendência. Dia fechado!';
        $('shutdown-modal').classList.add('active');
    }

    function paintScales() {
        document.querySelectorAll('[data-scale]').forEach(btn => {
            btn.classList.toggle('on', +shutdown[btn.dataset.scale] === +btn.dataset.v);
        });
    }

    async function saveShutdown() {
        const body = {
            energy: shutdown.energy, mood: shutdown.mood,
            wins: $('sd-wins').value.trim(), blockers: $('sd-blockers').value.trim(), tomorrow: $('sd-tomorrow').value.trim(),
        };
        try {
            const res = await apiRequest(`${FLOW_API}/reviews?date=${brDate()}`, { method: 'PUT', body: JSON.stringify(body) });
            if (res && res.ok) {
                $('shutdown-modal').classList.remove('active');
                toast('Shutdown salvo. Desligue e descanse — amanhã tem mais.');
                Analytics.invalidate();
                document.dispatchEvent(new CustomEvent('flow:review-saved'));
            } else toast('Não foi possível salvar. Tente novamente.');
        } catch (e) { toast('Sem conexão. Tente novamente.'); }
    }

    // ---------- Revisão semanal ----------
    const CHECKLIST = [
        'Esvaziar a cabeça: anotar tudo que está pendente (captura)',
        'Revisar tarefas pendentes e reclassificar na Matriz',
        'Eliminar ou delegar o que caiu em “Delegar” / “Eliminar”',
        'Atualizar o progresso das metas trimestrais e mensais',
        'Definir 1–3 metas semanais ligadas às metas do trimestre',
        'Bloquear na agenda os horários de pico para deep work',
        'Escolher o Big 3 de segunda-feira',
    ];

    function weekDates(offsetWeeks) {
        // Semana de segunda a domingo, no fuso BR
        const today = brDate();
        const wd = weekdayOf(today);
        const sinceMonday = (wd + 6) % 7;
        const out = [];
        for (let i = 0; i < 7; i++) out.push(brDate(sinceMonday + offsetWeeks * 7 - i));
        return out; // segunda..domingo (datas futuras incluídas)
    }

    async function renderWeekly() {
        const offset = parseInt(document.querySelector('[data-week].active')?.dataset.week || '0');
        const dates = weekDates(offset);
        const prevDates = weekDates(offset + 1);
        $('week-label').textContent = `${fmtDateShort(dates[0])} – ${fmtDateShort(dates[6])}`;
        let raw;
        try { raw = await Analytics.fetchRaw(); } catch (e) { return; }
        const today = brDate();
        const days = buildDays(raw, dates);
        const prev = buildDays(raw, prevDates);
        const past = days.filter(d => d.date <= today);
        const s = arr => arr.reduce((a, d) => a + d.focusMin, 0);
        const mitT = past.reduce((a, d) => a + d.mitTotal, 0), mitD = past.reduce((a, d) => a + d.mitDone, 0);
        const best = past.slice().sort((a, b) => b.score - a.score)[0];
        const scoreAvg = past.length ? Math.round(past.reduce((a, d) => a + d.score, 0) / past.length) : 0;
        const prevScore = Math.round(prev.reduce((a, d) => a + d.score, 0) / 7);
        const WD = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

        $('week-kpis').innerHTML = [
            ['Deep work', fmtMinutes(s(days)), `semana anterior: ${fmtMinutes(s(prev))}`],
            ['Flow Score médio', scoreAvg, `semana anterior: ${prevScore}`],
            ['Big 3', mitT ? `${Math.round(mitD / mitT * 100)}%` : '—', `${mitD} de ${mitT} concluídas`],
            ['Tarefas', days.reduce((a, d) => a + d.taskDone, 0), 'concluídas'],
            ['Melhor dia', best && best.score ? `${WD[weekdayOf(best.date)]} ${fmtDateShort(best.date)}` : '—', best && best.score ? `score ${best.score} · ${fmtMinutes(best.focusMin)}` : ''],
        ].map(([l, v, sub]) => `<div class="kpi"><div class="kpi-label">${l}</div><div class="kpi-value">${v}</div><div class="kpi-foot"><span class="muted small">${sub}</span></div></div>`).join('');

        const maxMin = Math.max(...days.map(d => d.focusMin), 60);
        $('week-strip').innerHTML = days.map(d => {
            const future = d.date > today;
            return `<div class="day-col ${future ? 'future' : ''} ${d.date === today ? 'today' : ''}">
                <span class="muted small">${WD[weekdayOf(d.date)]}</span>
                <div class="day-bar"><div style="height:${(d.focusMin / maxMin) * 100}%"></div></div>
                <b>${future ? '—' : d.score}</b>
                <span class="muted small">${future ? '' : fmtMinutes(d.focusMin)}</span>
                <span class="day-e" title="Energia / humor">${d.review ? `⚡${d.review.energy || '–'} · ☺${d.review.mood || '–'}` : '<span class="muted">sem shutdown</span>'}</span>
            </div>`;
        }).join('');

        const list = (key) => days.filter(d => d.review && d.review[key]).map(d =>
            `<li><span class="muted small">${WD[weekdayOf(d.date)]} ${fmtDateShort(d.date)}</span>${escapeHtml(d.review[key])}</li>`).join('');
        $('week-wins').innerHTML = list('wins') || '<li class="empty">Registre vitórias no shutdown diário.</li>';
        $('week-blockers').innerHTML = list('blockers') || '<li class="empty">Nenhum bloqueio registrado.</li>';

        // Checklist da revisão (conveniência local, por semana)
        const key = 'flow_weekly_check_' + dates[0];
        let checked = [];
        try { checked = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) {}
        $('week-checklist').innerHTML = CHECKLIST.map((item, i) => `
            <label class="check-row"><input type="checkbox" data-i="${i}" ${checked.includes(i) ? 'checked' : ''}><span>${item}</span></label>`).join('');
        $('week-checklist').querySelectorAll('input').forEach(cb => cb.addEventListener('change', () => {
            const now = [...$('week-checklist').querySelectorAll('input:checked')].map(x => +x.dataset.i);
            try { localStorage.setItem(key, JSON.stringify(now)); } catch (e) {}
            $('week-check-count').textContent = `${now.length}/${CHECKLIST.length}`;
        }));
        $('week-check-count').textContent = `${checked.length}/${CHECKLIST.length}`;
    }

    function bind() {
        $('shutdown-btn').addEventListener('click', openShutdown);
        $('close-shutdown').addEventListener('click', () => $('shutdown-modal').classList.remove('active'));
        $('shutdown-modal').addEventListener('click', e => { if (e.target === $('shutdown-modal')) $('shutdown-modal').classList.remove('active'); });
        $('save-shutdown').addEventListener('click', saveShutdown);
        document.querySelectorAll('[data-scale]').forEach(btn => btn.addEventListener('click', () => {
            shutdown[btn.dataset.scale] = +btn.dataset.v;
            paintScales();
        }));
        document.querySelectorAll('[data-week]').forEach(b => b.addEventListener('click', () => {
            document.querySelectorAll('[data-week]').forEach(x => x.classList.toggle('active', x === b));
            renderWeekly();
        }));
    }

    return { bind, renderWeekly, openShutdown };
})();

window.Review = Review;
