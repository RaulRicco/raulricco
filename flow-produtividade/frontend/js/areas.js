// Áreas — cada área tem uma meta de foco (por dia/semana/mês) e um contador do realizado
const AreasUI = (() => {
    const $ = id => document.getElementById(id);
    let editing = null;      // área em edição (null = nova)
    let pick = { color: AREA_COLORS[0], icon: AREA_ICONS[0] };

    const perDay = a => a.target_minutes / (a.target_period === 'daily' ? 1 : a.target_period === 'weekly' ? 7 : 30.4);

    // Progresso do período atual de uma área
    function progress(a, raw) {
        const dates = periodDates(a.target_period);
        const done = minutesByArea(raw, dates)[a.id] || 0;
        const today = brDate();
        const daysLeft = dates.filter(d => d >= today).length;
        const missing = Math.max(0, a.target_minutes - done);
        return {
            done, target: a.target_minutes, missing, daysLeft,
            pct: a.target_minutes ? done / a.target_minutes : null,
            daily: a.target_period === 'daily',
            pace: daysLeft ? missing / daysLeft : missing,
            // onde deveria estar hoje (proporcional aos dias já passados, contando hoje pela metade)
            expected: a.target_minutes * Math.min(1, (dates.filter(d => d < today).length + 0.5) / dates.length),
        };
    }

    // Histórico: últimos N períodos
    function history(a, raw, n) {
        const out = [];
        for (let i = n - 1; i >= 0; i--) {
            const dates = periodDates(a.target_period, i);
            out.push({ label: a.target_period === 'monthly' ? dates[0].slice(5, 7) + '/' + dates[0].slice(2, 4) : fmtDateShort(dates[0]), min: minutesByArea(raw, dates)[a.id] || 0, current: i === 0 });
        }
        return out;
    }

    function statusOf(p) {
        if (p.pct === null) return { cls: '', label: 'Sem meta' };
        if (p.pct >= 1) return { cls: 'status-done', label: 'Meta batida' };
        if (p.daily) return { cls: '', label: 'Em aberto' };
        if (p.done >= p.expected * 0.9) return { cls: 'status-ok', label: 'No ritmo' };
        return { cls: 'status-late', label: 'Atrasada' };
    }

    // ---------- Página Áreas ----------
    async function render() {
        const wrap = $('areas-grid');
        let raw;
        try { raw = await Analytics.fetchRaw(); } catch (e) { wrap.innerHTML = '<p class="empty">Não foi possível carregar.</p>'; return; }
        const showArchived = $('show-archived').checked;
        const list = FlowAreas.list.filter(a => showArchived || !a.archived);
        const RING = 2 * Math.PI * 34;
        wrap.innerHTML = list.map(a => {
            const p = progress(a, raw);
            const st = statusOf(p);
            const hist = history(a, raw, a.target_period === 'daily' ? 14 : 8);
            const max = Math.max(a.target_minutes, ...hist.map(h => h.min), 30);
            const hits = hist.filter(h => !h.current && a.target_minutes && h.min >= a.target_minutes).length;
            const total30 = minutesByArea(raw, lastNDates(30))[a.id] || 0;
            return `
            <div class="card area-card ${a.archived ? 'archived' : ''}" style="--area:${a.color}">
                <div class="card-head">
                    <h3><span class="area-icon"><i class="fas ${a.icon}"></i></span>${escapeHtml(a.name)}</h3>
                    <span style="display:flex;gap:2px">
                        <button class="icon-btn" data-edit="${escapeHtml(a.id)}" title="Editar"><i class="fas fa-pen"></i></button>
                        <button class="icon-btn" data-archive="${escapeHtml(a.id)}" title="${a.archived ? 'Restaurar' : 'Arquivar'}"><i class="fas ${a.archived ? 'fa-box-open' : 'fa-box-archive'}"></i></button>
                    </span>
                </div>
                <div class="area-counter">
                    <svg width="84" height="84" viewBox="0 0 84 84"><circle cx="42" cy="42" r="34" fill="none" stroke="#2b2b30" stroke-width="8"/>
                        <circle cx="42" cy="42" r="34" fill="none" stroke="${a.color}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${RING}" stroke-dashoffset="${RING * (1 - Math.min(p.pct ?? 0, 1))}"/></svg>
                    <div>
                        <div class="muted small">${a.target_period === 'monthly' ? 'Este mês' : a.target_period === 'daily' ? 'Hoje' : 'Esta semana'}</div>
                        <div class="counter-big">${fmtMinutes(p.done)}${a.target_minutes ? `<small> / ${fmtMinutes(a.target_minutes)}</small>` : ''}</div>
                        <span class="status ${st.cls}">${p.pct === null ? st.label : `${Math.round(p.pct * 100)}% · ${st.label}`}</span>
                    </div>
                </div>
                <p class="muted small area-pace">${!a.target_minutes ? 'Defina uma meta de foco para acompanhar o ritmo.'
                    : p.missing === 0 ? 'Meta do período concluída. Tudo que vier agora é bônus.'
                    : a.target_period === 'daily' ? `Faltam <b>${fmtMinutes(p.missing)}</b> hoje.`
                    : p.daysLeft <= 1 ? `Faltam <b>${fmtMinutes(p.missing)}</b> — último dia do período.`
                    : `Faltam <b>${fmtMinutes(p.missing)}</b> · ritmo necessário <b>${fmtMinutes(p.pace)}/dia</b> nos ${p.daysLeft} dias restantes.`}</p>
                <div class="hist" title="Últimos períodos (linha = meta)">
                    ${a.target_minutes ? `<span class="hist-target" style="bottom:${a.target_minutes / max * 100}%"></span>` : ''}
                    ${hist.map(h => `<span class="hist-bar ${h.current ? 'cur' : ''}" style="height:${Math.max(h.min / max * 100, h.min ? 4 : 0)}%" data-tip="${h.label}: ${fmtMinutes(h.min)}"></span>`).join('')}
                </div>
                <div class="area-stats">
                    <span><b>${fmtMinutes(total30)}</b><span class="muted small">últimos 30 dias</span></span>
                    <span><b>${a.target_minutes ? `${hits}/${hist.length - 1}` : '—'}</b><span class="muted small">períodos com meta batida</span></span>
                </div>
                ${a.archived ? '' : `<div class="area-actions">
                    <button class="btn" data-start="${escapeHtml(a.id)}"><i class="fas fa-stopwatch"></i>Iniciar contador</button>
                    <button class="btn ghost" data-log="${escapeHtml(a.id)}"><i class="fas fa-plus"></i>Lançar tempo</button>
                </div>`}
            </div>`;
        }).join('') + `<button class="card area-new" id="area-new-card"><i class="fas fa-plus"></i><b>Nova área</b><span class="muted small">Ex.: Clientes, Saúde, Estudos, Família</span></button>`;

        wrap.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openEditor(FlowAreas.list.find(a => a.id === b.dataset.edit))));
        wrap.querySelectorAll('[data-archive]').forEach(b => b.addEventListener('click', () => toggleArchive(b.dataset.archive)));
        wrap.querySelectorAll('[data-start]').forEach(b => b.addEventListener('click', () => {
            go('today');
            document.dispatchEvent(new CustomEvent('flow:start-area', { detail: b.dataset.start }));
            document.getElementById('timer-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }));
        wrap.querySelectorAll('[data-log]').forEach(b => b.addEventListener('click', () => openLog(b.dataset.log)));
        $('area-new-card').addEventListener('click', () => openEditor(null));
    }

    // Card "Foco por área" na tela Hoje
    function renderToday(raw) {
        const el = $('today-areas');
        if (!el) return;
        const list = FlowAreas.active();
        if (!list.length) { el.innerHTML = '<p class="empty">Crie suas áreas na aba Áreas.</p>'; return; }
        el.innerHTML = list.map(a => {
            const p = progress(a, raw);
            const st = statusOf(p);
            return `<div class="ta-row">
                <div class="ta-top"><span><i class="fas ${a.icon}" style="color:${a.color}"></i> ${escapeHtml(a.name)}</span>
                <span class="small"><b>${fmtMinutes(p.done)}</b><span class="muted">${a.target_minutes ? ` / ${fmtMinutes(a.target_minutes)} ${PERIOD_LABEL[a.target_period]}` : ''}</span></span></div>
                <div class="goal-bar"><div class="goal-fill" style="width:${Math.min(p.pct ?? 0, 1) * 100}%;background:${a.color}"></div>${a.target_minutes && a.target_period !== 'daily' ? `<div class="goal-marker" style="left:${Math.min(p.expected / a.target_minutes, 1) * 100}%"></div>` : ''}</div>
                ${a.target_minutes ? `<div class="muted small ta-foot"><span class="status ${st.cls}">${st.label}</span>${p.missing ? `faltam ${fmtMinutes(p.missing)}${a.target_period !== 'daily' && p.daysLeft > 1 ? ` · ${fmtMinutes(p.pace)}/dia` : a.target_period !== 'daily' ? ' · último dia' : ''}` : 'meta batida ✓'}</div>` : ''}
            </div>`;
        }).join('');
    }

    // ---------- Editor de área ----------
    function openEditor(area) {
        editing = area || null;
        $('area-modal-title').textContent = area ? 'Editar área' : 'Nova área';
        $('area-name').value = area ? area.name : '';
        const usedColors = FlowAreas.active().map(a => a.color);
        pick.color = area ? area.color : (AREA_COLORS.find(c => !usedColors.includes(c)) || AREA_COLORS[0]);
        pick.icon = area ? area.icon : 'fa-circle';
        const mins = area ? area.target_minutes : 300;
        $('area-target-h').value = Math.floor(mins / 60);
        $('area-target-m').value = mins % 60;
        $('area-period').value = area ? area.target_period : 'weekly';
        paintPickers();
        $('area-modal').classList.add('active');
        setTimeout(() => $('area-name').focus(), 50);
    }

    function paintPickers() {
        $('area-colors').innerHTML = AREA_COLORS.map(c => `<button type="button" class="swatch ${c === pick.color ? 'on' : ''}" style="background:${c}" data-color="${c}" aria-label="Cor ${c}"></button>`).join('');
        $('area-icons').innerHTML = ['fa-circle', ...AREA_ICONS].map(i => `<button type="button" class="icon-pick ${i === pick.icon ? 'on' : ''}" data-icon="${i}" style="${i === pick.icon ? `color:${pick.color}` : ''}"><i class="fas ${i}"></i></button>`).join('');
        $('area-colors').querySelectorAll('[data-color]').forEach(b => b.addEventListener('click', () => { pick.color = b.dataset.color; paintPickers(); }));
        $('area-icons').querySelectorAll('[data-icon]').forEach(b => b.addEventListener('click', () => { pick.icon = b.dataset.icon; paintPickers(); }));
    }

    async function saveArea() {
        const name = $('area-name').value.trim();
        if (!name) { $('area-name').focus(); return; }
        const body = {
            name, color: pick.color, icon: pick.icon, target_period: $('area-period').value,
            target_minutes: (parseInt($('area-target-h').value) || 0) * 60 + (parseInt($('area-target-m').value) || 0),
        };
        const res = await apiRequest(editing ? `${FLOW_API}/areas/${encodeURIComponent(editing.id)}` : `${FLOW_API}/areas`, {
            method: editing ? 'PATCH' : 'POST', body: JSON.stringify(body),
        });
        if (!res || !res.ok) { toast('Não foi possível salvar a área.'); return; }
        $('area-modal').classList.remove('active');
        toast(editing ? 'Área atualizada.' : `Área “${name}” criada.`);
        await refresh();
    }

    async function toggleArchive(id) {
        const a = FlowAreas.list.find(x => x.id === id);
        if (!a) return;
        if (!a.archived && !confirm(`Arquivar “${a.name}”? O histórico é mantido e você pode restaurar depois.`)) return;
        const res = await apiRequest(`${FLOW_API}/areas/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ archived: !a.archived }) });
        if (res && res.ok) await refresh();
    }

    // ---------- Lançamento manual de tempo ----------
    function openLog(areaId) {
        $('log-area').innerHTML = areaOptions(areaId);
        $('log-date').value = brDate();
        $('log-date').max = brDate();
        $('log-h').value = 1;
        $('log-m').value = 0;
        $('log-modal').classList.add('active');
    }

    async function saveLog() {
        const minutes = (parseInt($('log-h').value) || 0) * 60 + (parseInt($('log-m').value) || 0);
        if (minutes < 1 || minutes > 720) { toast('Informe entre 1 minuto e 12 horas.'); return; }
        const res = await apiRequest(`${FLOW_API}/sessions`, {
            method: 'POST',
            body: JSON.stringify({ mode: 'focus', duration_minutes: minutes, date: $('log-date').value || brDate(), area: $('log-area').value }),
        });
        if (!res || !res.ok) { toast('Não foi possível lançar o tempo.'); return; }
        $('log-modal').classList.remove('active');
        toast(`${fmtMinutes(minutes)} lançados em ${areaInfo($('log-area').value).name}.`);
        Analytics.invalidate();
        document.dispatchEvent(new CustomEvent('flow:session-logged', { detail: { mode: 'manual' } }));
        if ($('section-areas').classList.contains('active')) render();
    }

    async function refresh() {
        Analytics.invalidate();
        await FlowAreas.load();
        if ($('section-areas').classList.contains('active')) render();
    }

    function bind() {
        const close = id => () => $(id).classList.remove('active');
        ['area-modal', 'log-modal'].forEach(id => $(id).addEventListener('click', e => { if (e.target === $(id)) close(id)(); }));
        $('close-area-modal').addEventListener('click', close('area-modal'));
        $('cancel-area').addEventListener('click', close('area-modal'));
        $('save-area').addEventListener('click', saveArea);
        $('area-name').addEventListener('keydown', e => { if (e.key === 'Enter') saveArea(); });
        $('close-log-modal').addEventListener('click', close('log-modal'));
        $('cancel-log').addEventListener('click', close('log-modal'));
        $('save-log').addEventListener('click', saveLog);
        $('new-area-btn').addEventListener('click', () => openEditor(null));
        $('show-archived').addEventListener('change', render);
        $('manual-log-btn').addEventListener('click', () => openLog($('timer-area').value || FlowAreas.active()[0]?.id));
        document.addEventListener('flow:areas-changed', () => { if ($('section-areas').classList.contains('active')) render(); });
        // Tooltip das barras de histórico
        const tip = $('hm-tip');
        $('areas-grid').addEventListener('mouseover', e => {
            const t = e.target.dataset.tip;
            if (!t) { tip.style.opacity = 0; return; }
            const r = e.target.getBoundingClientRect();
            tip.textContent = t; tip.style.left = `${r.left + r.width / 2}px`; tip.style.top = `${r.top - 8}px`; tip.style.opacity = 1;
        });
        $('areas-grid').addEventListener('mouseleave', () => { tip.style.opacity = 0; });
    }

    return { bind, render, renderToday, openEditor };
})();

window.AreasUI = AreasUI;
