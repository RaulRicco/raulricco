// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CRM DE LEADS — Login, board Kanban, drag-and-drop, tracking de venda fechada
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

document.addEventListener('DOMContentLoaded', function () {
  const loginView = document.getElementById('loginView');
  const crmView = document.getElementById('crmView');
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  const logoutBtn = document.getElementById('logoutBtn');
  const kanbanBoard = document.getElementById('kanbanBoard');
  const totalFechadoEl = document.getElementById('totalFechado');

  const STATUSES = ['novo', 'em_contato', 'qualificado', 'fechado', 'descartado'];
  let leadsById = {};

  function formatDate(isoLike) {
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

  function renderBoard(leads) {
    leadsById = {};
    const byStatus = { novo: [], em_contato: [], qualificado: [], fechado: [], descartado: [] };

    leads.forEach((lead) => {
      leadsById[lead.id] = lead;
      if (byStatus[lead.status]) byStatus[lead.status].push(lead);
    });

    let totalFechado = 0;

    STATUSES.forEach((status) => {
      const container = kanbanBoard.querySelector(`[data-cards="${status}"]`);
      const countEl = kanbanBoard.querySelector(`[data-count="${status}"]`);
      const items = byStatus[status];
      countEl.textContent = items.length;

      if (items.length === 0) {
        container.innerHTML = '<div class="empty-column">Nenhum lead</div>';
        return;
      }

      container.innerHTML = items
        .map((lead) => {
          if (lead.status === 'fechado') totalFechado += Number(lead.valor_fechado || 0);
          const digits = (lead.telefone || '').replace(/\D/g, '');
          const waLink = digits ? `https://wa.me/55${digits}` : '#';
          const valueLine =
            lead.status === 'fechado' && lead.valor_fechado
              ? `<div class="kanban-card-value">${formatCurrency(lead.valor_fechado)}</div>`
              : '';

          return `
            <div class="kanban-card" draggable="true" data-id="${lead.id}">
              <div class="kanban-card-name">${escapeHtml(lead.nome)}</div>
              <div class="kanban-card-meta">${escapeHtml(lead.segmento || '—')}</div>
              <div class="kanban-card-meta">${escapeHtml(lead.quanto_disposto_investir || '—')}</div>
              <div class="kanban-card-meta">${formatDate(lead.created_at)}</div>
              ${valueLine}
              <div class="kanban-card-links">
                <a href="${waLink}" target="_blank" rel="noopener noreferrer">WhatsApp</a>
                <a href="mailto:${escapeHtml(lead.email)}">Email</a>
              </div>
            </div>
          `;
        })
        .join('');
    });

    totalFechadoEl.textContent = formatCurrency(totalFechado);
    attachDragEvents();
  }

  function attachDragEvents() {
    kanbanBoard.querySelectorAll('.kanban-card').forEach((card) => {
      card.addEventListener('dragstart', function () {
        this.classList.add('dragging');
        this.dataset.fromStatus = this.closest('.kanban-column').dataset.status;
      });
      card.addEventListener('dragend', function () {
        this.classList.remove('dragging');
      });
    });

    kanbanBoard.querySelectorAll('.kanban-column').forEach((column) => {
      column.addEventListener('dragover', function (e) {
        e.preventDefault();
        this.classList.add('drag-over');
      });
      column.addEventListener('dragleave', function () {
        this.classList.remove('drag-over');
      });
      column.addEventListener('drop', async function (e) {
        e.preventDefault();
        this.classList.remove('drag-over');
        const dragging = kanbanBoard.querySelector('.kanban-card.dragging');
        if (!dragging) return;

        const leadId = dragging.dataset.id;
        const newStatus = this.dataset.status;
        const fromStatus = dragging.dataset.fromStatus;
        if (newStatus === fromStatus) return;

        await moveLead(leadId, newStatus);
      });
    });
  }

  async function moveLead(leadId, newStatus) {
    const lead = leadsById[leadId];
    const body = { status: newStatus };

    if (newStatus === 'fechado') {
      const input = prompt(`Valor fechado com ${lead ? lead.nome : 'o cliente'} (R$):`);
      if (input === null) return; // usuário cancelou
      const valor = Number(String(input).replace(',', '.'));
      if (!valor || valor <= 0) {
        alert('Informe um valor válido, maior que zero.');
        return;
      }
      body.valor_fechado = valor;
    }

    const response = await fetch(`/api/leads/${leadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok || !data || !data.ok) {
      alert((data && data.error) || 'Não foi possível atualizar o lead.');
      return;
    }

    if (newStatus === 'fechado') {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        event: 'venda_fechada',
        lead_id: leadId,
        valor: body.valor_fechado,
        currency: 'BRL',
        nome: lead ? lead.nome : undefined,
        segmento: lead ? lead.segmento : undefined,
        utm_source: lead ? lead.utm_source : undefined,
        utm_campaign: lead ? lead.utm_campaign : undefined,
        gclid: lead ? lead.gclid : undefined,
        fbclid: lead ? lead.fbclid : undefined,
      });
      if (typeof gtag !== 'undefined') {
        gtag('event', 'purchase', {
          transaction_id: leadId,
          value: body.valor_fechado,
          currency: 'BRL',
        });
      }
      if (typeof fbq !== 'undefined') {
        fbq('track', 'Purchase', { value: body.valor_fechado, currency: 'BRL' });
      }
    }

    loadLeads();
  }

  async function loadLeads() {
    const response = await fetch('/api/leads');
    if (response.status === 401) {
      showLogin();
      return;
    }
    loginView.hidden = true;
    crmView.hidden = false;
    const data = await response.json();
    renderBoard(data.leads || []);
  }

  function showLogin() {
    loginView.hidden = false;
    crmView.hidden = true;
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
      loadLeads();
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

  loadLeads().catch(() => showLogin());
});
