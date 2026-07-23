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

  const leadModalOverlay = document.getElementById('leadModalOverlay');
  const leadModalClose = document.getElementById('leadModalClose');
  const leadModalNotesList = document.getElementById('leadModalNotesList');
  const leadModalSaveStatus = document.getElementById('leadModalSaveStatus');
  const noteForm = document.getElementById('noteForm');
  const noteText = document.getElementById('noteText');

  const STATUSES = ['novo', 'em_contato', 'qualificado', 'fechado', 'descartado'];
  let leadsById = {};
  let openLeadId = null;

  function detectSource(lead) {
    if (lead.gclid || lead.utm_source === 'google') return { label: 'Google Ads', className: 'source-google' };
    if (lead.fbclid || lead.utm_source === 'facebook' || lead.utm_source === 'instagram' || lead.utm_source === 'meta') {
      return { label: 'Meta Ads', className: 'source-meta' };
    }
    if (lead.utm_source) return { label: lead.utm_source, className: '' };
    return { label: 'Direto', className: 'source-direto' };
  }

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
          const source = detectSource(lead);

          return `
            <div class="kanban-card" draggable="true" data-id="${lead.id}">
              <span class="source-tag ${source.className}">${escapeHtml(source.label)}</span>
              <div class="kanban-card-name">${escapeHtml(lead.nome)}</div>
              <div class="kanban-card-meta">${escapeHtml(lead.segmento || '—')}</div>
              <div class="kanban-card-meta">${escapeHtml(lead.quanto_disposto_investir || '—')}</div>
              <div class="kanban-card-meta">${formatDate(lead.created_at)}</div>
              ${valueLine}
              <div class="kanban-card-links">
                <a href="${waLink}" target="_blank" rel="noopener noreferrer" data-stop-propagation>WhatsApp</a>
                <a href="mailto:${escapeHtml(lead.email)}" data-stop-propagation>Email</a>
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
      let dragMoved = false;

      card.addEventListener('dragstart', function () {
        dragMoved = true;
        this.classList.add('dragging');
        this.dataset.fromStatus = this.closest('.kanban-column').dataset.status;
      });
      card.addEventListener('dragend', function () {
        this.classList.remove('dragging');
      });
      card.addEventListener('click', function (e) {
        if (e.target.closest('[data-stop-propagation]')) return;
        if (dragMoved) {
          dragMoved = false;
          return;
        }
        openLeadModal(this.dataset.id);
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

  const SOURCE_FIELDS = [
    ['utm_source', 'UTM Source'],
    ['utm_medium', 'UTM Medium'],
    ['utm_campaign', 'UTM Campaign'],
    ['utm_term', 'UTM Term'],
    ['utm_content', 'UTM Content'],
    ['gclid', 'Google Click ID'],
    ['fbclid', 'Facebook Click ID'],
  ];

  function renderNotes(notes) {
    if (!notes.length) {
      leadModalNotesList.innerHTML = '<div class="notes-empty">Nenhuma anotação ainda.</div>';
      return;
    }
    leadModalNotesList.innerHTML = notes
      .map(
        (note) => `
          <div class="note-item">
            <div class="note-date">${formatDate(note.created_at)}</div>
            <div class="note-text">${escapeHtml(note.texto)}</div>
          </div>
        `
      )
      .join('');
    leadModalNotesList.scrollTop = leadModalNotesList.scrollHeight;
  }

  async function loadNotes(leadId) {
    const response = await fetch(`/api/leads/${leadId}/notes`);
    if (!response.ok) {
      leadModalNotesList.innerHTML = '<div class="notes-empty">Erro ao carregar anotações.</div>';
      return;
    }
    const data = await response.json();
    renderNotes(data.notes || []);
  }

  async function openLeadModal(leadId) {
    const lead = leadsById[leadId];
    if (!lead) return;
    openLeadId = leadId;

    document.getElementById('leadModalName').textContent = lead.nome;
    document.getElementById('leadModalSegmento').textContent = lead.segmento || 'Segmento não informado';
    document.getElementById('leadModalTelefone').textContent = lead.telefone || '—';
    document.getElementById('leadModalEmail').textContent = lead.email || '—';
    document.getElementById('leadModalTempoNegocio').textContent = lead.tempo_negocio || '—';
    document.getElementById('leadModalJaInveste').textContent =
      lead.ja_investe_trafego === 'sim' ? 'Sim' : lead.ja_investe_trafego === 'nao' ? 'Não' : '—';
    document.getElementById('leadModalQuandoInvestiu').textContent = lead.quando_investiu || '—';
    document.getElementById('leadModalQuantoInvestir').textContent = lead.quanto_disposto_investir || '—';
    document.getElementById('leadModalCreatedAt').textContent = formatDate(lead.created_at);

    const sourceContainer = document.getElementById('leadModalSource');
    const rows = SOURCE_FIELDS.filter(([field]) => lead[field]).map(
      ([field, label]) => `<div class="row"><span>${label}</span><span>${escapeHtml(lead[field])}</span></div>`
    );
    sourceContainer.innerHTML = rows.length
      ? rows.join('')
      : '<div class="row"><span>Origem</span><span>Direto (sem UTM/click ID)</span></div>';

    noteText.value = '';
    leadModalSaveStatus.textContent = '';
    leadModalNotesList.innerHTML = '<div class="notes-empty">Carregando...</div>';

    leadModalOverlay.hidden = false;
    document.body.style.overflow = 'hidden';

    loadNotes(leadId);
  }

  function closeLeadModal() {
    leadModalOverlay.hidden = true;
    document.body.style.overflow = '';
    openLeadId = null;
  }

  leadModalClose.addEventListener('click', closeLeadModal);
  leadModalOverlay.addEventListener('click', function (e) {
    if (e.target === leadModalOverlay) closeLeadModal();
  });

  noteForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!openLeadId) return;

    const texto = noteText.value.trim();
    if (!texto) return;

    const submitBtn = noteForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    leadModalSaveStatus.textContent = 'Salvando...';

    try {
      const response = await fetch(`/api/leads/${openLeadId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data || !data.ok) {
        leadModalSaveStatus.textContent = (data && data.error) || 'Erro ao salvar anotação.';
      } else {
        noteText.value = '';
        leadModalSaveStatus.textContent = '';
        await loadNotes(openLeadId);
      }
    } catch (err) {
      leadModalSaveStatus.textContent = 'Erro de conexão. Tente novamente.';
    }
    submitBtn.disabled = false;
  });

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
