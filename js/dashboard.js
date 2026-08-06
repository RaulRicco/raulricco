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

  const leadsPrev = document.getElementById('leadsPrev');
  const leadsNext = document.getElementById('leadsNext');
  const leadsPagerLabel = document.getElementById('leadsPagerLabel');
  const chartPrev = document.getElementById('chartPrev');
  const chartNext = document.getElementById('chartNext');
  const chartPagerLabel = document.getElementById('chartPagerLabel');

  const PAGE_SIZE = 10;
  let currentPeriod = '7d';
  let allLeads = [];
  let allSeries = [];
  let leadsPage = 0;
  let chartPage = 0;

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

  function renderChart() {
    if (!allSeries.length) {
      chartBars.innerHTML = '<div class="chart-empty">Sem dados no período selecionado.</div>';
      chartPagerLabel.textContent = '';
      chartPrev.disabled = true;
      chartNext.disabled = true;
      return;
    }

    const totalPages = Math.max(Math.ceil(allSeries.length / PAGE_SIZE), 1);
    chartPage = Math.min(chartPage, totalPages - 1);
    // Página 0 = dias mais recentes; navegar para frente volta no tempo.
    const descending = [...allSeries].reverse();
    const start = chartPage * PAGE_SIZE;
    const pageSeries = descending.slice(start, start + PAGE_SIZE).reverse();

    const max = Math.max(...pageSeries.map((s) => s.count), 1);
    chartBars.innerHTML = pageSeries
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

    chartPagerLabel.textContent = `${chartPage + 1}/${totalPages}`;
    chartPrev.disabled = chartPage === 0;
    chartNext.disabled = chartPage >= totalPages - 1;
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

  function renderRecentLeads() {
    emptyState.hidden = allLeads.length > 0;

    const totalPages = Math.max(Math.ceil(allLeads.length / PAGE_SIZE), 1);
    leadsPage = Math.min(leadsPage, totalPages - 1);
    const start = leadsPage * PAGE_SIZE;
    const pageLeads = allLeads.slice(start, start + PAGE_SIZE);

    recentLeadsBody.innerHTML = pageLeads
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

    leadsPagerLabel.textContent = allLeads.length ? `${leadsPage + 1}/${totalPages}` : '';
    leadsPrev.disabled = leadsPage === 0;
    leadsNext.disabled = leadsPage >= totalPages - 1;
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

    allSeries = data.series;
    allLeads = data.recentLeads;
    chartPage = 0;
    leadsPage = 0;

    renderChart();
    renderSources(data.sources);
    renderRecentLeads();
  }

  chartPrev.addEventListener('click', function () {
    if (chartPage > 0) {
      chartPage -= 1;
      renderChart();
    }
  });
  chartNext.addEventListener('click', function () {
    chartPage += 1;
    renderChart();
  });
  leadsPrev.addEventListener('click', function () {
    if (leadsPage > 0) {
      leadsPage -= 1;
      renderRecentLeads();
    }
  });
  leadsNext.addEventListener('click', function () {
    leadsPage += 1;
    renderRecentLeads();
  });

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
