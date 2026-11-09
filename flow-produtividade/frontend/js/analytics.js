// Dashboard de análise — deep work, Flow Score, Eisenhower, áreas, energia, ritmo e insights
const Analytics = (() => {
    let raw = null;
    let rawFetchedAt = 0;
    const charts = {};
    const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const C = {
        work: '#3987e5', personal: '#d95926', other: '#6b6a64', accent: '#3987e5', aqua: '#199e70',
        violet: '#9085e9', text: '#c3c2b7', muted: '#8b8a84', grid: 'rgba(255,255,255,0.06)', surface: '#1c1c1f',
    };
    const HEAT = ['#26262a', '#184f95', '#256abf', '#3987e5', '#6da7ec', '#9ec5f4'];

    function state() {
        return {
            days: parseInt(document.querySelector('[data-range].active')?.dataset.range || '30'),
            area: document.getElementById('area-filter')?.value || 'all',
        };
    }

    async function fetchRaw(force = false) {
        if (raw && !force && Date.now() - rawFetchedAt < 60000) return raw;
        const res = await apiRequest(`${FLOW_API}/analytics?since=${brDate(181)}`);
        if (!res || !res.ok) throw new Error('falha');
        raw = await res.json();
        FlowAreas.set(raw.areas);
        rawFetchedAt = Date.now();
        return raw;
    }

    async function load(force = false) {
        const root = document.getElementById('analytics-root');
        root.classList.add('loading');
        try {
            await fetchRaw(force);
            render();
        } catch (e) {
            document.getElementById('insights-list').innerHTML = '<li>Não foi possível carregar os dados. Verifique a conexão.</li>';
        }
        root.classList.remove('loading');
    }

    // ---------- helpers ----------
    const sum = (arr, f) => arr.reduce((a, x) => a + (f ? f(x) : x), 0);
    const avg = arr => arr.length ? sum(arr) / arr.length : 0;

    function deltaHtml(cur, prev, { unit = '', invert = false, pts = false } = {}) {
        if (!prev && !cur) return '<span class="delta flat">—</span>';
        if (!prev) return '<span class="delta up"><i class="fas fa-arrow-up"></i> novo</span>';
        const diff = pts ? cur - prev : ((cur - prev) / prev) * 100;
        const good = invert ? diff < 0 : diff > 0;
        const cls = Math.abs(diff) < 0.5 ? 'flat' : good ? 'up' : 'down';
        const arrow = diff > 0 ? 'fa-arrow-up' : diff < 0 ? 'fa-arrow-down' : 'fa-minus';
        return `<span class="delta ${cls}"><i class="fas ${arrow}"></i> ${Math.abs(Math.round(diff))}${pts ? ' pts' : '%'}${unit}</span>`;
    }

    function streaks(days) {
        let current = 0, best = 0, run = 0;
        days.forEach(d => { run = d.focusMin > 0 ? run + 1 : 0; best = Math.max(best, run); });
        // sequência atual: conta de hoje para trás (hoje sem foco ainda não quebra a sequência)
        for (let i = days.length - 1; i >= 0; i--) {
            if (days[i].focusMin > 0) current++;
            else if (i === days.length - 1) continue;
            else break;
        }
        return { current, best };
    }

    function summarize(days) {
        const active = days.filter(d => d.focusMin > 0 || d.taskDone > 0);
        const sessions = sum(days, d => d.sessions);
        const qualities = days.flatMap(d => d.qualities).filter(Boolean);
        const mitTotal = sum(days, d => d.mitTotal), mitDone = sum(days, d => d.mitDone);
        return {
            focusMin: sum(days, d => d.focusMin),
            sessions,
            score: Math.round(avg(days.map(d => d.score))),
            activeDays: active.length,
            taskDone: sum(days, d => d.taskDone),
            taskTotal: sum(days, d => d.taskTotal),
            mitRate: mitTotal ? mitDone / mitTotal : 0,
            mitTotal, mitDone,
            quality: qualities.length ? avg(qualities) : 0,
            rated: qualities.length,
        };
    }

    function chartBase(extra = {}) {
        return {
            responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#26262a', borderColor: '#3a3a40', borderWidth: 1, padding: 10,
                    titleColor: '#f0efec', bodyColor: '#c3c2b7', boxPadding: 4, usePointStyle: true,
                },
            },
            scales: {
                x: { grid: { display: false }, ticks: { color: C.muted, font: { size: 11 }, maxRotation: 0, autoSkipPadding: 12 }, border: { color: C.grid } },
                y: { beginAtZero: true, grid: { color: C.grid }, ticks: { color: C.muted, font: { size: 11 }, maxTicksLimit: 5 }, border: { display: false } },
            },
            ...extra,
        };
    }

    function draw(id, config) {
        if (charts[id]) charts[id].destroy();
        const el = document.getElementById(id);
        if (!el || typeof Chart === 'undefined') return;
        charts[id] = new Chart(el, config);
    }

    function legend(id, items) {
        document.getElementById(id).innerHTML = items.map(([label, color, dashed]) =>
            `<span class="lg"><i style="${dashed ? `border-top:2px dashed ${color};background:none;height:0` : `background:${color}`}"></i>${label}</span>`).join('');
    }

    // ---------- render ----------
    function render() {
        if (!raw) return;
        const { days: n, area } = state();
        const settings = getSettings();
        const dates = lastNDates(n);
        const prevDates = lastNDates(n, n);
        const days = buildDays(raw, dates, area);
        const prevDays = buildDays(raw, prevDates, area);
        const cur = summarize(days), prev = summarize(prevDays);
        const allDays = buildDays(raw, lastNDates(182), area);
        const st = streaks(allDays);

        document.getElementById('range-label').textContent = `${fmtDateShort(dates[0])} – ${fmtDateShort(dates[dates.length - 1])} · comparado aos ${n} dias anteriores`;

        // KPIs
        const kpis = [
            { label: 'Deep work', value: fmtMinutes(cur.focusMin), sub: `${fmtMinutes(cur.focusMin / Math.max(n, 1))}/dia · meta ${settings.dailyDeepHours}h`, delta: deltaHtml(cur.focusMin, prev.focusMin), icon: 'fa-brain' },
            { label: 'Flow Score médio', value: `${cur.score}<small>/100</small>`, sub: scoreLabel(cur.score), delta: deltaHtml(cur.score, prev.score, { pts: true }), icon: 'fa-gauge-high' },
            { label: 'Big 3 concluídas', value: `${Math.round(cur.mitRate * 100)}%`, sub: `${cur.mitDone} de ${cur.mitTotal} MITs`, delta: deltaHtml(cur.mitRate * 100, prev.mitRate * 100, { pts: true }), icon: 'fa-star' },
            { label: 'Sequência atual', value: `${st.current}<small> dias</small>`, sub: `recorde: ${st.best} dias`, delta: '', icon: 'fa-fire' },
            { label: 'Tarefas concluídas', value: cur.taskDone, sub: `${cur.taskTotal ? Math.round(cur.taskDone / cur.taskTotal * 100) : 0}% do planejado`, delta: deltaHtml(cur.taskDone, prev.taskDone), icon: 'fa-check-double' },
            { label: 'Qualidade do foco', value: cur.rated ? `${cur.quality.toFixed(1)}<small>/5</small>` : '—', sub: cur.rated ? `${cur.rated} sessões avaliadas` : 'avalie após cada sessão', delta: cur.rated && prev.rated ? deltaHtml(cur.quality, prev.quality) : '', icon: 'fa-bullseye' },
        ];
        document.getElementById('kpi-row').innerHTML = kpis.map(k => `
            <div class="kpi">
                <div class="kpi-label"><i class="fas ${k.icon}"></i>${k.label}</div>
                <div class="kpi-value">${k.value}</div>
                <div class="kpi-foot"><span class="muted small">${k.sub}</span>${k.delta}</div>
            </div>`).join('');

        const labels = dates.map(fmtDateShort);

        // Deep work por dia (empilhado por área) + meta
        const areaIds = [...new Set([...FlowAreas.active().map(a => a.id), ...days.flatMap(d => Object.keys(d.byArea))])]
            .filter(id => days.some(d => d.byArea[id] > 0));
        const areaSets = areaIds.map(id => {
            const a = areaInfo(id);
            return { label: a.name, data: days.map(d => +((d.byArea[id] || 0) / 60).toFixed(2)), backgroundColor: a.color, stack: 'a', borderRadius: 4, borderSkipped: 'start', borderColor: C.surface, borderWidth: { top: 2 } };
        });
        draw('chart-deep', {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    ...areaSets,
                    { label: 'Meta diária', type: 'line', data: dates.map(() => settings.dailyDeepHours), borderColor: C.muted, borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 0 },
                ],
            },
            options: chartBase({
                scales: {
                    ...chartBase().scales,
                    x: { ...chartBase().scales.x, stacked: true },
                    y: { ...chartBase().scales.y, stacked: true, ticks: { ...chartBase().scales.y.ticks, callback: v => `${v}h` } },
                },
                plugins: { ...chartBase().plugins, tooltip: { ...chartBase().plugins.tooltip, filter: i => i.raw > 0 || i.dataset.type === 'line', callbacks: { label: c => ` ${c.dataset.label}: ${fmtMinutes(c.raw * 60)}` } } },
            }),
        });
        legend('legend-deep', [...areaIds.map(id => [areaInfo(id).name, areaInfo(id).color]), ['Meta diária', C.muted, true]]);

        // Tabela acessível
        document.getElementById('table-deep').innerHTML = `<table><thead><tr><th>Dia</th><th>Deep work</th><th>Sessões</th><th>Tarefas</th><th>Big 3</th><th>Score</th></tr></thead><tbody>${
            days.slice().reverse().map(d => `<tr><td>${fmtDateShort(d.date)} ${WEEKDAYS[weekdayOf(d.date)]}</td><td>${fmtMinutes(d.focusMin)}</td><td>${d.sessions}</td><td>${d.taskDone}/${d.taskTotal}</td><td>${d.mitDone}/${d.mitTotal}</td><td>${d.score}</td></tr>`).join('')
        }</tbody></table>`;

        // Flow Score + média móvel 7d
        const offset = allDays.length - days.length;
        const rolling = days.map((d, i) => {
            const idx = offset + i;
            return Math.round(avg(allDays.slice(Math.max(0, idx - 6), idx + 1).map(x => x.score)));
        });
        draw('chart-score', {
            type: 'line',
            data: {
                labels,
                datasets: [
                    { label: 'Flow Score', data: days.map(d => d.score), borderColor: C.violet, backgroundColor: C.violet, borderWidth: 2, pointRadius: n <= 30 ? 3 : 0, pointHoverRadius: 5, tension: 0.25 },
                    { label: 'Média 7 dias', data: rolling, borderColor: C.aqua, backgroundColor: C.aqua, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.35 },
                ],
            },
            options: chartBase({ scales: { ...chartBase().scales, y: { ...chartBase().scales.y, max: 100 } } }),
        });
        legend('legend-score', [['Flow Score', C.violet], ['Média 7 dias', C.aqua]]);

        renderHeatmap(allDays);
        renderRhythm(raw, dates, area);
        renderEisenhower(raw, dates, area);
        renderAreas(raw, dates);
        renderEnergy(days);
        renderEstimates(raw, dates, area);
        renderInsights(days, cur, prev, raw, dates, area, settings);
        renderGoalsSummary(raw.goals || []);
    }

    function scoreLabel(s) {
        if (s >= 80) return 'Excelente — estado de flow';
        if (s >= 60) return 'Bom — consistente';
        if (s >= 40) return 'Regular — espaço para crescer';
        if (s > 0) return 'Baixo — revise o plano';
        return 'Sem dados no período';
    }

    function renderHeatmap(allDays) {
        const el = document.getElementById('heatmap');
        const max = Math.max(...allDays.map(d => d.focusMin), 60);
        const first = allDays[0];
        const pad = weekdayOf(first.date);
        const cells = Array(pad).fill('<span class="hm-cell empty"></span>');
        allDays.forEach(d => {
            const lvl = d.focusMin === 0 ? 0 : Math.min(5, Math.ceil((d.focusMin / max) * 5));
            cells.push(`<span class="hm-cell" style="background:${HEAT[lvl]}" data-tip="${fmtDateShort(d.date)} ${WEEKDAYS[weekdayOf(d.date)]} · ${fmtMinutes(d.focusMin)} · score ${d.score}"></span>`);
        });
        el.innerHTML = cells.join('');
        document.getElementById('heatmap-legend').innerHTML = `<span class="muted small">menos</span>${HEAT.map(c => `<span class="hm-cell" style="background:${c}"></span>`).join('')}<span class="muted small">mais</span>`;
        const active = allDays.filter(d => d.focusMin > 0).length;
        document.getElementById('heatmap-sub').textContent = `${active} dias com deep work nos últimos 6 meses · ${fmtMinutes(sum(allDays, d => d.focusMin))} no total`;
    }

    function filteredFocus(raw, dates, area) {
        const set = new Set(dates);
        const taskById = Object.fromEntries(raw.tasks.map(t => [t.id, t]));
        return raw.sessions.filter(s => {
            if (s.mode !== 'focus' || !set.has(s.date)) return false;
            const a = sessionArea(s, taskById);
            s._area = a;
            s._task = s.task_id ? taskById[s.task_id] : null;
            return area === 'all' || a === area;
        });
    }

    function renderRhythm(raw, dates, area) {
        const sessions = filteredFocus(raw, dates, area);
        const hours = Array(24).fill(0);
        sessions.forEach(s => { const h = sessionStartHourBR(s); if (h !== null) hours[h] += s.duration_minutes; });
        const from = 5, to = 23;
        const hLabels = [], hData = [];
        for (let h = from; h <= to; h++) { hLabels.push(`${h}h`); hData.push(+(hours[h] / 60).toFixed(2)); }
        const peak = hData.indexOf(Math.max(...hData));
        draw('chart-hours', {
            type: 'bar',
            data: { labels: hLabels, datasets: [{ label: 'Deep work', data: hData, backgroundColor: hData.map((_, i) => i === peak && hData[i] > 0 ? C.accent : '#2f5d96'), borderRadius: 4, borderSkipped: 'start' }] },
            options: chartBase({
                plugins: { ...chartBase().plugins, tooltip: { ...chartBase().plugins.tooltip, callbacks: { label: c => ` ${fmtMinutes(c.raw * 60)} de foco` } } },
                scales: { ...chartBase().scales, y: { ...chartBase().scales.y, ticks: { ...chartBase().scales.y.ticks, callback: v => `${v}h` } } },
            }),
        });

        const wd = Array(7).fill(0), wdCount = Array(7).fill(0);
        dates.forEach(d => wdCount[weekdayOf(d)]++);
        sessions.forEach(s => { wd[weekdayOf(s.date)] += s.duration_minutes; });
        const wdAvg = wd.map((m, i) => wdCount[i] ? +(m / wdCount[i] / 60).toFixed(2) : 0);
        const order = [1, 2, 3, 4, 5, 6, 0];
        const best = Math.max(...wdAvg);
        draw('chart-weekday', {
            type: 'bar',
            data: { labels: order.map(i => WEEKDAYS[i]), datasets: [{ label: 'Média', data: order.map(i => wdAvg[i]), backgroundColor: order.map(i => wdAvg[i] === best && best > 0 ? C.accent : '#2f5d96'), borderRadius: 4, borderSkipped: 'start' }] },
            options: chartBase({
                plugins: { ...chartBase().plugins, tooltip: { ...chartBase().plugins.tooltip, callbacks: { label: c => ` média de ${fmtMinutes(c.raw * 60)} por dia` } } },
                scales: { ...chartBase().scales, y: { ...chartBase().scales.y, ticks: { ...chartBase().scales.y.ticks, callback: v => `${v}h` } } },
            }),
        });
    }

    function renderEisenhower(raw, dates, area) {
        const set = new Set(dates);
        const tasks = raw.tasks.filter(t => set.has(t.date) && (area === 'all' || (t.area || '') === area));
        const sessions = filteredFocus(raw, dates, area);
        const linked = sessions.filter(s => s._task);
        const totalLinked = sum(linked, s => s.duration_minutes);
        const rows = Object.values(QUADRANTS).map(Q => {
            const qt = tasks.filter(t => quadrantOf(t) === Q.key);
            const min = sum(linked.filter(s => quadrantOf(s._task) === Q.key), s => s.duration_minutes);
            return { Q, total: qt.length, done: qt.filter(t => t.completed).length, min, share: totalLinked ? min / totalLinked : 0 };
        });
        document.getElementById('eisenhower').innerHTML = rows.map(r => `
            <div class="eis-row">
                <div class="eis-label"><span class="dot" style="background:${r.Q.color}"></span><b>${r.Q.label}</b><span class="muted small">${r.Q.hint}</span></div>
                <div class="eis-bar"><div style="width:${r.share * 100}%;background:${r.Q.color}"></div></div>
                <div class="eis-nums"><b>${Math.round(r.share * 100)}%</b><span class="muted small">${fmtMinutes(r.min)} · ${r.done}/${r.total} tarefas</span></div>
            </div>`).join('') +
            `<p class="muted small mt">${totalLinked ? `Baseado em ${fmtMinutes(totalLinked)} de foco vinculado a tarefas.` : 'Vincule suas sessões a tarefas (campo “Focando em”) para ver onde seu tempo vai.'} Meta saudável: <b>Agendar ≥ 50%</b>.</p>`;
    }

    // Meta de foco × realizado por área, no período selecionado
    function renderAreas(raw, dates) {
        const mins = minutesByArea(raw, dates);
        const set = new Set(dates);
        const doneTasks = id => raw.tasks.filter(t => set.has(t.date) && (t.area || '') === id && t.completed).length;
        const n = dates.length;
        const perDay = a => a.target_minutes / (a.target_period === 'daily' ? 1 : a.target_period === 'weekly' ? 7 : 30.4);
        const ids = [...new Set([...FlowAreas.active().map(a => a.id), ...Object.keys(mins).filter(k => mins[k] > 0)])];
        const total = Object.values(mins).reduce((a, b) => a + b, 0) || 1;
        const rows = ids.map(id => {
            const a = areaInfo(id);
            const done = mins[id] || 0;
            const target = a.id ? Math.round(perDay(a) * n) : 0;
            return { a, done, target, pct: target ? done / target : null, share: done / total, tasks: doneTasks(id) };
        });
        document.getElementById('areas').innerHTML = `
            <div class="split-bar">${rows.filter(r => r.done).map(r => `<div style="flex:${r.done};background:${r.a.color}" title="${escapeHtml(r.a.name)} ${fmtMinutes(r.done)}"></div>`).join('') || '<div style="flex:1;background:#26262a"></div>'}</div>
            ${rows.map(r => `
            <div class="area-row">
                <div class="area-name"><i class="fas ${r.a.icon}" style="color:${r.a.color}"></i><b>${escapeHtml(r.a.name)}</b><span class="muted small">${Math.round(r.share * 100)}% do foco · ${r.tasks} tarefas</span></div>
                <div class="area-progress">
                    <div class="goal-bar"><div class="goal-fill" style="width:${Math.min(r.pct ?? 0, 1) * 100}%;background:${r.a.color}"></div></div>
                    <span class="small"><b>${fmtMinutes(r.done)}</b><span class="muted"> ${r.target ? `/ ${fmtMinutes(r.target)}` : '· sem meta'}</span></span>
                </div>
                <span class="status ${r.pct === null ? '' : r.pct >= 1 ? 'status-done' : r.pct >= 0.7 ? 'status-ok' : 'status-late'}">${r.pct === null ? '—' : Math.round(r.pct * 100) + '%'}</span>
            </div>`).join('')}
            <p class="muted small mt">Meta proporcional ao período (${n} dias). Ajuste as metas na aba Áreas.</p>`;
    }

    function renderEnergy(days) {
        const groups = [1, 2, 3, 4, 5].map(e => days.filter(d => d.review && +d.review.energy === e));
        const data = groups.map(g => g.length ? +(avg(g.map(d => d.focusMin)) / 60).toFixed(2) : 0);
        const counts = groups.map(g => g.length);
        const has = counts.some(c => c);
        document.getElementById('energy-empty').style.display = has ? 'none' : 'block';
        draw('chart-energy', {
            type: 'bar',
            data: { labels: ['1 · Esgotado', '2', '3', '4', '5 · Energizado'], datasets: [{ label: 'Deep work médio', data, backgroundColor: C.aqua, borderRadius: 4, borderSkipped: 'start' }] },
            options: chartBase({
                plugins: { ...chartBase().plugins, tooltip: { ...chartBase().plugins.tooltip, callbacks: { label: c => ` ${fmtMinutes(c.raw * 60)} em média · ${counts[c.dataIndex]} dias` } } },
                scales: { ...chartBase().scales, y: { ...chartBase().scales.y, ticks: { ...chartBase().scales.y.ticks, callback: v => `${v}h` } } },
            }),
        });
    }

    function renderEstimates(raw, dates, area) {
        const set = new Set(dates);
        const sessions = filteredFocus(raw, lastNDates(182), area);
        const count = {}, minutes = {};
        sessions.forEach(s => { if (s.task_id) { count[s.task_id] = (count[s.task_id] || 0) + 1; minutes[s.task_id] = (minutes[s.task_id] || 0) + s.duration_minutes; } });
        const done = raw.tasks.filter(t => t.completed && set.has(t.date) && count[t.id] && (area === 'all' || (t.area || '') === area));
        const el = document.getElementById('estimates');
        if (!done.length) {
            el.innerHTML = '<p class="empty">Conclua tarefas com sessões vinculadas para medir a precisão das suas estimativas.</p>';
        } else {
            const acc = avg(done.map(t => 1 - Math.abs(count[t.id] - (t.estimate || 1)) / Math.max(count[t.id], t.estimate || 1)));
            const bias = avg(done.map(t => (count[t.id] - (t.estimate || 1)) / (t.estimate || 1)));
            el.innerHTML = `<div class="big-num">${Math.round(acc * 100)}%</div>
                <p class="muted small">de precisão em ${done.length} tarefas. ${Math.abs(bias) < 0.1 ? 'Suas estimativas estão calibradas.' : bias > 0 ? `Você <b>subestima</b> em média ${Math.round(bias * 100)}% — reserve mais pomodoros.` : `Você <b>superestima</b> em média ${Math.round(-bias * 100)}%.`}</p>`;
        }
        // Top tarefas por tempo de foco
        const inRange = filteredFocus(raw, dates, area).filter(s => s._task);
        const agg = {};
        inRange.forEach(s => { agg[s.task_id] = agg[s.task_id] || { t: s._task, min: 0, n: 0 }; agg[s.task_id].min += s.duration_minutes; agg[s.task_id].n++; });
        const top = Object.values(agg).sort((a, b) => b.min - a.min).slice(0, 6);
        document.getElementById('top-tasks').innerHTML = top.length ? `<table><thead><tr><th>Tarefa</th><th>Quadrante</th><th>Foco</th><th>🍅</th></tr></thead><tbody>${top.map(r => `
            <tr><td class="ellipsis">${r.t.completed ? '<i class="fas fa-check text-good"></i> ' : ''}${escapeHtml(r.t.text)}</td>
            <td><span class="dot" style="background:${QUADRANTS[quadrantOf(r.t)].color}"></span>${QUADRANTS[quadrantOf(r.t)].label}</td>
            <td>${fmtMinutes(r.min)}</td><td>${r.n}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">Nenhuma sessão vinculada a tarefas no período.</p>';
    }

    function renderInsights(days, cur, prev, raw, dates, area, settings) {
        const out = [];
        const sessions = filteredFocus(raw, dates, area);
        if (!sessions.length && !cur.taskDone) {
            document.getElementById('insights-list').innerHTML = '<li><i class="fas fa-seedling"></i><span>Ainda não há dados neste período. Faça sua primeira sessão de deep work e defina o Big 3 de hoje.</span></li>';
            return;
        }
        // Janela de pico (2h)
        const hours = Array(24).fill(0);
        sessions.forEach(s => { const h = sessionStartHourBR(s); if (h !== null) hours[h] += s.duration_minutes; });
        let bestH = 0, bestV = 0;
        for (let h = 0; h < 23; h++) if (hours[h] + hours[h + 1] > bestV) { bestV = hours[h] + hours[h + 1]; bestH = h; }
        if (bestV > 0) out.push(['fa-clock', `Seu horário de pico é <b>${bestH}h–${bestH + 2}h</b> (${Math.round(bestV / sum(hours) * 100)}% do foco). Bloqueie essa janela para as tarefas do Big 3.`]);

        // Meta diária
        const hitDays = days.filter(d => d.focusMin >= settings.dailyDeepHours * 60).length;
        out.push(['fa-brain', `Você bateu a meta de ${settings.dailyDeepHours}h de deep work em <b>${hitDays} de ${days.length} dias</b>. Média: ${fmtMinutes(cur.focusMin / days.length)}/dia.`]);

        // Eisenhower
        const linked = sessions.filter(s => s._task);
        const tl = sum(linked, s => s.duration_minutes);
        if (tl > 0) {
            const q1 = sum(linked.filter(s => quadrantOf(s._task) === 'q1'), s => s.duration_minutes) / tl;
            const q2 = sum(linked.filter(s => quadrantOf(s._task) === 'q2'), s => s.duration_minutes) / tl;
            const q34 = 1 - q1 - q2;
            if (q1 > 0.4) out.push(['fa-fire-extinguisher', `<b>${Math.round(q1 * 100)}%</b> do foco foi em “Fazer agora”. Muito tempo apagando incêndio — antecipe tarefas importantes antes que virem urgentes.`]);
            else if (q2 >= 0.5) out.push(['fa-seedling', `<b>${Math.round(q2 * 100)}%</b> do foco foi em “Agendar” (importante, não urgente). É aqui que mora o progresso de longo prazo — continue.`]);
            else out.push(['fa-compass', `Só <b>${Math.round(q2 * 100)}%</b> do foco foi em “Agendar”. Reserve blocos fixos para o importante-não-urgente.`]);
            if (q34 > 0.25) out.push(['fa-hand', `<b>${Math.round(q34 * 100)}%</b> do foco foi em tarefas não importantes. Dá para delegar ou eliminar parte disso.`]);
        }

        // Planejamento do Big 3
        const active = days.filter(d => d.focusMin > 0 || d.taskTotal > 0);
        const planned = active.filter(d => d.mitTotal > 0).length;
        if (active.length) out.push(['fa-star', planned < active.length * 0.7
            ? `Você definiu o Big 3 em só <b>${planned} de ${active.length}</b> dias ativos. Dias sem Big 3 perdem até 30 pontos de Flow Score.`
            : `Big 3 definido em <b>${planned} de ${active.length}</b> dias ativos, com ${Math.round(cur.mitRate * 100)}% de conclusão.`]);

        // Energia
        const withE = days.filter(d => d.review && d.review.energy);
        const hi = withE.filter(d => d.review.energy >= 4), lo = withE.filter(d => d.review.energy <= 2);
        if (hi.length && lo.length) {
            const diff = avg(hi.map(d => d.focusMin)) - avg(lo.map(d => d.focusMin));
            out.push(['fa-bolt', `Em dias de energia alta você faz <b>${fmtMinutes(Math.abs(diff))} ${diff >= 0 ? 'a mais' : 'a menos'}</b> de deep work que em dias de energia baixa. Sono, treino e alimentação são parte do sistema.`]);
        }

        // Áreas atrás da meta
        if (area === 'all') {
            const mins = minutesByArea(raw, dates);
            const lag = FlowAreas.active().filter(a => a.target_minutes > 0).map(a => {
                const target = a.target_minutes / (a.target_period === 'daily' ? 1 : a.target_period === 'weekly' ? 7 : 30.4) * dates.length;
                return { a, pct: (mins[a.id] || 0) / target, missing: target - (mins[a.id] || 0) };
            }).sort((x, y) => x.pct - y.pct);
            if (lag.length && lag[0].pct < 0.8) out.push(['fa-scale-unbalanced', `<b>${escapeHtml(lag[0].a.name)}</b> está em ${Math.round(lag[0].pct * 100)}% da meta de foco — faltaram ${fmtMinutes(lag[0].missing)} no período.`]);
            else if (lag.length) out.push(['fa-scale-balanced', `Todas as áreas com meta estão acima de 80% do foco planejado. Equilíbrio em dia.`]);
        }

        // Shutdowns
        const reviews = days.filter(d => d.review).length;
        out.push(['fa-moon', reviews < days.length * 0.5
            ? `Shutdown feito em ${reviews} de ${days.length} dias. Fechar o dia (5 min) melhora o planejamento do dia seguinte.`
            : `Shutdown feito em <b>${reviews} de ${days.length}</b> dias. Ótimo hábito de reflexão.`]);

        // Tendência
        if (prev.focusMin > 0) {
            const ch = (cur.focusMin - prev.focusMin) / prev.focusMin;
            out.push([ch >= 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down', `Deep work ${ch >= 0 ? 'subiu' : 'caiu'} <b>${Math.abs(Math.round(ch * 100))}%</b> em relação ao período anterior.`]);
        }

        document.getElementById('insights-list').innerHTML = out.map(([icon, html]) => `<li><i class="fas ${icon}"></i><span>${html}</span></li>`).join('');
    }

    function renderGoalsSummary(goals) {
        const el = document.getElementById('goals-summary');
        const activeGoals = goals.filter(g => !goalPace(g).expired);
        if (!activeGoals.length) { el.innerHTML = '<p class="empty">Nenhuma meta ativa. Defina metas trimestrais na aba Metas.</p>'; return; }
        el.innerHTML = activeGoals.slice(0, 6).map(g => {
            const { pct, elapsed, status } = goalPace(g);
            return `<div class="goal-mini">
                <div class="goal-mini-top"><span class="ellipsis">${escapeHtml(g.title)}</span><span class="status status-${status.key}"><i class="fas ${status.icon}"></i>${Math.round(pct * 100)}%</span></div>
                <div class="goal-bar"><div class="goal-fill" style="width:${pct * 100}%"></div><div class="goal-marker" style="left:${elapsed * 100}%"></div></div>
            </div>`;
        }).join('');
    }

    function bind() {
        document.querySelectorAll('[data-range]').forEach(b => b.addEventListener('click', () => {
            document.querySelectorAll('[data-range]').forEach(x => x.classList.toggle('active', x === b));
            render();
        }));
        const af = document.getElementById('area-filter');
        af.addEventListener('change', render);
        document.addEventListener('flow:areas-changed', () => {
            const cur = af.value || 'all';
            af.innerHTML = '<option value="all">Todas as áreas</option>' + areaOptions(cur);
            af.value = [...af.options].some(o => o.value === cur) ? cur : 'all';
        });
        document.getElementById('refresh-analytics').addEventListener('click', () => load(true));
        if (typeof Chart !== 'undefined') {
            Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
            Chart.defaults.color = C.text;
        }
        // Tooltip do heatmap
        const tip = document.getElementById('hm-tip');
        document.getElementById('heatmap').addEventListener('mouseover', e => {
            const t = e.target.dataset.tip;
            if (!t) { tip.style.opacity = 0; return; }
            const r = e.target.getBoundingClientRect();
            tip.textContent = t;
            tip.style.left = `${r.left + r.width / 2}px`;
            tip.style.top = `${r.top - 8}px`;
            tip.style.opacity = 1;
        });
        document.getElementById('heatmap').addEventListener('mouseleave', () => { tip.style.opacity = 0; });
    }

    return { load, bind, invalidate() { rawFetchedAt = 0; }, fetchRaw };
})();

window.Analytics = Analytics;
