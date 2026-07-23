// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DASHBOARD DE TRACKEAMENTO — Login, filtros de período, métricas
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

document.addEventListener('DOMContentLoaded', function () {
  const loginView = document.getElementById('loginView');
  const dashView = document.getElementById('dashView');
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  const logoutBtn = document.getElementById('logoutBtn');

  const periodFilter = document.getElementById('periodFilter');
  const customRange = document.getElementById('customRange');
  const dateFrom = document.getElementById('dateFrom');
  const dateTo = document.getElementById('dateTo');
  const applyCustomRange = document.getElementById('applyCustomRange');

  const chartBars = document.getElementById('chartBars');
  const sourceList = document.getElementById('sourceList');
  const recentLeadsBody = document.getElementById('recentLeadsBody');
  const emptyState = document.getElementById('emptyState');

  let currentPeriod = '7d';

  const STATUS_LABELS = {
    novo: 'Novo',
    em_contato: 'Em contato',
    qualificado: 'Qualificado',
    fechado: 'Fechado',
    descartado: 'Descartado',
  };

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function toSqlDate(date, endOfDay) {
    const y = date.getFullYear();
    const m = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    return `${y}-${m}-${d} ${endOfDay ? '23:59:59' : '00:00:00'}`;
  }

  function getRangeForPeriod(period) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (period === 'today') {
      return { from: toSqlDate(today, false), to: toSqlDate(today, true) };
    }
    if (period === '7d') {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      return { from: toSqlDate(start, false), to: toSqlDate(today, true) };
    }
    if (period === 'month') {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: toSqlDate(start, false), to: toSqlDate(today, true) };
    }
    if (period === 'all') {
      return { from: null, to: null };
    }
    return null;
  }

  function formatDateShort(dateStr) {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}`;
  }

  function formatDateTime(isoLike) {
    if (!isoLike) return '—';
    const d = new Date(isoLike.replace(' ', 'T') + 'Z');
    if (isNaN(d.getTime())) return isoLike;
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }

  function formatCurrency(value) {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function renderChart(series) {
    if (!series.length) {
      chartBars.innerHTML = '<div class="chart-empty">Sem dados no período selecionado.</div>';
      return;
    }
    const max = Math.max(...series.map((s) => s.count), 1);
    chartBars.innerHTML = series
      .map((point) => {
        const heightPct = Math.max((point.count / max) * 100, 3);
        return `
          <div class="chart-bar-col">
            <div class="chart-bar" style="height:${heightPct}%" title="${point.count} leads"></div>
            <div class="chart-bar-label">${formatDateShort(point.date)}</div>
          </div>
        `;
      })
      .join('');
  }

  function renderSources(sources) {
    if (!sources.length) {
      sourceList.innerHTML = '<div class="chart-empty">Sem dados no período selecionado.</div>';
      return;
    }
    sourceList.innerHTML = sources
      .map((s) => {
        const cls = s.source === 'Google Ads' ? 'google' : s.source === 'Meta Ads' ? 'meta' : '';
        return `
          <div class="source-row">
            <div class="source-row-head">
              <span class="name">${escapeHtml(s.source)}</span>
              <span class="count">${s.count} (${s.percent}%)</span>
            </div>
            <div class="source-bar-bg">
              <div class="source-bar-fill ${cls}" style="width:${s.percent}%"></div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  function renderRecentLeads(leads) {
    emptyState.hidden = leads.length > 0;
    recentLeadsBody.innerHTML = leads
      .map(
        (lead) => `
          <tr>
            <td>${escapeHtml(lead.nome)}</td>
            <td>${escapeHtml(lead.segmento || '—')}</td>
            <td>${escapeHtml(lead.source)}</td>
            <td><span class="status-badge ${lead.status}">${STATUS_LABELS[lead.status] || lead.status}</span></td>
            <td>${lead.valor_fechado ? formatCurrency(lead.valor_fechado) : '—'}</td>
            <td>${formatDateTime(lead.created_at)}</td>
          </tr>
        `
      )
      .join('');
  }

  async function loadDashboard(range) {
    const params = new URLSearchParams();
    if (range && range.from && range.to) {
      params.set('from', range.from);
      params.set('to', range.to);
    }

    const response = await fetch(`/api/dashboard/summary?${params.toString()}`);
    if (response.status === 401) {
      showLogin();
      return;
    }
    loginView.hidden = true;
    dashView.hidden = false;

    const data = await response.json();

    document.getElementById('totalLeads').textContent = data.totals.totalLeads;
    document.getElementById('totalFechados').textContent = data.totals.totalFechados;
    document.getElementById('totalFechado').textContent = formatCurrency(data.totals.totalFechado);
    document.getElementById('taxaConversao').textContent = `${data.totals.taxaConversao}%`;

    renderChart(data.series);
    renderSources(data.sources);
    renderRecentLeads(data.recentLeads);
  }

  function refresh() {
    if (currentPeriod === 'custom') {
      if (!dateFrom.value || !dateTo.value) return;
      const from = `${dateFrom.value} 00:00:00`;
      const to = `${dateTo.value} 23:59:59`;
      loadDashboard({ from, to });
      return;
    }
    loadDashboard(getRangeForPeriod(currentPeriod));
  }

  periodFilter.querySelectorAll('.period-btn').forEach((btn) => {
    btn.addEventListener('click', function () {
      periodFilter.querySelectorAll('.period-btn').forEach((b) => b.classList.remove('active'));
      this.classList.add('active');
      currentPeriod = this.dataset.period;
      customRange.classList.toggle('visible', currentPeriod === 'custom');
      if (currentPeriod !== 'custom') refresh();
    });
  });

  applyCustomRange.addEventListener('click', refresh);

  function showLogin() {
    loginView.hidden = false;
    dashView.hidden = true;
  }

  loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    const password = document.getElementById('password').value;
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        loginError.textContent = data.error || 'Senha inválida.';
        loginError.classList.add('visible');
        submitBtn.disabled = false;
        return;
      }

      loginError.classList.remove('visible');
      loginForm.reset();
      refresh();
    } catch (err) {
      loginError.textContent = 'Erro de conexão. Tente novamente.';
      loginError.classList.add('visible');
    }
    submitBtn.disabled = false;
  });

  logoutBtn.addEventListener('click', async function () {
    await fetch('/api/auth/logout', { method: 'POST' });
    showLogin();
  });

  loadDashboard(getRangeForPeriod(currentPeriod)).catch(() => showLogin());
});
