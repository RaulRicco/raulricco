// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CRM DE LEADS — Login, listagem, mudança de status
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

document.addEventListener('DOMContentLoaded', function () {
  const loginView = document.getElementById('loginView');
  const crmView = document.getElementById('crmView');
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  const leadsBody = document.getElementById('leadsBody');
  const emptyState = document.getElementById('emptyState');
  const filters = document.getElementById('filters');
  const logoutBtn = document.getElementById('logoutBtn');

  let currentStatus = '';

  const STATUS_LABELS = {
    novo: 'Novo',
    em_contato: 'Em contato',
    qualificado: 'Qualificado',
    descartado: 'Descartado',
  };

  function formatDate(isoLike) {
    if (!isoLike) return '—';
    const d = new Date(isoLike.replace(' ', 'T') + 'Z');
    if (isNaN(d.getTime())) return isoLike;
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }

  function renderLeads(leads) {
    leadsBody.innerHTML = '';
    emptyState.hidden = leads.length > 0;

    leads.forEach((lead) => {
      const tr = document.createElement('tr');

      const digits = (lead.telefone || '').replace(/\D/g, '');
      const waLink = digits ? `https://wa.me/55${digits}` : '#';

      tr.innerHTML = `
        <td>${escapeHtml(lead.nome)}</td>
        <td>
          <div class="quick-links">
            <a href="${waLink}" target="_blank" rel="noopener noreferrer">WhatsApp</a>
            <a href="mailto:${escapeHtml(lead.email)}">${escapeHtml(lead.email)}</a>
          </div>
        </td>
        <td>${escapeHtml(lead.segmento || '—')}</td>
        <td>${lead.ja_investe_trafego === 'sim' ? 'Sim' : lead.ja_investe_trafego === 'nao' ? 'Não' : '—'}</td>
        <td>${escapeHtml(lead.quanto_disposto_investir || '—')}</td>
        <td>
          <select class="status-select" data-id="${lead.id}">
            ${Object.entries(STATUS_LABELS)
              .map(
                ([value, label]) =>
                  `<option value="${value}" ${lead.status === value ? 'selected' : ''}>${label}</option>`
              )
              .join('')}
          </select>
        </td>
        <td>${formatDate(lead.created_at)}</td>
      `;
      leadsBody.appendChild(tr);
    });

    leadsBody.querySelectorAll('.status-select').forEach((select) => {
      select.addEventListener('change', async function () {
        const id = this.dataset.id;
        const status = this.value;
        await fetch(`/api/leads/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        });
      });
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  async function loadLeads() {
    const url = currentStatus ? `/api/leads?status=${encodeURIComponent(currentStatus)}` : '/api/leads';
    const response = await fetch(url);
    if (response.status === 401) {
      showLogin();
      return;
    }
    loginView.hidden = true;
    crmView.hidden = false;
    const data = await response.json();
    renderLeads(data.leads || []);
  }

  function showLogin() {
    loginView.hidden = false;
    crmView.hidden = true;
  }

  function showCrm() {
    loadLeads();
  }

  filters.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', function () {
      filters.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
      this.classList.add('active');
      currentStatus = this.dataset.status;
      loadLeads();
    });
  });

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
      showCrm();
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

  // Tenta carregar leads direto; se 401, mostra login
  loadLeads().catch(() => showLogin());
});
