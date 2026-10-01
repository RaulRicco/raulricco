/* Ricco Orçamento — interface */
Store.load();

const S = () => Store.state;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const money = (n) => BRL.format(Number(n) || 0);
const moneyShort = (n) => (Math.abs(n) >= 1000 ? 'R$ ' + (n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil' : money(n));
const fdate = (s) => (s ? s.split('-').reverse().join('/') : '');
const ic = (name) => `<i data-feather="${name}"></i>`;
const pct = (n) => (isFinite(n) ? n.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%' : '—');
const num = (v) => { if (typeof v === 'number') return v; const s = String(v || '').trim(); if (!s) return 0; return Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s) || 0; };

const app = { month: ym(todayStr()), charts: [], route: 'dashboard', sub: {} };

const CAT_LABEL = { receita: 'Receita', despesa: 'Despesa', transferencia: 'Transferência' };
const ACC_TYPES = { corrente: 'Conta corrente', poupanca: 'Poupança', carteira: 'Carteira / dinheiro', investimento: 'Conta investimento', outro: 'Outro' };
const PALETTE = ['#7267ef', '#9a93f4', '#b9b4f8', '#5b52d6', '#17c666', '#3ec9d6', '#ffa21d', '#ea4d4d', '#6b7280'];

/* ---------- Navegação ---------- */
const NAV = [
  { cap: 'Navegação', items: [['dashboard', 'Visão geral', 'home']] },
  { cap: 'Movimentações', sub: 'Lançamentos e contas', items: [['extrato', 'Extrato', 'list'], ['pagar-receber', 'Contas a pagar/receber', 'calendar'], ['cartoes', 'Cartões de crédito', 'credit-card'], ['conciliacao', 'Conciliação e importação', 'check-square']] },
  { cap: 'Planejamento', sub: 'Orçamento e objetivos', items: [['orcamento', 'Orçamento', 'pie-chart'], ['metas', 'Metas', 'target']] },
  { cap: 'Patrimônio', sub: 'Bens e investimentos', items: [['investimentos', 'Investimentos', 'trending-up'], ['patrimonio', 'Patrimônio', 'briefcase']] },
  { cap: 'Gestão', sub: 'Análises e cadastros', items: [['relatorios', 'Relatórios', 'bar-chart-2'], ['centros', 'Centros de custo', 'layers'], ['contatos', 'Clientes e fornecedores', 'users']] },
  { cap: 'Cadastros', items: [['contas', 'Contas bancárias', 'archive'], ['categorias', 'Categorias', 'tag']] },
  { cap: 'Sistema', items: [['configuracoes', 'Configurações e backup', 'settings'], ['auditoria', 'Auditoria', 'shield']] },
];

function renderNav() {
  const open = Calc.openItems().filter((i) => i.date < todayStr()).length;
  $('#nav').innerHTML = NAV.map((g) => `
    <div class="nav-caption"><label>${g.cap}</label>${g.sub ? `<span>${g.sub}</span>` : ''}</div>
    ${g.items.map(([r, l, i]) => `<a class="nav-link ${app.route === r ? 'active' : ''}" href="#/${r}">${ic(i)}<span>${l}</span>${r === 'pagar-receber' && open ? `<span class="badge-count">${open}</span>` : ''}</a>`).join('')}
  `).join('');
}

function renderHeader() {
  $('#monthLabel').textContent = monthName(app.month, true);
  const n = S().settings.userName || 'Usuário';
  $('#userName').textContent = n;
  $('#avatar').textContent = n.trim().charAt(0).toUpperCase() || 'U';
  const al = alerts();
  $('#bellCount').hidden = !al.length;
  $('#bellCount').textContent = al.length;
  $('#alerts').innerHTML = `<h6>Alertas (${al.length})</h6>` + (al.length ? al.map((a) => `
    <div class="item"><span class="badge ${a.cls}" style="align-self:flex-start">${a.tag}</span><div>${esc(a.text)}<small>${esc(a.sub || '')}</small></div></div>`).join('') : '<div class="item muted">Nenhum alerta no momento.</div>');
}

function alerts() {
  const out = [];
  const t = todayStr(), soon = ymd(new Date(parseD(t).getTime() + 3 * 864e5));
  for (const i of Calc.openItems()) {
    if (i.date < t) out.push({ tag: 'Vencido', cls: 'b-danger', text: `${i.desc} — ${money(i.amount)}`, sub: `Venceu em ${fdate(i.date)}` });
    else if (i.date <= soon) out.push({ tag: 'Vence logo', cls: 'b-warning', text: `${i.desc} — ${money(i.amount)}`, sub: `Vence em ${fdate(i.date)}` });
  }
  for (const b of S().budgets) {
    const c = Store.get('categories', b.categoryId); if (!c) continue;
    const sp = Calc.spentInCategory(c.id, ym(t));
    if (sp > b.amount) out.push({ tag: 'Orçamento', cls: 'b-danger', text: `${c.name} estourou o orçamento`, sub: `${money(sp)} de ${money(b.amount)}` });
    else if (sp >= b.amount * 0.9) out.push({ tag: 'Orçamento', cls: 'b-warning', text: `${c.name} perto do limite`, sub: `${money(sp)} de ${money(b.amount)}` });
  }
  for (const c of S().cards) {
    const used = Calc.cardUsed(c.id);
    if (c.limit && used >= c.limit * 0.9) out.push({ tag: 'Cartão', cls: 'b-warning', text: `${c.name} com ${pct(used / c.limit * 100)} do limite usado`, sub: money(used) });
  }
  return out;
}

function destroyCharts() { app.charts.forEach((c) => { try { c.destroy(); } catch (e) {} }); app.charts = []; }
function chart(el, opts) {
  if (!el || !window.ApexCharts) return;
  const base = { chart: { fontFamily: 'Inter, sans-serif', toolbar: { show: false }, animations: { speed: 400 } }, dataLabels: { enabled: false }, grid: { borderColor: '#eef0f6' }, tooltip: { y: { formatter: (v) => money(v) } } };
  const merged = deepMerge(base, opts);
  const c = new ApexCharts(el, merged); c.render(); app.charts.push(c);
}
function deepMerge(a, b) {
  const o = { ...a };
  for (const k in b) o[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] ? deepMerge(a[k], b[k]) : b[k];
  return o;
}

const ROUTES = {};
function go() {
  const r = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('?')[0];
  app.route = ROUTES[r] ? r : 'dashboard';
  render();
}
function render() {
  destroyCharts();
  document.body.classList.remove('nav-open');
  renderNav(); renderHeader();
  $('#view').innerHTML = ROUTES[app.route].html();
  ROUTES[app.route].after?.();
  feather.replace();
}
function refresh() { render(); }

function head(title, crumb, actions = '') {
  return `<div class="page-head"><div><h4>${title}</h4><div class="crumb">${crumb}</div></div><div class="actions">${actions}</div></div>`;
}
function emptyBox(text, icon = 'inbox') { return `<div class="empty">${ic(icon)}${text}</div>`; }

/* ---------- Helpers de nomes ---------- */
const catName = (id) => { const c = Store.get('categories', id); if (!c) return 'Sem categoria'; const p = c.parentId && Store.get('categories', c.parentId); return p ? `${p.name} › ${c.name}` : c.name; };
const catColor = (id) => Store.get('categories', id)?.color || '#c4c8d4';
const accName = (t) => t.cardId && !t.cardPayment ? '💳 ' + (Store.get('cards', t.cardId)?.name || 'Cartão') : (Store.get('accounts', t.accountId)?.name || '—');
const optList = (arr, sel, empty) => (empty !== undefined ? `<option value="">${empty}</option>` : '') + arr.map((x) => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
function catOptions(type, sel, empty = 'Sem categoria') {
  const roots = S().categories.filter((c) => (!type || c.type === type) && !c.parentId).sort((a, b) => a.name.localeCompare(b.name));
  let h = empty !== null ? `<option value="">${empty}</option>` : '';
  for (const r of roots) {
    h += `<option value="${r.id}" ${r.id === sel ? 'selected' : ''}>${esc(r.name)}</option>`;
    for (const c of S().categories.filter((x) => x.parentId === r.id)) h += `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>&nbsp;&nbsp;&nbsp;› ${esc(c.name)}</option>`;
  }
  return h;
}
function statusBadge(t) {
  if (t.type === 'transferencia') return `<span class="badge b-primary">${t.paid ? 'Transferido' : 'Agendada'}</span>`;
  if (t.cardId && !t.cardPayment) return '<span class="badge b-muted">Cartão</span>';
  if (t.paid) return `<span class="badge b-success">${t.type === 'receita' ? 'Recebido' : 'Pago'}</span>`;
  if (t.date < todayStr()) return '<span class="badge b-danger">Vencido</span>';
  return '<span class="badge b-warning">Pendente</span>';
}

/* ---------- Modal / toast ---------- */
function modal(title, body, { onSave, saveLabel = 'Salvar', size = '', extra = '' } = {}) {
  $('#modal').className = 'modal ' + size;
  $('#modal').innerHTML = `
    <div class="modal-head"><h5>${title}</h5><button class="btn-icon" data-close>${ic('x')}</button></div>
    <form id="mform"><div class="modal-body">${body}</div>
    <div class="modal-foot">${extra}<button type="button" class="btn btn-light" data-close>Cancelar</button>${onSave ? `<button class="btn btn-primary" type="submit">${saveLabel}</button>` : ''}</div></form>`;
  $('#modalBg').classList.add('open');
  feather.replace();
  $$('[data-close]', $('#modal')).forEach((b) => b.onclick = closeModal);
  $('#mform').onsubmit = (e) => {
    e.preventDefault();
    if (!onSave) return closeModal();
    const data = Object.fromEntries(new FormData(e.target).entries());
    $$('input[type=checkbox]', e.target).forEach((c) => { if (c.name) data[c.name] = c.checked; });
    if (onSave(data, e.target) !== false) { closeModal(); refresh(); }
  };
  const first = $('#modal input:not([type=hidden]):not([type=checkbox]), #modal select');
  first && setTimeout(() => first.focus(), 50);
}
function closeModal() { $('#modalBg').classList.remove('open'); }
function confirmBox(text, onYes, yesLabel = 'Excluir') {
  modal('Confirmar', `<p style="margin:0">${text}</p>`, { onSave: () => { onYes(); }, saveLabel: yesLabel });
}
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }
const field = (label, input, cls = '') => `<div class="field ${cls}"><label>${label}</label>${input}</div>`;

/* ---------- Formulário de lançamento ---------- */
function txForm(t = {}, preset = {}) {
  const isNew = !t.id;
  t = { type: 'despesa', date: todayStr(), paid: false, ...preset, ...t };
  const srcVal = t.cardId && !t.cardPayment ? 'card:' + t.cardId : t.accountId ? 'acc:' + t.accountId : (S().accounts[0] ? 'acc:' + S().accounts[0].id : '');
  const srcOpts = `<optgroup label="Contas">${S().accounts.filter((a) => !a.archived || a.id === t.accountId).map((a) => `<option value="acc:${a.id}" ${srcVal === 'acc:' + a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</optgroup>` +
    (S().cards.length ? `<optgroup label="Cartões de crédito">${S().cards.map((c) => `<option value="card:${c.id}" ${srcVal === 'card:' + c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>` : '');
  const body = `
    <input type="hidden" name="type" value="${t.type}">
    <div style="margin-bottom:16px" class="seg" id="typeSeg">
      ${['despesa', 'receita', 'transferencia'].map((k) => `<button type="button" data-t="${k}" class="${t.type === k ? 'on' : ''}">${CAT_LABEL[k]}</button>`).join('')}
    </div>
    <div class="form-grid">
      ${field('Descrição', `<input class="input" name="desc" required value="${esc(t.desc)}" placeholder="Ex.: Supermercado">`, 'full')}
      ${field('Valor (R$)', `<input class="input" name="amount" required inputmode="decimal" value="${t.amount != null ? String(t.amount).replace('.', ',') : ''}" placeholder="0,00">`)}
      ${field('Data / vencimento', `<input class="input" type="date" name="date" required value="${t.date}">`)}
      ${field('<span id="srcLabel">Conta / cartão</span>', `<select class="input" name="src" id="srcSel">${srcOpts}</select>`)}
      <div class="field" id="toWrap">${`<label>Conta de destino</label><select class="input" name="toAccountId">${optList(S().accounts, t.toAccountId)}</select>`}</div>
      <div class="field" id="catWrap"><label>Categoria</label><select class="input" name="categoryId" id="catSel">${catOptions(t.type === 'transferencia' ? 'despesa' : t.type, t.categoryId)}</select></div>
      ${field('Centro de custo', `<select class="input" name="costCenterId">${optList(S().costCenters, t.costCenterId, 'Nenhum')}</select>`)}
      ${field('Cliente / fornecedor', `<select class="input" name="contactId">${optList(S().contacts, t.contactId, 'Nenhum')}</select>`)}
      ${isNew ? field('Repetição', `<div style="display:flex;gap:8px"><select class="input" name="repeat" id="repSel"><option value="">Não repetir</option><option value="parcelado">Parcelado</option><option value="fixo">Fixo mensal</option></select><input class="input" name="times" type="number" min="2" max="120" value="12" style="width:90px" id="repN" hidden></div>`) : '<div></div>'}
      ${field('Observações', `<textarea class="input" name="notes" placeholder="Opcional">${esc(t.notes)}</textarea>`, 'full')}
      <label class="check full" id="paidWrap"><input type="checkbox" name="paid" ${t.paid ? 'checked' : ''}> <span id="paidLabel">Já foi pago</span></label>
    </div>`;
  modal(isNew ? 'Novo lançamento' : 'Editar lançamento', body, {
    onSave: (d) => {
      const amount = num(d.amount);
      if (!(amount > 0)) { toast('Informe um valor maior que zero'); return false; }
      const [kind, srcId] = (d.src || '').split(':');
      const base = {
        type: d.type, desc: d.desc.trim(), date: d.date, notes: d.notes,
        categoryId: d.type === 'transferencia' ? null : d.categoryId || null,
        costCenterId: d.costCenterId || null, contactId: d.contactId || null,
        accountId: kind === 'acc' ? srcId : (Store.get('cards', srcId)?.accountId || null),
        cardId: kind === 'card' && d.type !== 'transferencia' ? srcId : null,
        toAccountId: d.type === 'transferencia' ? d.toAccountId : null,
        paid: kind === 'card' ? false : !!d.paid,
      };
      if (!base.accountId && !base.cardId) { toast('Cadastre uma conta primeiro'); return false; }
      if (base.type === 'transferencia' && base.toAccountId === base.accountId) { toast('Escolha contas diferentes'); return false; }
      base.paidDate = base.paid ? (t.paidDate && t.paid ? t.paidDate : base.date) : null;
      if (!isNew) { Store.upsert('tx', { ...t, ...base, amount: round2(amount) }); toast('Lançamento atualizado'); return; }
      const n = d.repeat ? Math.max(2, Math.min(120, Number(d.times) || 2)) : 1;
      const groupId = n > 1 ? uid() : null;
      const each = d.repeat === 'parcelado' ? Math.floor(amount / n * 100) / 100 : amount;
      for (let i = 0; i < n; i++) {
        const value = d.repeat === 'parcelado' && i === n - 1 ? round2(amount - each * (n - 1)) : each;
        const date = addMonths(base.date, i);
        const paid = i === 0 ? base.paid : false;
        Store.upsert('tx', {
          ...base, id: uid(), amount: round2(value), date, paid, paidDate: paid ? date : null, reconciled: false, groupId,
          desc: d.repeat === 'parcelado' ? `${base.desc} (${i + 1}/${n})` : base.desc,
        }, base.desc);
      }
      toast(n > 1 ? `${n} lançamentos criados` : 'Lançamento criado');
    },
  });
  const sync = () => {
    const type = $('[name=type]').value;
    const isT = type === 'transferencia';
    $('#toWrap').style.display = isT ? '' : 'none';
    $('#catWrap').style.display = isT ? 'none' : '';
    $('#srcLabel').textContent = isT ? 'Conta de origem' : 'Conta / cartão';
    $$('#srcSel optgroup')[1] && ($$('#srcSel optgroup')[1].disabled = isT);
    const isCard = $('#srcSel').value.startsWith('card:');
    $('#paidWrap').style.display = isCard ? 'none' : '';
    $('#paidLabel').textContent = type === 'receita' ? 'Já foi recebido' : isT ? 'Já foi transferido' : 'Já foi pago';
  };
  $$('#typeSeg button').forEach((b) => b.onclick = () => {
    $$('#typeSeg button').forEach((x) => x.classList.toggle('on', x === b));
    $('[name=type]').value = b.dataset.t;
    if (b.dataset.t !== 'transferencia') $('#catSel').innerHTML = catOptions(b.dataset.t);
    if (b.dataset.t === 'transferencia' && $('#srcSel').value.startsWith('card:')) $('#srcSel').value = 'acc:' + S().accounts[0]?.id;
    sync();
  });
  $('#srcSel').onchange = sync;
  if ($('#repSel')) $('#repSel').onchange = () => { $('#repN').hidden = !$('#repSel').value; };
  sync();
}

function deleteTx(t) {
  const group = t.groupId ? S().tx.filter((x) => x.groupId === t.groupId && x.date >= t.date) : [];
  const body = `<p style="margin:0 0 12px">Excluir <b>${esc(t.desc)}</b> (${money(t.amount)})?</p>` +
    (group.length > 1 ? `<label class="check"><input type="checkbox" name="all"> Excluir também os ${group.length - 1} lançamentos seguintes desta série</label>` : '');
  modal('Excluir lançamento', body, {
    saveLabel: 'Excluir', onSave: (d) => {
      (d.all ? group : [t]).forEach((x) => Store.remove('tx', x.id, x.desc));
      toast('Excluído');
    },
  });
}

function payItem(item) {
  const isInv = !!item.invoice;
  const t = item.tx;
  const accSel = isInv ? Store.get('cards', item.invoice.cardId)?.accountId : t.accountId;
  modal(item.kind === 'receber' ? 'Confirmar recebimento' : 'Confirmar pagamento', `
    <p style="margin:0 0 16px"><b>${esc(item.desc)}</b><br><span class="muted">Vencimento ${fdate(item.date)}</span></p>
    <div class="form-grid">
      ${field('Valor pago (R$)', `<input class="input" name="amount" value="${String(item.amount).replace('.', ',')}">`)}
      ${field('Data do pagamento', `<input class="input" type="date" name="paidDate" value="${todayStr()}">`)}
      ${field('Conta', `<select class="input" name="accountId">${optList(S().accounts, accSel)}</select>`, 'full')}
    </div>`, {
    saveLabel: 'Confirmar', onSave: (d) => {
      const amount = round2(num(d.amount));
      if (isInv) {
        const card = Store.get('cards', item.invoice.cardId);
        const ex = Calc.invoicePayment(card.id, item.invoice.month);
        Store.upsert('tx', { ...(ex || {}), type: 'despesa', desc: `Pagamento fatura ${card.name}`, amount, date: Calc.invoiceDue(card, item.invoice.month), paidDate: d.paidDate, accountId: d.accountId, cardId: card.id, cardPayment: true, invoice: item.invoice.month, paid: true, reconciled: false, notes: '' });
      } else {
        Store.upsert('tx', { ...t, amount, paid: true, paidDate: d.paidDate, accountId: d.accountId });
      }
      toast('Baixa registrada');
    },
  });
}

function togglePaid(t) {
  if (t.cardId && !t.cardPayment) return toast('Compras no cartão são quitadas pelo pagamento da fatura');
  if (!t.paid) return payItem({ kind: t.type === 'receita' ? 'receber' : 'pagar', date: t.date, desc: t.desc, amount: t.amount, tx: t });
  Store.upsert('tx', { ...t, paid: false, paidDate: null, reconciled: false });
  toast('Marcado como pendente'); refresh();
}

/* ====================================================================== */
/* VISÃO GERAL                                                            */
/* ====================================================================== */
ROUTES.dashboard = {
  html() {
    const m = app.month, tot = Calc.monthTotals(m);
    const open = Calc.openItems();
    const endM = `${m}-31`;
    const aPagar = open.filter((i) => i.kind === 'pagar' && ym(i.date) <= m).reduce((s, i) => s + i.amount, 0);
    const aReceber = open.filter((i) => i.kind === 'receber' && ym(i.date) <= m).reduce((s, i) => s + i.amount, 0);
    const cardsInv = S().cards.reduce((s, c) => s + Calc.invoiceTotal(c.id, m), 0);
    const months = Array.from({ length: 12 }, (_, i) => addYm(m, i - 11));
    const series = months.map((x) => Calc.monthTotals(x));
    const recYear = series.reduce((s, x) => s + x.rec, 0), despYear = series.reduce((s, x) => s + x.desp, 0);
    const rate = tot.rec ? (tot.res / tot.rec) * 100 : 0;
    const txCount = S().tx.filter((t) => ym(t.date) === m && Calc.isResult(t)).length;
    const last3 = [0, 1, 2].map((i) => addYm(m, -i));
    const nw = Calc.netWorth(), it = Calc.investTotals();
    const goals = S().goals, gT = goals.reduce((s, g) => s + Number(g.target), 0), gS = goals.reduce((s, g) => s + Number(g.saved), 0);
    const limit = S().cards.reduce((s, c) => s + Number(c.limit || 0), 0) - S().cards.reduce((s, c) => s + Calc.cardUsed(c.id), 0);
    const upcoming = open.slice().filter((i) => i.date >= addMonths(todayStr(), -60)).slice(0, 6);
    return `
    <div class="grid dash">
      <div class="stack">
        <div class="card"><div class="stat-grid">
          ${[['briefcase', money(Calc.totalBalance(endM)), 'Saldo em contas'], ['trending-up', money(tot.rec), 'Receitas'], ['trending-down', money(tot.desp), 'Despesas'],
             ['arrow-up-circle', money(aPagar), 'A pagar'], ['arrow-down-circle', money(aReceber), 'A receber'], ['credit-card', money(cardsInv), 'Fatura do mês']]
            .map(([i, v, l]) => `<div class="cell">${ic(i)}<div><b title="${v}">${v}</b><span>${l}</span></div></div>`).join('')}
        </div></div>
        <div class="grid g-2">
          <div class="card">
            <div class="card-body" style="padding-bottom:0">
              <div class="big-num">${pct(rate)}</div><span class="sub-link">Taxa de economia</span>
              <p style="margin:18px 0 0">Quanto da receita do mês sobrou depois das despesas.</p>
            </div>
            <div id="chRate" style="margin-top:6px;margin-bottom:-14px"></div>
            <div class="strip">${last3.map((x) => { const t = Calc.monthTotals(x); return `<div><b>${pct(t.rec ? t.res / t.rec * 100 : 0)}</b><span>${monthName(x).split(' ')[0]}</span></div>`; }).join('')}</div>
          </div>
          <div class="card">
            <div class="card-body" style="padding-bottom:0">
              <div class="big-num">${txCount}</div><span class="sub-link">Lançamentos no mês</span>
              <p style="margin:18px 0 0">Receitas e despesas registradas em ${monthName(m, true)}.</p>
              <div class="mini-stats">${last3.slice().reverse().map((x) => `<div><b>${S().tx.filter((t) => ym(t.date) === x && Calc.isResult(t)).length}</b><span>${monthName(x).split(' ')[0]}</span></div>`).join('')}</div>
            </div>
            <div id="chDaily"></div>
          </div>
        </div>
        <div class="card">
          <div class="card-body">
            <h5 style="font-size:15px;font-weight:500;margin-bottom:8px">Despesas por categoria</h5>
            <p class="muted" style="margin:0 0 6px">Para onde foi o dinheiro em ${monthName(m, true)}.</p>
            <div id="chCat"></div>
          </div>
        </div>
      </div>

      <div class="stack">
        <div class="card">
          <div class="card-header"><h5>Fluxo de caixa mensal — últimos 12 meses</h5></div>
          <div class="card-body">
            <div class="totals"><div><b>${money(recYear)}</b><span>Receitas</span></div><div><b>${money(despYear / 12)}</b><span>Média de despesas</span></div></div>
            <div id="chFlow" style="margin-top:10px"></div>
          </div>
        </div>
        <div class="grid g-2">
          <a class="card" href="#/patrimonio" style="color:inherit"><div class="kpi"><div><h6>Patrimônio líquido</h6><div class="val">${money(nw.total)}</div></div>${ic('briefcase')}</div></a>
          <a class="card primary" href="#/investimentos"><div class="kpi"><div><h6>Investimentos</h6><div class="val">${money(it.current)}</div></div>${ic('trending-up')}</div></a>
          <a class="card primary" href="#/metas"><div class="kpi"><div><h6>Metas atingidas</h6><div class="val">${pct(gT ? gS / gT * 100 : 0)}</div></div>${ic('target')}</div></a>
          <a class="card" href="#/cartoes" style="color:inherit"><div class="kpi"><div><h6>Limite disponível</h6><div class="val">${money(limit)}</div></div>${ic('credit-card')}</div></a>
        </div>
        <div class="card">
          <div class="card-header"><h5>Próximos vencimentos</h5><a href="#/pagar-receber" class="btn btn-light btn-sm">Ver todos</a></div>
          ${upcoming.length ? upcoming.map((i) => `
            <div class="list-item"><div class="ico ${i.kind === 'receber' ? 'r' : 'd'}">${ic(i.invoice ? 'credit-card' : i.kind === 'receber' ? 'arrow-down-left' : 'arrow-up-right')}</div>
              <div class="grow"><b>${esc(i.desc)}</b><small>${fdate(i.date)} ${i.date < todayStr() ? '· <span class="neg">vencido</span>' : ''}</small></div>
              <b class="${i.kind === 'receber' ? 'pos' : 'neg'}">${money(i.amount)}</b></div>`).join('') : emptyBox('Nada pendente. Tudo em dia!', 'check-circle')}
        </div>
      </div>
    </div>`;
  },
  after() {
    const m = app.month;
    const months = Array.from({ length: 12 }, (_, i) => addYm(m, i - 11));
    const series = months.map((x) => Calc.monthTotals(x));
    chart($('#chFlow'), {
      chart: { type: 'line', height: 330, toolbar: { show: true, tools: { download: false } }, zoom: { enabled: true } },
      series: [{ name: 'Despesas', type: 'column', data: series.map((x) => x.desp) }, { name: 'Receitas', type: 'line', data: series.map((x) => x.rec) }],
      colors: ['#7267ef', '#b3adf7'], stroke: { width: [0, 2.5], curve: 'smooth' },
      plotOptions: { bar: { columnWidth: '48%' } },
      xaxis: { categories: months.map((x) => monthName(x).replace(' ', '/')), labels: { style: { fontSize: '11px' } } },
      yaxis: { labels: { formatter: (v) => moneyShort(v) } }, legend: { position: 'bottom', fontSize: '12px' },
    });
    const rates = months.map((x) => { const t = Calc.monthTotals(x); return t.rec ? round2(t.res / t.rec * 100) : 0; });
    chart($('#chRate'), {
      chart: { type: 'area', height: 100, sparkline: { enabled: true } }, series: [{ name: 'Economia', data: rates }],
      colors: ['#7267ef'], stroke: { width: 2, curve: 'smooth' }, fill: { type: 'gradient', gradient: { opacityFrom: .45, opacityTo: .05 } },
      tooltip: { y: { formatter: (v) => pct(v) }, x: { show: false } }, xaxis: { categories: months.map((x) => monthName(x)) },
    });
    const days = new Date(Number(m.slice(0, 4)), Number(m.slice(5)), 0).getDate();
    const daily = Array.from({ length: days }, (_, i) => round2(S().tx.filter((t) => t.type === 'despesa' && !t.cardPayment && t.date === `${m}-${pad(i + 1)}`).reduce((s, t) => s + t.amount, 0)));
    chart($('#chDaily'), {
      chart: { type: 'bar', height: 92, sparkline: { enabled: true } }, series: [{ name: 'Despesas', data: daily }],
      colors: ['#7267ef'], plotOptions: { bar: { columnWidth: '60%' } }, xaxis: { categories: daily.map((_, i) => `Dia ${i + 1}`) },
    });
    const cats = Calc.byCategory(m, 'despesa');
    if (!cats.length) { $('#chCat').innerHTML = emptyBox('Sem despesas neste mês.', 'pie-chart'); return; }
    chart($('#chCat'), {
      chart: { type: 'pie', height: 330 }, series: cats.map((c) => c.value), labels: cats.map((c) => c.name),
      colors: cats.map((c, i) => PALETTE[i % PALETTE.length]), legend: { position: 'right', fontSize: '12px' },
      dataLabels: { enabled: true, formatter: (v) => v.toFixed(1) + '%', dropShadow: { enabled: false } }, stroke: { colors: ['#fff'] },
      responsive: [{ breakpoint: 720, options: { legend: { position: 'bottom' } } }],
    });
  },
};

/* ====================================================================== */
/* EXTRATO                                                                */
/* ====================================================================== */
app.sub.ext = { q: '', src: '', cat: '', type: '', status: '' };
ROUTES.extrato = {
  html() {
    const f = app.sub.ext;
    const src = `<option value="">Todas as contas e cartões</option>` + S().accounts.map((a) => `<option value="acc:${a.id}" ${f.src === 'acc:' + a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('') + S().cards.map((c) => `<option value="card:${c.id}" ${f.src === 'card:' + c.id ? 'selected' : ''}>💳 ${esc(c.name)}</option>`).join('');
    return head('Extrato', `Movimentações de ${monthName(app.month, true)}`, `<button class="btn btn-outline" id="csvBtn">${ic('download')}Exportar CSV</button><button class="btn btn-primary" data-action="new-tx">${ic('plus')}Novo lançamento</button>`) + `
      <div class="grid g-4" id="extTotals" style="margin-bottom:24px"></div>
      <div class="card">
        <div class="filters">
          <input class="input grow" id="fQ" placeholder="Buscar descrição…" value="${esc(f.q)}">
          <select class="input" id="fSrc">${src}</select>
          <select class="input" id="fCat">${catOptions('', f.cat, 'Todas as categorias')}</select>
          <select class="input" id="fType"><option value="">Todos os tipos</option>${Object.entries(CAT_LABEL).map(([k, v]) => `<option value="${k}" ${f.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
          <select class="input" id="fStatus"><option value="">Qualquer status</option>${[['pago', 'Pagos / recebidos'], ['pendente', 'Pendentes'], ['vencido', 'Vencidos'], ['nconc', 'Não conciliados']].map(([k, v]) => `<option value="${k}" ${f.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        </div>
        <div class="table-wrap" id="extTable"></div>
      </div>`;
  },
  rows() {
    const f = app.sub.ext, t0 = todayStr();
    return S().tx.filter((t) => {
      if (ym(t.date) !== app.month) return false;
      if (f.q && !t.desc.toLowerCase().includes(f.q.toLowerCase())) return false;
      if (f.src) {
        const [k, id] = f.src.split(':');
        if (k === 'acc' && !(t.accountId === id && (!t.cardId || t.cardPayment)) && t.toAccountId !== id) return false;
        if (k === 'card' && t.cardId !== id) return false;
      }
      if (f.cat) { const c = Store.get('categories', t.categoryId); if (t.categoryId !== f.cat && c?.parentId !== f.cat) return false; }
      if (f.type && t.type !== f.type) return false;
      if (f.status === 'pago' && !t.paid) return false;
      if (f.status === 'pendente' && (t.paid || t.cardId)) return false;
      if (f.status === 'vencido' && (t.paid || t.cardId || t.date >= t0)) return false;
      if (f.status === 'nconc' && (t.reconciled || !t.paid)) return false;
      return true;
    }).sort((a, b) => b.date.localeCompare(a.date) || a.desc.localeCompare(b.desc));
  },
  table() {
    const rows = this.rows();
    let rec = 0, desp = 0;
    rows.forEach((t) => { if (!Calc.isResult(t)) return; if (t.type === 'receita') rec += t.amount; else desp += t.amount; });
    $('#extTotals').innerHTML = [['Receitas', rec, 'pos'], ['Despesas', desp, 'neg'], ['Resultado', rec - desp, rec - desp >= 0 ? 'pos' : 'neg'], ['Saldo atual em contas', Calc.totalBalance(), '']]
      .map(([l, v, c]) => `<div class="card"><div class="kpi"><div><h6 class="muted">${l}</h6><div class="val ${c}">${money(v)}</div></div></div></div>`).join('');
    $('#extTable').innerHTML = rows.length ? `
      <table class="tbl"><thead><tr><th title="Conciliado">✓</th><th>Data</th><th>Descrição</th><th>Conta</th><th class="num">Valor</th><th>Status</th><th class="act"></th></tr></thead><tbody>
      ${rows.map((t) => `<tr>
        <td><input type="checkbox" class="check" data-rec="${t.id}" ${t.reconciled ? 'checked' : ''} ${t.paid ? '' : 'disabled'} title="Conciliado" style="accent-color:var(--primary)"></td>
        <td>${fdate(t.date)}</td>
        <td class="desc-cell"><b>${esc(t.desc)}</b><small>${t.type === 'transferencia' ? `Transferência → ${esc(Store.get('accounts', t.toAccountId)?.name)}` : t.cardPayment ? 'Pagamento de fatura' : `<span class="dot-c" style="background:${catColor(t.categoryId)}"></span>${esc(catName(t.categoryId))}`}${t.costCenterId ? ' · ' + esc(Store.get('costCenters', t.costCenterId)?.name) : ''}</small></td>
        <td>${esc(accName(t))}</td>
        <td class="num ${t.type === 'receita' ? 'pos' : t.type === 'despesa' ? 'neg' : ''}">${t.type === 'despesa' ? '−' : t.type === 'receita' ? '+' : ''} ${money(t.amount)}</td>
        <td>${statusBadge(t)}</td>
        <td class="act">
          ${t.type !== 'transferencia' && !(t.cardId && !t.cardPayment) ? `<button class="btn-icon" data-pay="${t.id}" title="${t.paid ? 'Marcar como pendente' : 'Dar baixa'}">${ic(t.paid ? 'rotate-ccw' : 'check')}</button>` : ''}
          ${t.cardPayment ? '' : `<button class="btn-icon" data-edit="${t.id}" title="Editar">${ic('edit-2')}</button><button class="btn-icon" data-dup="${t.id}" title="Duplicar">${ic('copy')}</button>`}
          <button class="btn-icon" data-del="${t.id}" title="Excluir">${ic('trash-2')}</button>
        </td></tr>`).join('')}
      </tbody></table>` : emptyBox('Nenhum lançamento encontrado para este filtro.');
    feather.replace();
    $$('[data-edit]').forEach((b) => b.onclick = () => txForm(Store.get('tx', b.dataset.edit)));
    $$('[data-dup]').forEach((b) => b.onclick = () => { const t = Store.get('tx', b.dataset.dup); const { id, groupId, paid, paidDate, reconciled, ...rest } = t; txForm({}, rest); });
    $$('[data-del]').forEach((b) => b.onclick = () => deleteTx(Store.get('tx', b.dataset.del)));
    $$('[data-pay]').forEach((b) => b.onclick = () => togglePaid(Store.get('tx', b.dataset.pay)));
    $$('[data-rec]').forEach((b) => b.onchange = () => { const t = Store.get('tx', b.dataset.rec); t.reconciled = b.checked; Store.log('conciliou', 'tx', t.desc); Store.save(); });
  },
  after() {
    const f = app.sub.ext;
    const bind = (id, k, ev = 'change') => $(id).addEventListener(ev, (e) => { f[k] = e.target.value; this.table(); });
    bind('#fQ', 'q', 'input'); bind('#fSrc', 'src'); bind('#fCat', 'cat'); bind('#fType', 'type'); bind('#fStatus', 'status');
    $('#csvBtn').onclick = () => downloadCSV(`extrato-${app.month}.csv`, txCsvRows(this.rows()));
    this.table();
  },
};

/* ====================================================================== */
/* CONTAS A PAGAR / RECEBER                                               */
/* ====================================================================== */
app.sub.pr = 'pagar';
ROUTES['pagar-receber'] = {
  html() {
    const tab = app.sub.pr, t0 = todayStr();
    const all = Calc.openItems();
    const list = all.filter((i) => tab === 'vencidos' ? i.date < t0 : tab === 'todos' ? true : i.kind === tab);
    const sum = (arr) => arr.reduce((s, i) => s + i.amount, 0);
    const venc = all.filter((i) => i.date < t0);
    const in7 = ymd(new Date(parseD(t0).getTime() + 7 * 864e5));
    const next7 = all.filter((i) => i.date >= t0 && i.date <= in7);
    return head('Contas a pagar e receber', 'Compromissos em aberto, incluindo faturas de cartão', `<button class="btn btn-primary" data-action="new-tx">${ic('plus')}Novo compromisso</button>`) + `
      <div class="grid g-4" style="margin-bottom:24px">
        <div class="card"><div class="kpi"><div><h6 class="muted">Total a pagar</h6><div class="val neg">${money(sum(all.filter((i) => i.kind === 'pagar')))}</div></div>${ic('arrow-up-circle')}</div></div>
        <div class="card"><div class="kpi"><div><h6 class="muted">Total a receber</h6><div class="val pos">${money(sum(all.filter((i) => i.kind === 'receber')))}</div></div>${ic('arrow-down-circle')}</div></div>
        <div class="card primary"><div class="kpi"><div><h6>Vencidos</h6><div class="val">${venc.length} · ${money(sum(venc))}</div></div>${ic('alert-circle')}</div></div>
        <div class="card"><div class="kpi"><div><h6 class="muted">Próximos 7 dias</h6><div class="val">${next7.length} · ${money(sum(next7))}</div></div>${ic('clock')}</div></div>
      </div>
      <div class="card">
        <div class="tabs">${[['pagar', 'A pagar'], ['receber', 'A receber'], ['vencidos', 'Vencidos'], ['todos', 'Todos']].map(([k, v]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${v}</button>`).join('')}</div>
        <div class="table-wrap">${list.length ? `<table class="tbl"><thead><tr><th>Vencimento</th><th>Descrição</th><th>Conta</th><th class="num">Valor</th><th>Situação</th><th class="act"></th></tr></thead><tbody>
          ${list.map((i, idx) => `<tr><td>${fdate(i.date)}</td>
            <td class="desc-cell"><b>${esc(i.desc)}</b><small>${i.invoice ? 'Fatura de cartão' : esc(catName(i.tx.categoryId))}${i.tx?.contactId ? ' · ' + esc(Store.get('contacts', i.tx.contactId)?.name) : ''}</small></td>
            <td>${i.invoice ? '💳 ' + esc(Store.get('cards', i.invoice.cardId)?.name) : esc(accName(i.tx))}</td>
            <td class="num ${i.kind === 'receber' ? 'pos' : 'neg'}">${money(i.amount)}</td>
            <td>${i.date < t0 ? `<span class="badge b-danger">Vencido há ${Math.round((parseD(t0) - parseD(i.date)) / 864e5)}d</span>` : i.date === t0 ? '<span class="badge b-warning">Vence hoje</span>' : `<span class="badge b-muted">Em ${Math.round((parseD(i.date) - parseD(t0)) / 864e5)}d</span>`}</td>
            <td class="act"><button class="btn btn-sm btn-success" data-pay="${idx}">${ic('check')}${i.kind === 'receber' ? 'Receber' : 'Pagar'}</button>
              ${i.tx ? `<button class="btn-icon" data-edit="${i.tx.id}">${ic('edit-2')}</button>` : `<a class="btn-icon" href="#/cartoes" title="Ver fatura">${ic('external-link')}</a>`}</td></tr>`).join('')}
          </tbody><tfoot><tr><td colspan="3">Total</td><td class="num">${money(sum(list))}</td><td colspan="2"></td></tr></tfoot></table>` : emptyBox('Nenhum compromisso em aberto aqui.', 'check-circle')}</div>
      </div>`;
  },
  after() {
    const t0 = todayStr(), tab = app.sub.pr;
    const list = Calc.openItems().filter((i) => tab === 'vencidos' ? i.date < t0 : tab === 'todos' ? true : i.kind === tab);
    $$('[data-tab]').forEach((b) => b.onclick = () => { app.sub.pr = b.dataset.tab; refresh(); });
    $$('[data-pay]').forEach((b) => b.onclick = () => payItem(list[b.dataset.pay]));
    $$('[data-edit]').forEach((b) => b.onclick = () => txForm(Store.get('tx', b.dataset.edit)));
  },
};

/* ====================================================================== */
/* CARTÕES                                                                */
/* ====================================================================== */
app.sub.card = null;
ROUTES.cartoes = {
  html() {
    const cards = S().cards;
    if (!app.sub.card || !Store.get('cards', app.sub.card)) app.sub.card = cards[0]?.id || null;
    const card = Store.get('cards', app.sub.card);
    let invoiceHtml = '';
    if (card) {
      const inv = app.sub.inv || Calc.invoiceOf(card, todayStr());
      app.sub.inv = inv;
      const items = Calc.invoiceItems(card.id, inv).sort((a, b) => a.date.localeCompare(b.date));
      const total = Calc.invoiceTotal(card.id, inv);
      const pay = Calc.invoicePayment(card.id, inv);
      const due = Calc.invoiceDue(card, inv);
      const closeDate = `${card.dueDay > card.closeDay ? inv : addYm(inv, -1)}-${pad(card.closeDay)}`;
      const status = pay?.paid ? '<span class="badge b-success">Paga</span>' : due < todayStr() ? '<span class="badge b-danger">Vencida</span>' : todayStr() > closeDate ? '<span class="badge b-warning">Fechada</span>' : '<span class="badge b-primary">Aberta</span>';
      invoiceHtml = `
        <div class="card">
          <div class="card-header">
            <div style="display:flex;align-items:center;gap:8px">
              <button class="btn-icon" id="invPrev">${ic('chevron-left')}</button>
              <h5 style="text-transform:capitalize;min-width:150px;text-align:center">Fatura ${monthName(inv, true)}</h5>
              <button class="btn-icon" id="invNext">${ic('chevron-right')}</button>
            </div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${status}
              <span class="muted">Vence ${fdate(due)}</span>
              <b style="font-size:16px">${money(total)}</b>
              ${!pay?.paid && total > 0 ? `<button class="btn btn-sm btn-success" id="payInv">${ic('check')}Pagar fatura</button>` : ''}
              ${pay?.paid ? `<button class="btn btn-sm btn-light" id="unpayInv">Desfazer pagamento</button>` : ''}
            </div>
          </div>
          <div class="table-wrap">${items.length ? `<table class="tbl"><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th class="num">Valor</th><th class="act"></th></tr></thead><tbody>
            ${items.map((t) => `<tr><td>${fdate(t.date)}</td><td>${esc(t.desc)}</td><td><span class="dot-c" style="background:${catColor(t.categoryId)}"></span>${esc(catName(t.categoryId))}</td>
              <td class="num ${t.type === 'receita' ? 'pos' : ''}">${t.type === 'receita' ? '−' : ''}${money(t.amount)}</td>
              <td class="act"><button class="btn-icon" data-edit="${t.id}">${ic('edit-2')}</button><button class="btn-icon" data-del="${t.id}">${ic('trash-2')}</button></td></tr>`).join('')}
            </tbody></table>` : emptyBox('Nenhuma compra nesta fatura.', 'credit-card')}</div>
        </div>`;
    }
    return head('Cartões de crédito', 'Limites, faturas e compras parceladas', `${card ? `<button class="btn btn-outline" id="newPurchase">${ic('shopping-cart')}Nova compra</button>` : ''}<button class="btn btn-primary" id="newCard">${ic('plus')}Novo cartão</button>`) + `
      <div class="grid g-3" style="margin-bottom:24px">
        ${cards.map((c) => { const used = Calc.cardUsed(c.id); const p = c.limit ? Math.min(100, used / c.limit * 100) : 0; return `
          <div class="card" style="cursor:pointer;outline:${c.id === app.sub.card ? '2px solid var(--primary)' : 'none'}" data-card="${c.id}">
            <div class="tile">
              <div class="cc-card" style="--c:${c.color}"><div style="display:flex;justify-content:space-between"><span class="chip">Fecha dia ${c.closeDay} · vence dia ${c.dueDay}</span>
                <span><button class="btn-icon" style="color:#fff" data-ecard="${c.id}">${ic('edit-2')}</button></span></div>
                <div><div class="nm">${esc(c.name)}</div><div class="chip">Limite ${money(c.limit)}</div></div></div>
              <div class="row"><span class="muted">Usado</span><b>${money(used)}</b></div>
              <div class="progress ${p > 90 ? 'over' : p > 70 ? 'warn' : ''}" style="margin:8px 0"><div style="width:${p}%"></div></div>
              <div class="row" style="margin-top:0"><span class="muted">Disponível</span><b class="pos">${money(c.limit - used)}</b></div>
            </div>
          </div>`; }).join('') || `<div class="card" style="grid-column:1/-1">${emptyBox('Nenhum cartão cadastrado ainda.', 'credit-card')}</div>`}
      </div>${invoiceHtml}`;
  },
  after() {
    $('#newCard').onclick = () => cardForm();
    $$('[data-ecard]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); cardForm(Store.get('cards', b.dataset.ecard)); });
    $$('[data-card]').forEach((b) => b.onclick = () => { app.sub.card = b.dataset.card; app.sub.inv = null; refresh(); });
    const card = Store.get('cards', app.sub.card); if (!card) return;
    $('#newPurchase').onclick = () => txForm({}, { cardId: card.id, type: 'despesa' });
    $('#invPrev').onclick = () => { app.sub.inv = addYm(app.sub.inv, -1); refresh(); };
    $('#invNext').onclick = () => { app.sub.inv = addYm(app.sub.inv, 1); refresh(); };
    $('#payInv') && ($('#payInv').onclick = () => payItem({ kind: 'pagar', date: Calc.invoiceDue(card, app.sub.inv), desc: `Fatura ${card.name} (${monthName(app.sub.inv)})`, amount: Calc.invoiceTotal(card.id, app.sub.inv), invoice: { cardId: card.id, month: app.sub.inv } }));
    $('#unpayInv') && ($('#unpayInv').onclick = () => { const p = Calc.invoicePayment(card.id, app.sub.inv); Store.remove('tx', p.id, p.desc); toast('Pagamento desfeito'); refresh(); });
    $$('[data-edit]').forEach((b) => b.onclick = () => txForm(Store.get('tx', b.dataset.edit)));
    $$('[data-del]').forEach((b) => b.onclick = () => deleteTx(Store.get('tx', b.dataset.del)));
  },
};
function cardForm(c = {}) {
  modal(c.id ? 'Editar cartão' : 'Novo cartão', `<div class="form-grid">
    ${field('Nome', `<input class="input" name="name" required value="${esc(c.name)}" placeholder="Ex.: Nubank">`, 'full')}
    ${field('Limite (R$)', `<input class="input" name="limit" inputmode="decimal" value="${c.limit ?? ''}">`)}
    ${field('Conta de pagamento', `<select class="input" name="accountId">${optList(S().accounts, c.accountId)}</select>`)}
    ${field('Dia de fechamento', `<input class="input" name="closeDay" type="number" min="1" max="31" required value="${c.closeDay ?? 1}">`)}
    ${field('Dia de vencimento', `<input class="input" name="dueDay" type="number" min="1" max="31" required value="${c.dueDay ?? 10}">`)}
    ${field('Cor', `<input class="input" name="color" type="color" value="${c.color || '#7267ef'}" style="height:40px;padding:4px">`)}
  </div>`, {
    extra: c.id ? `<button type="button" class="btn btn-danger" id="delCard" style="margin-right:auto">Excluir</button>` : '',
    onSave: (d) => { Store.upsert('cards', { ...c, name: d.name, limit: num(d.limit), accountId: d.accountId, closeDay: Number(d.closeDay), dueDay: Number(d.dueDay), color: d.color }); toast('Cartão salvo'); },
  });
  $('#delCard') && ($('#delCard').onclick = () => {
    if (S().tx.some((t) => t.cardId === c.id)) return toast('Cartão possui lançamentos — exclua-os antes');
    Store.remove('cards', c.id); closeModal(); refresh();
  });
}

/* ====================================================================== */
/* CONCILIAÇÃO E IMPORTAÇÃO                                               */
/* ====================================================================== */
app.sub.conc = { acc: null, bank: '', preview: null };
ROUTES.conciliacao = {
  html() {
    const c = app.sub.conc;
    if (!c.acc || !Store.get('accounts', c.acc)) c.acc = S().accounts[0]?.id;
    const acc = Store.get('accounts', c.acc);
    if (!acc) return head('Conciliação', '') + `<div class="card">${emptyBox('Cadastre uma conta bancária primeiro.', 'archive')}</div>`;
    const sys = Calc.accountBalance(acc.id);
    const pend = S().tx.filter((t) => t.paid && !t.reconciled && ((t.accountId === acc.id && (!t.cardId || t.cardPayment)) || t.toAccountId === acc.id)).sort((a, b) => a.date.localeCompare(b.date));
    const recBal = round2(sys - pend.reduce((s, t) => s + signed(t, acc.id), 0));
    const diff = c.bank !== '' ? round2(num(c.bank) - sys) : null;
    return head('Conciliação e importação', 'Confira seu extrato bancário com o sistema e importe arquivos OFX/CSV') + `
      <div class="card" style="margin-bottom:24px"><div class="filters" style="align-items:center">
        <label class="muted" style="font-size:13px">Conta:</label>
        <select class="input" id="cAcc">${optList(S().accounts, acc.id)}</select>
        <label class="muted" style="font-size:13px;margin-left:auto">Saldo informado pelo banco:</label>
        <input class="input" id="cBank" inputmode="decimal" placeholder="0,00" value="${esc(c.bank)}" style="max-width:160px">
      </div>
      <div class="stat-grid" style="grid-template-columns:repeat(3,1fr)">
        <div class="cell">${ic('database')}<div><b>${money(sys)}</b><span>Saldo no sistema</span></div></div>
        <div class="cell">${ic('check-square')}<div><b>${money(recBal)}</b><span>Saldo conciliado</span></div></div>
        <div class="cell">${ic(diff === 0 ? 'check-circle' : 'alert-triangle')}<div><b class="${diff == null ? '' : diff === 0 ? 'pos' : 'neg'}">${diff == null ? '—' : money(diff)}</b><span>Diferença p/ banco</span></div></div>
      </div></div>
      <div class="grid g-2">
        <div class="card">
          <div class="card-header"><h5>Lançamentos não conciliados (${pend.length})</h5>${pend.length ? `<button class="btn btn-sm btn-primary" id="recAll">Conciliar todos</button>` : ''}</div>
          <div class="table-wrap" style="max-height:520px;overflow:auto">${pend.length ? `<table class="tbl"><tbody>${pend.map((t) => `<tr>
            <td><input type="checkbox" data-rc="${t.id}" style="accent-color:var(--primary);width:16px;height:16px"></td><td>${fdate(t.paidDate || t.date)}</td>
            <td class="desc-cell"><b>${esc(t.desc)}</b><small>${esc(t.type === 'transferencia' ? 'Transferência' : catName(t.categoryId))}</small></td>
            <td class="num ${signed(t, acc.id) >= 0 ? 'pos' : 'neg'}">${money(signed(t, acc.id))}</td></tr>`).join('')}</tbody></table>` : emptyBox('Tudo conciliado nesta conta.', 'check-circle')}</div>
        </div>
        <div class="card">
          <div class="card-header"><h5>Importar extrato (OFX ou CSV)</h5></div>
          <div class="card-body">
            <p class="muted" style="margin-top:0">OFX: exportado pelo internet banking. CSV: colunas <code>data;descrição;valor</code> (valores negativos = despesa). Duplicados são detectados automaticamente.</p>
            <input type="file" id="cFile" accept=".ofx,.csv,.txt" class="input">
            <div id="cPrev" style="margin-top:16px"></div>
          </div>
        </div>
      </div>`;
  },
  after() {
    const c = app.sub.conc;
    $('#cAcc') && ($('#cAcc').onchange = (e) => { c.acc = e.target.value; c.preview = null; refresh(); });
    if (!$('#cBank')) return;
    $('#cBank').onchange = (e) => { c.bank = e.target.value; refresh(); };
    $$('[data-rc]').forEach((b) => b.onchange = () => { const t = Store.get('tx', b.dataset.rc); t.reconciled = true; Store.log('conciliou', 'tx', t.desc); Store.save(); toast('Conciliado'); setTimeout(refresh, 250); });
    $('#recAll') && ($('#recAll').onclick = () => { S().tx.forEach((t) => { if (t.paid && !t.reconciled && (t.accountId === c.acc || t.toAccountId === c.acc) && (!t.cardId || t.cardPayment)) t.reconciled = true; }); Store.log('conciliou', 'tx', 'Conciliação em lote'); Store.save(); refresh(); });
    $('#cFile').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const text = await f.text();
      const rows = /<OFX>|<STMTTRN>/i.test(text) ? parseOFX(text) : parseCSV(text);
      if (!rows.length) return toast('Nenhuma transação encontrada no arquivo');
      rows.forEach((r) => { r.dup = S().tx.some((t) => t.accountId === c.acc && Math.abs(t.amount - Math.abs(r.amount)) < 0.01 && Math.abs(parseD(t.date) - parseD(r.date)) <= 3 * 864e5); r.on = !r.dup; });
      c.preview = rows; this.preview();
    };
    if (c.preview) this.preview();
  },
  preview() {
    const rows = app.sub.conc.preview;
    $('#cPrev').innerHTML = `
      <div class="form-grid" style="margin-bottom:12px">
        ${field('Categoria p/ despesas', `<select class="input" id="impCatD">${catOptions('despesa')}</select>`)}
        ${field('Categoria p/ receitas', `<select class="input" id="impCatR">${catOptions('receita')}</select>`)}
      </div>
      <div class="table-wrap" style="max-height:320px;overflow:auto;border:1px solid var(--border);border-radius:6px"><table class="tbl"><tbody>
      ${rows.map((r, i) => `<tr><td><input type="checkbox" data-i="${i}" ${r.on ? 'checked' : ''} style="accent-color:var(--primary)"></td><td>${fdate(r.date)}</td><td>${esc(r.desc)} ${r.dup ? '<span class="badge b-warning">possível duplicado</span>' : ''}</td><td class="num ${r.amount >= 0 ? 'pos' : 'neg'}">${money(r.amount)}</td></tr>`).join('')}
      </tbody></table></div>
      <button class="btn btn-primary" id="doImport" style="margin-top:14px">${ic('upload')}Importar selecionados</button>`;
    feather.replace();
    $$('[data-i]', $('#cPrev')).forEach((b) => b.onchange = () => { rows[b.dataset.i].on = b.checked; });
    $('#doImport').onclick = () => {
      const acc = app.sub.conc.acc; let n = 0;
      rows.filter((r) => r.on).forEach((r) => {
        const type = r.amount >= 0 ? 'receita' : 'despesa';
        S().tx.push({ id: uid(), type, desc: r.desc, amount: round2(Math.abs(r.amount)), date: r.date, paidDate: r.date, accountId: acc, categoryId: (type === 'receita' ? $('#impCatR') : $('#impCatD')).value || null, paid: true, reconciled: true, notes: 'Importado', costCenterId: null, contactId: null });
        n++;
      });
      Store.log('importou', 'tx', `${n} lançamentos importados`); Store.save();
      app.sub.conc.preview = null; toast(`${n} lançamentos importados`); refresh();
    };
  },
};
function signed(t, accId) {
  if (t.type === 'transferencia') return t.toAccountId === accId ? t.amount : -t.amount;
  return t.type === 'receita' ? t.amount : -t.amount;
}
function parseOFX(text) {
  const out = [];
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  for (const b of blocks) {
    const g = (tag) => (b.match(new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i')) || [])[1]?.trim();
    const d = g('DTPOSTED'); const amt = g('TRNAMT');
    if (!d || !amt) continue;
    out.push({ date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, amount: num(amt.replace(',', '.')), desc: g('MEMO') || g('NAME') || 'Transação importada' });
  }
  return out;
}
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const sep = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
  const out = [];
  for (const l of lines) {
    const cols = l.split(sep).map((c) => c.replace(/^"|"$/g, '').trim());
    if (cols.length < 3) continue;
    let [d, desc, v] = cols;
    let date = null;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) date = d.split('/').reverse().join('-');
    else if (/^\d{4}-\d{2}-\d{2}/.test(d)) date = d.slice(0, 10);
    if (!date) continue;
    const amount = num(v.replace(/[R$\s]/g, ''));
    if (!amount) continue;
    out.push({ date, desc: desc || 'Transação importada', amount });
  }
  return out;
}

/* ====================================================================== */
/* ORÇAMENTO                                                              */
/* ====================================================================== */
ROUTES.orcamento = {
  html() {
    const m = app.month;
    const rows = S().budgets.map((b) => ({ b, c: Store.get('categories', b.categoryId), spent: Calc.spentInCategory(b.categoryId, m) })).filter((r) => r.c);
    const tB = rows.reduce((s, r) => s + Number(r.b.amount), 0), tS = rows.reduce((s, r) => s + r.spent, 0);
    const unbudgeted = Calc.byCategory(m, 'despesa').filter((x) => !S().budgets.some((b) => b.categoryId === x.id));
    return head('Orçamento', `Planejado x realizado em ${monthName(m, true)} — o orçamento vale para todos os meses`, `<button class="btn btn-primary" id="newBud">${ic('plus')}Definir orçamento</button>`) + `
      <div class="grid g-3" style="margin-bottom:24px">
        <div class="card"><div class="kpi"><div><h6 class="muted">Orçado</h6><div class="val">${money(tB)}</div></div>${ic('clipboard')}</div></div>
        <div class="card primary"><div class="kpi"><div><h6>Gasto nas categorias orçadas</h6><div class="val">${money(tS)}</div></div>${ic('shopping-bag')}</div></div>
        <div class="card"><div class="kpi"><div><h6 class="muted">Saldo do orçamento</h6><div class="val ${tB - tS >= 0 ? 'pos' : 'neg'}">${money(tB - tS)}</div></div>${ic('pie-chart')}</div></div>
      </div>
      <div class="grid g-2">
        <div class="card"><div class="card-header"><h5>Categorias orçadas</h5></div>
          ${rows.length ? rows.map(({ b, c, spent }) => { const p = b.amount ? spent / b.amount * 100 : 0; return `
            <div class="list-item" style="display:block">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px">
                <b style="font-weight:500"><span class="dot-c" style="background:${c.color}"></span>${esc(c.name)}</b>
                <span>${money(spent)} <span class="muted">/ ${money(b.amount)}</span>
                <button class="btn-icon" data-eb="${b.id}">${ic('edit-2')}</button><button class="btn-icon" data-db="${b.id}">${ic('trash-2')}</button></span>
              </div>
              <div class="progress ${p > 100 ? 'over' : p >= 90 ? 'warn' : ''}"><div style="width:${Math.min(100, p)}%"></div></div>
              <small class="muted">${pct(p)} utilizado · ${spent > b.amount ? `<span class="neg">excedeu ${money(spent - b.amount)}</span>` : `restam ${money(b.amount - spent)}`}</small>
            </div>`; }).join('') : emptyBox('Defina limites de gasto por categoria.', 'pie-chart')}
        </div>
        <div class="stack">
          <div class="card"><div class="card-header"><h5>Orçado x realizado</h5></div><div class="card-body"><div id="chBud"></div></div></div>
          <div class="card"><div class="card-header"><h5>Gastos sem orçamento</h5></div>
            ${unbudgeted.length ? unbudgeted.map((x) => `<div class="list-item"><span class="dot-c" style="background:${x.color}"></span><div class="grow"><b>${esc(x.name)}</b></div><b>${money(x.value)}</b></div>`).join('') : emptyBox('Todos os gastos do mês estão cobertos.', 'check-circle')}
          </div>
        </div>
      </div>`;
  },
  after() {
    $('#newBud').onclick = () => budForm();
    $$('[data-eb]').forEach((b) => b.onclick = () => budForm(Store.get('budgets', b.dataset.eb)));
    $$('[data-db]').forEach((b) => b.onclick = () => { Store.remove('budgets', b.dataset.db, 'orçamento'); refresh(); });
    const rows = S().budgets.map((b) => ({ b, c: Store.get('categories', b.categoryId) })).filter((r) => r.c);
    if (!rows.length) return;
    chart($('#chBud'), {
      chart: { type: 'bar', height: Math.max(220, rows.length * 52) }, plotOptions: { bar: { horizontal: true, barHeight: '60%' } },
      series: [{ name: 'Orçado', data: rows.map((r) => Number(r.b.amount)) }, { name: 'Realizado', data: rows.map((r) => Calc.spentInCategory(r.c.id, app.month)) }],
      colors: ['#d6d3fb', '#7267ef'], xaxis: { categories: rows.map((r) => r.c.name), labels: { formatter: (v) => moneyShort(v) } }, legend: { position: 'bottom' },
    });
  },
};
function budForm(b = {}) {
  modal(b.id ? 'Editar orçamento' : 'Novo orçamento', `<div class="form-grid">
    ${field('Categoria de despesa', `<select class="input" name="categoryId" required>${catOptions('despesa', b.categoryId, null)}</select>`, 'full')}
    ${field('Limite mensal (R$)', `<input class="input" name="amount" required inputmode="decimal" value="${b.amount ?? ''}">`, 'full')}
  </div>`, {
    onSave: (d) => {
      const ex = S().budgets.find((x) => x.categoryId === d.categoryId && x.id !== b.id);
      Store.upsert('budgets', { ...(ex || b), categoryId: d.categoryId, amount: num(d.amount) }, 'orçamento ' + catName(d.categoryId));
      if (ex && b.id) Store.remove('budgets', b.id);
      toast('Orçamento salvo');
    },
  });
}

/* ====================================================================== */
/* METAS                                                                  */
/* ====================================================================== */
ROUTES.metas = {
  html() {
    const g = S().goals;
    return head('Metas financeiras', 'Objetivos de poupança e acompanhamento', `<button class="btn btn-primary" id="newGoal">${ic('plus')}Nova meta</button>`) + `
      <div class="grid g-3">${g.map((x) => {
        const p = x.target ? Math.min(100, x.saved / x.target * 100) : 0;
        const monthsLeft = x.deadline ? Math.max(1, Math.round((parseD(x.deadline) - new Date()) / (30.4 * 864e5))) : null;
        const perMonth = monthsLeft ? Math.max(0, (x.target - x.saved) / monthsLeft) : null;
        return `<div class="card"><div class="tile">
          <div class="tile-top"><h6><span class="dot-c" style="background:${x.color}"></span>${esc(x.name)}</h6>
            <span><button class="btn-icon" data-eg="${x.id}">${ic('edit-2')}</button><button class="btn-icon" data-dg="${x.id}">${ic('trash-2')}</button></span></div>
          <div class="big-num">${money(x.saved)}</div><span class="muted">de ${money(x.target)}</span>
          <div class="progress" style="margin:14px 0 6px"><div style="width:${p}%;background:${x.color}"></div></div>
          <div class="row" style="margin-top:0"><span class="muted">${pct(p)} concluído</span><span class="muted">${x.deadline ? 'até ' + fdate(x.deadline) : 'sem prazo'}</span></div>
          ${perMonth != null && p < 100 ? `<div class="row"><span>Guardar por mês</span><b>${money(perMonth)}</b></div>` : p >= 100 ? '<div class="row"><span class="badge b-success">Meta atingida 🎉</span></div>' : ''}
          <div style="display:flex;gap:8px;margin-top:16px"><button class="btn btn-sm btn-primary" data-dep="${x.id}">${ic('plus')}Depositar</button><button class="btn btn-sm btn-light" data-wd="${x.id}">${ic('minus')}Retirar</button></div>
        </div></div>`;
      }).join('') || `<div class="card" style="grid-column:1/-1">${emptyBox('Crie sua primeira meta — reserva de emergência, viagem, carro…', 'target')}</div>`}</div>`;
  },
  after() {
    $('#newGoal').onclick = () => goalForm();
    $$('[data-eg]').forEach((b) => b.onclick = () => goalForm(Store.get('goals', b.dataset.eg)));
    $$('[data-dg]').forEach((b) => b.onclick = () => confirmBox('Excluir esta meta?', () => Store.remove('goals', b.dataset.dg)));
    const move = (id, sign) => {
      const g = Store.get('goals', id);
      modal(sign > 0 ? 'Depositar na meta' : 'Retirar da meta', field('Valor (R$)', '<input class="input" name="v" required inputmode="decimal">'), {
        onSave: (d) => { Store.upsert('goals', { ...g, saved: round2(Math.max(0, Number(g.saved) + sign * num(d.v))) }, `${g.name}: ${sign > 0 ? '+' : '−'}${money(num(d.v))}`); toast('Meta atualizada'); },
      });
    };
    $$('[data-dep]').forEach((b) => b.onclick = () => move(b.dataset.dep, 1));
    $$('[data-wd]').forEach((b) => b.onclick = () => move(b.dataset.wd, -1));
  },
};
function goalForm(g = {}) {
  modal(g.id ? 'Editar meta' : 'Nova meta', `<div class="form-grid">
    ${field('Nome', `<input class="input" name="name" required value="${esc(g.name)}">`, 'full')}
    ${field('Valor alvo (R$)', `<input class="input" name="target" required inputmode="decimal" value="${g.target ?? ''}">`)}
    ${field('Já guardado (R$)', `<input class="input" name="saved" inputmode="decimal" value="${g.saved ?? 0}">`)}
    ${field('Prazo', `<input class="input" type="date" name="deadline" value="${g.deadline || ''}">`)}
    ${field('Cor', `<input class="input" type="color" name="color" value="${g.color || '#7267ef'}" style="height:40px;padding:4px">`)}
  </div>`, { onSave: (d) => { Store.upsert('goals', { ...g, name: d.name, target: num(d.target), saved: num(d.saved), deadline: d.deadline, color: d.color }); toast('Meta salva'); } });
}

/* ====================================================================== */
/* INVESTIMENTOS                                                          */
/* ====================================================================== */
function irEstimate(i) {
  const gain = Number(i.current) - Number(i.invested);
  if (gain <= 0) return { rate: 0, value: 0 };
  if (/vari/i.test(i.type)) return { rate: 15, value: gain * 0.15 };
  if (/isent|lci|lca|poupan/i.test(i.type + ' ' + i.name)) return { rate: 0, value: 0 };
  const days = i.date ? (new Date() - parseD(i.date)) / 864e5 : 0;
  const rate = days <= 180 ? 22.5 : days <= 360 ? 20 : days <= 720 ? 17.5 : 15;
  return { rate, value: gain * rate / 100 };
}
ROUTES.investimentos = {
  html() {
    const inv = S().investments, t = Calc.investTotals();
    const ir = inv.reduce((s, i) => s + irEstimate(i).value, 0);
    return head('Investimentos', 'Carteira, rentabilidade e IR estimado', `<button class="btn btn-primary" id="newInv">${ic('plus')}Novo investimento</button>`) + `
      <div class="grid g-4" style="margin-bottom:24px">
        <div class="card"><div class="kpi"><div><h6 class="muted">Total aplicado</h6><div class="val">${money(t.invested)}</div></div>${ic('download')}</div></div>
        <div class="card primary"><div class="kpi"><div><h6>Valor atual</h6><div class="val">${money(t.current)}</div></div>${ic('trending-up')}</div></div>
        <div class="card"><div class="kpi"><div><h6 class="muted">Rendimento</h6><div class="val ${t.gain >= 0 ? 'pos' : 'neg'}">${money(t.gain)} <small style="font-size:13px">(${pct(t.invested ? t.gain / t.invested * 100 : 0)})</small></div></div>${ic('percent')}</div></div>
        <div class="card"><div class="kpi"><div><h6 class="muted">IR estimado no resgate</h6><div class="val">${money(ir)}</div></div>${ic('file-text')}</div></div>
      </div>
      <div class="grid dash">
        <div class="card"><div class="table-wrap">${inv.length ? `<table class="tbl"><thead><tr><th>Ativo</th><th class="num">Aplicado</th><th class="num">Atual</th><th class="num">Rent.</th><th class="num">IR est.</th><th class="act"></th></tr></thead><tbody>
          ${inv.map((i) => { const g = i.current - i.invested, e = irEstimate(i); return `<tr>
            <td class="desc-cell"><b>${esc(i.name)}</b><small>${esc(i.type)} · ${esc(i.broker || '')} · desde ${fdate(i.date)}</small></td>
            <td class="num">${money(i.invested)}</td><td class="num">${money(i.current)}</td>
            <td class="num ${g >= 0 ? 'pos' : 'neg'}">${pct(i.invested ? g / i.invested * 100 : 0)}</td>
            <td class="num">${money(e.value)}<br><small class="muted">${e.rate}%</small></td>
            <td class="act"><button class="btn-icon" data-ei="${i.id}">${ic('edit-2')}</button><button class="btn-icon" data-di="${i.id}">${ic('trash-2')}</button></td></tr>`; }).join('')}
          </tbody></table>` : emptyBox('Cadastre seus investimentos para acompanhar a carteira.', 'trending-up')}</div>
          <div class="card-body muted" style="font-size:12px;border-top:1px solid var(--border)">IR estimado: renda fixa pela tabela regressiva (22,5% → 15% conforme o prazo), renda variável 15% sobre o ganho, LCI/LCA/poupança isentos. Valor aproximado — não substitui o informe da corretora.</div>
        </div>
        <div class="card"><div class="card-header"><h5>Distribuição da carteira</h5></div><div class="card-body"><div id="chInv"></div></div></div>
      </div>`;
  },
  after() {
    $('#newInv').onclick = () => invForm();
    $$('[data-ei]').forEach((b) => b.onclick = () => invForm(Store.get('investments', b.dataset.ei)));
    $$('[data-di]').forEach((b) => b.onclick = () => confirmBox('Excluir este investimento?', () => Store.remove('investments', b.dataset.di)));
    const by = {}; S().investments.forEach((i) => by[i.type] = (by[i.type] || 0) + Number(i.current));
    if (!Object.keys(by).length) return;
    chart($('#chInv'), { chart: { type: 'donut', height: 300 }, series: Object.values(by), labels: Object.keys(by), colors: PALETTE, legend: { position: 'bottom' }, plotOptions: { pie: { donut: { size: '62%' } } } });
  },
};
function invForm(i = {}) {
  const types = ['Renda fixa', 'Renda variável', 'Fundos', 'Tesouro Direto', 'LCI/LCA (isento)', 'Previdência', 'Criptomoedas', 'Outros'];
  modal(i.id ? 'Editar investimento' : 'Novo investimento', `<div class="form-grid">
    ${field('Nome do ativo', `<input class="input" name="name" required value="${esc(i.name)}" placeholder="Ex.: CDB Banco X 2027">`, 'full')}
    ${field('Tipo', `<select class="input" name="type">${types.map((t) => `<option ${i.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>`)}
    ${field('Instituição', `<input class="input" name="broker" value="${esc(i.broker)}">`)}
    ${field('Valor aplicado (R$)', `<input class="input" name="invested" required inputmode="decimal" value="${i.invested ?? ''}">`)}
    ${field('Valor atual (R$)', `<input class="input" name="current" required inputmode="decimal" value="${i.current ?? ''}">`)}
    ${field('Data da aplicação', `<input class="input" type="date" name="date" value="${i.date || todayStr()}">`)}
  </div>`, { onSave: (d) => { Store.upsert('investments', { ...i, ...d, invested: num(d.invested), current: num(d.current) }); toast('Investimento salvo'); } });
}

/* ====================================================================== */
/* PATRIMÔNIO                                                             */
/* ====================================================================== */
ROUTES.patrimonio = {
  html() {
    const n = Calc.netWorth();
    const items = S().assets;
    return head('Patrimônio', 'Bens, direitos e obrigações', `<button class="btn btn-primary" id="newAsset">${ic('plus')}Novo bem ou dívida</button>`) + `
      <div class="grid dash">
        <div class="stack">
          <div class="card"><div class="stat-grid">
            ${[['archive', n.cash, 'Saldo em contas'], ['trending-up', n.inv, 'Investimentos'], ['home', n.bens, 'Bens'], ['minus-circle', -n.dividas, 'Dívidas'], ['credit-card', -n.cards, 'Faturas em aberto'], ['award', n.total, 'Patrimônio líquido']]
              .map(([i, v, l]) => `<div class="cell">${ic(i)}<div><b class="${v < 0 ? 'neg' : ''}">${money(v)}</b><span>${l}</span></div></div>`).join('')}
          </div></div>
          <div class="card"><div class="card-header"><h5>Bens e dívidas</h5></div>
            ${items.length ? items.map((a) => `<div class="list-item"><div class="ico ${a.kind === 'bem' ? 'r' : 'd'}">${ic(a.kind === 'bem' ? 'home' : 'minus-circle')}</div>
              <div class="grow"><b>${esc(a.name)}</b><small>${a.kind === 'bem' ? 'Bem / direito' : 'Dívida / obrigação'}${a.notes ? ' · ' + esc(a.notes) : ''}</small></div>
              <b class="${a.kind === 'bem' ? '' : 'neg'}">${money(a.value)}</b><button class="btn-icon" data-ea="${a.id}">${ic('edit-2')}</button><button class="btn-icon" data-da="${a.id}">${ic('trash-2')}</button></div>`).join('') : emptyBox('Cadastre imóveis, veículos, financiamentos…', 'home')}
          </div>
        </div>
        <div class="card"><div class="card-header"><h5>Evolução do saldo em contas — 12 meses</h5></div><div class="card-body"><div id="chNw"></div></div></div>
      </div>`;
  },
  after() {
    $('#newAsset').onclick = () => assetForm();
    $$('[data-ea]').forEach((b) => b.onclick = () => assetForm(Store.get('assets', b.dataset.ea)));
    $$('[data-da]').forEach((b) => b.onclick = () => confirmBox('Excluir este item?', () => Store.remove('assets', b.dataset.da)));
    const months = Array.from({ length: 12 }, (_, i) => addYm(ym(todayStr()), i - 11));
    chart($('#chNw'), {
      chart: { type: 'area', height: 340 }, series: [{ name: 'Saldo', data: months.map((m) => Calc.totalBalance(`${m}-31`)) }],
      colors: ['#7267ef'], stroke: { curve: 'smooth', width: 2.5 }, fill: { type: 'gradient', gradient: { opacityFrom: .4, opacityTo: .05 } },
      xaxis: { categories: months.map((m) => monthName(m)) }, yaxis: { labels: { formatter: (v) => moneyShort(v) } },
    });
  },
};
function assetForm(a = {}) {
  modal(a.id ? 'Editar item' : 'Novo bem ou dívida', `<div class="form-grid">
    ${field('Tipo', `<select class="input" name="kind"><option value="bem" ${a.kind !== 'divida' ? 'selected' : ''}>Bem / direito</option><option value="divida" ${a.kind === 'divida' ? 'selected' : ''}>Dívida / obrigação</option></select>`)}
    ${field('Valor (R$)', `<input class="input" name="value" required inputmode="decimal" value="${a.value ?? ''}">`)}
    ${field('Descrição', `<input class="input" name="name" required value="${esc(a.name)}">`, 'full')}
    ${field('Observações', `<input class="input" name="notes" value="${esc(a.notes)}">`, 'full')}
  </div>`, { onSave: (d) => { Store.upsert('assets', { ...a, ...d, value: num(d.value) }); toast('Salvo'); } });
}

/* ====================================================================== */
/* RELATÓRIOS                                                             */
/* ====================================================================== */
app.sub.rep = 'categorias';
ROUTES.relatorios = {
  html() {
    const tab = app.sub.rep;
    const tabs = [['categorias', 'Por categoria'], ['fluxo', 'Fluxo de caixa'], ['dre', 'DRE gerencial'], ['centros', 'Centros de custo'], ['projecao', 'Projeção e cenários']];
    return head('Relatórios', 'Análises para tomada de decisão', `<button class="btn btn-outline" id="repCsv">${ic('download')}Exportar CSV</button><button class="btn btn-outline" onclick="window.print()">${ic('printer')}Imprimir</button>`) + `
      <div class="card"><div class="tabs">${tabs.map(([k, v]) => `<button data-rt="${k}" class="${tab === k ? 'on' : ''}">${v}</button>`).join('')}</div>
      <div id="repBody">${this[tab]()}</div></div>`;
  },
  csv: [],
  categorias() {
    const m = app.month, d = Calc.byCategory(m, 'despesa'), r = Calc.byCategory(m, 'receita');
    const td = d.reduce((s, x) => s + x.value, 0), tr = r.reduce((s, x) => s + x.value, 0);
    this.csv = [['Tipo', 'Categoria', 'Valor', '%'], ...r.map((x) => ['Receita', x.name, x.value, (x.value / tr * 100).toFixed(1)]), ...d.map((x) => ['Despesa', x.name, x.value, (x.value / td * 100).toFixed(1)])];
    const tbl = (arr, tot, cls) => arr.length ? `<table class="tbl"><tbody>${arr.map((x) => `<tr><td><span class="dot-c" style="background:${x.color}"></span>${esc(x.name)}</td><td class="num ${cls}">${money(x.value)}</td><td class="num muted">${pct(x.value / tot * 100)}</td></tr>`).join('')}</tbody><tfoot><tr><td>Total</td><td class="num">${money(tot)}</td><td></td></tr></tfoot></table>` : emptyBox('Sem dados.');
    return `<div class="card-body"><div class="grid g-2">
      <div><h5 style="margin-bottom:10px">Despesas — ${monthName(m, true)}</h5><div id="chRepD"></div>${tbl(d, td, 'neg')}</div>
      <div><h5 style="margin-bottom:10px">Receitas — ${monthName(m, true)}</h5><div id="chRepR"></div>${tbl(r, tr, 'pos')}</div></div></div>`;
  },
  fluxo() {
    const months = Array.from({ length: 12 }, (_, i) => addYm(app.month, i - 11));
    let acc = 0;
    const rows = months.map((m) => { const t = Calc.monthTotals(m); acc += t.res; return { m, ...t, acc, bal: Calc.totalBalance(`${m}-31`) }; });
    this.csv = [['Mês', 'Receitas', 'Despesas', 'Resultado', 'Acumulado', 'Saldo em contas'], ...rows.map((r) => [r.m, r.rec, r.desp, r.res, round2(r.acc), r.bal])];
    return `<div class="card-body"><div id="chRepF"></div></div><div class="table-wrap"><table class="tbl"><thead><tr><th>Mês</th><th class="num">Receitas</th><th class="num">Despesas</th><th class="num">Resultado</th><th class="num">Acumulado</th><th class="num">Saldo em contas</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td style="text-transform:capitalize">${monthName(r.m, true)}</td><td class="num pos">${money(r.rec)}</td><td class="num neg">${money(r.desp)}</td><td class="num ${r.res >= 0 ? 'pos' : 'neg'}">${money(r.res)}</td><td class="num">${money(r.acc)}</td><td class="num">${money(r.bal)}</td></tr>`).join('')}
      </tbody></table></div>`;
  },
  dre() {
    const y = app.month.slice(0, 4);
    const months = Array.from({ length: 12 }, (_, i) => `${y}-${pad(i + 1)}`);
    const roots = (type) => S().categories.filter((c) => c.type === type && !c.parentId);
    const line = (type, cat) => months.map((m) => Calc.byCategory(m, type).find((x) => x.id === cat.id)?.value || 0);
    const rec = roots('receita').map((c) => ({ c, v: line('receita', c) })).filter((x) => x.v.some(Boolean));
    const desp = roots('despesa').map((c) => ({ c, v: line('despesa', c) })).filter((x) => x.v.some(Boolean));
    const sumCols = (arr) => months.map((_, i) => arr.reduce((s, x) => s + x.v[i], 0));
    const tR = sumCols(rec), tD = sumCols(desp), res = tR.map((v, i) => v - tD[i]);
    const tot = (a) => a.reduce((s, v) => s + v, 0);
    this.csv = [['Conta', ...months, 'Total'], ...rec.map((x) => [x.c.name, ...x.v, tot(x.v)]), ['(=) Receita total', ...tR, tot(tR)], ...desp.map((x) => [x.c.name, ...x.v, tot(x.v)]), ['(-) Despesa total', ...tD, tot(tD)], ['(=) Resultado', ...res, tot(res)]];
    const cell = (v, cls = '') => `<td class="num ${cls}">${v ? money(v).replace('R$', '').trim() : '–'}</td>`;
    const row = (label, arr, style = '', cls = '') => `<tr style="${style}"><td style="white-space:nowrap">${label}</td>${arr.map((v) => cell(v, cls)).join('')}${cell(tot(arr), cls)}</tr>`;
    return `<div class="card-body" style="padding-bottom:0"><p class="muted" style="margin:0">Demonstrativo de resultado de ${y} por regime de competência (data do lançamento). Valores em R$.</p></div>
      <div class="table-wrap" style="padding:16px 0"><table class="tbl" style="font-size:12.5px"><thead><tr><th>Conta</th>${months.map((m) => `<th class="num">${monthName(m).split(' ')[0]}</th>`).join('')}<th class="num">Total</th></tr></thead><tbody>
      <tr><td colspan="14"><b>Receitas operacionais</b></td></tr>
      ${rec.map((x) => row('&nbsp;&nbsp;' + esc(x.c.name), x.v)).join('')}
      ${row('<b>(=) Receita total</b>', tR, 'background:#f6f5fe;font-weight:600', 'pos')}
      <tr><td colspan="14"><b>Despesas</b></td></tr>
      ${desp.map((x) => row('&nbsp;&nbsp;' + esc(x.c.name), x.v)).join('')}
      ${row('<b>(−) Despesa total</b>', tD, 'background:#fdf3f3;font-weight:600', 'neg')}
      ${row('<b>(=) Resultado líquido</b>', res, 'background:var(--primary-soft);font-weight:700')}
      ${row('Margem (%)', tR.map((v, i) => v ? round2(res[i] / v * 100) : 0)).replace(/R\$/g, '')}
      </tbody></table></div>`;
  },
  centros() {
    const m = app.month, y = m.slice(0, 4);
    const calc = (ccId, filter) => {
      let rec = 0, desp = 0;
      S().tx.forEach((t) => { if (!Calc.isResult(t) || (t.costCenterId || null) !== ccId || !filter(t)) return; if (t.type === 'receita') rec += t.amount; else desp += t.amount; });
      return { rec, desp, res: rec - desp };
    };
    const list = [...S().costCenters, { id: null, name: 'Sem centro de custo' }];
    const rows = list.map((c) => ({ c, mo: calc(c.id, (t) => ym(t.date) === m), yr: calc(c.id, (t) => t.date.startsWith(y)) }));
    this.csv = [['Centro', 'Receitas mês', 'Despesas mês', 'Resultado mês', `Receitas ${y}`, `Despesas ${y}`, `Resultado ${y}`], ...rows.map((r) => [r.c.name, r.mo.rec, r.mo.desp, r.mo.res, r.yr.rec, r.yr.desp, r.yr.res])];
    return `<div class="table-wrap"><table class="tbl"><thead><tr><th>Centro de custo / projeto</th><th class="num">Receitas mês</th><th class="num">Despesas mês</th><th class="num">Resultado mês</th><th class="num">Resultado ${y}</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${esc(r.c.name)}</td><td class="num pos">${money(r.mo.rec)}</td><td class="num neg">${money(r.mo.desp)}</td><td class="num ${r.mo.res >= 0 ? 'pos' : 'neg'}">${money(r.mo.res)}</td><td class="num ${r.yr.res >= 0 ? 'pos' : 'neg'}">${money(r.yr.res)}</td></tr>`).join('')}
      </tbody></table></div><div class="card-body"><div id="chRepC"></div></div>`;
  },
  projecao() {
    const cur = ym(todayStr());
    const hist = Array.from({ length: 6 }, (_, i) => Calc.monthTotals(addYm(cur, -i - 1)));
    const avgR = hist.reduce((s, x) => s + x.rec, 0) / 6, avgD = hist.reduce((s, x) => s + x.desp, 0) / 6;
    const sc = app.sub.scen || { r: 0, d: 0 };
    app.sub.scen = sc;
    const open = Calc.openItems();
    let bal = Calc.totalBalance();
    const rows = Array.from({ length: 6 }, (_, i) => {
      const m = addYm(cur, i);
      const pend = open.filter((x) => ym(x.date) === m || (i === 0 && ym(x.date) < m));
      const pr = pend.filter((x) => x.kind === 'receber').reduce((s, x) => s + x.amount, 0);
      const pp = pend.filter((x) => x.kind === 'pagar').reduce((s, x) => s + x.amount, 0);
      // meses futuros sem lançamentos usam a média histórica ajustada pelo cenário
      const r = (i === 0 ? pr : Math.max(pr, avgR)) * (1 + sc.r / 100);
      const d = (i === 0 ? pp : Math.max(pp, avgD)) * (1 + sc.d / 100);
      bal += r - d;
      return { m, r, d, bal };
    });
    this.csv = [['Mês', 'Entradas previstas', 'Saídas previstas', 'Saldo projetado'], ...rows.map((x) => [x.m, round2(x.r), round2(x.d), round2(x.bal)])];
    return `<div class="card-body">
      <p class="muted" style="margin-top:0">Saldo atual de ${money(Calc.totalBalance())} + compromissos em aberto. Meses sem lançamentos usam a média dos últimos 6 meses (receitas ${money(avgR)} · despesas ${money(avgD)}). Ajuste os cenários:</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">
        <div class="seg" id="scen">${[['Pessimista', -10, 10], ['Realista', 0, 0], ['Otimista', 10, -5]].map(([l, r, d]) => `<button data-r="${r}" data-d="${d}" class="${sc.r === r && sc.d === d ? 'on' : ''}">${l}</button>`).join('')}</div>
        <label class="check">Receitas % <input class="input" id="scR" type="number" value="${sc.r}" style="width:80px"></label>
        <label class="check">Despesas % <input class="input" id="scD" type="number" value="${sc.d}" style="width:80px"></label>
      </div><div id="chRepP"></div></div>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>Mês</th><th class="num">Entradas</th><th class="num">Saídas</th><th class="num">Saldo projetado</th></tr></thead><tbody>
      ${rows.map((x) => `<tr><td style="text-transform:capitalize">${monthName(x.m, true)}</td><td class="num pos">${money(x.r)}</td><td class="num neg">${money(x.d)}</td><td class="num ${x.bal >= 0 ? '' : 'neg'}"><b>${money(x.bal)}</b></td></tr>`).join('')}
      </tbody></table></div>`;
  },
  after() {
    $$('[data-rt]').forEach((b) => b.onclick = () => { app.sub.rep = b.dataset.rt; refresh(); });
    $('#repCsv').onclick = () => downloadCSV(`relatorio-${app.sub.rep}-${app.month}.csv`, this.csv);
    const tab = app.sub.rep;
    if (tab === 'categorias') {
      const pie = (el, data) => data.length && chart(el, { chart: { type: 'donut', height: 260 }, series: data.map((x) => x.value), labels: data.map((x) => x.name), colors: data.map((_, i) => PALETTE[i % PALETTE.length]), legend: { show: false }, plotOptions: { pie: { donut: { size: '60%' } } } });
      pie($('#chRepD'), Calc.byCategory(app.month, 'despesa')); pie($('#chRepR'), Calc.byCategory(app.month, 'receita'));
    }
    if (tab === 'fluxo') {
      const months = Array.from({ length: 12 }, (_, i) => addYm(app.month, i - 11)), t = months.map((m) => Calc.monthTotals(m));
      chart($('#chRepF'), { chart: { type: 'bar', height: 300 }, series: [{ name: 'Receitas', data: t.map((x) => x.rec) }, { name: 'Despesas', data: t.map((x) => x.desp) }], colors: ['#b3adf7', '#7267ef'], plotOptions: { bar: { columnWidth: '55%' } }, xaxis: { categories: months.map((m) => monthName(m)) }, yaxis: { labels: { formatter: moneyShort } }, legend: { position: 'bottom' } });
    }
    if (tab === 'centros') {
      const rows = this.csv.slice(1);
      chart($('#chRepC'), { chart: { type: 'bar', height: 260 }, series: [{ name: 'Receitas', data: rows.map((r) => round2(r[1])) }, { name: 'Despesas', data: rows.map((r) => round2(r[2])) }], colors: ['#b3adf7', '#7267ef'], xaxis: { categories: rows.map((r) => r[0]) }, yaxis: { labels: { formatter: moneyShort } }, legend: { position: 'bottom' } });
    }
    if (tab === 'projecao') {
      const rows = this.csv.slice(1);
      chart($('#chRepP'), { chart: { type: 'line', height: 280 }, series: [{ name: 'Entradas', type: 'column', data: rows.map((r) => r[1]) }, { name: 'Saídas', type: 'column', data: rows.map((r) => r[2]) }, { name: 'Saldo projetado', type: 'line', data: rows.map((r) => r[3]) }], colors: ['#b3adf7', '#7267ef', '#1c232f'], stroke: { width: [0, 0, 3], curve: 'smooth' }, xaxis: { categories: rows.map((r) => monthName(r[0])) }, yaxis: { labels: { formatter: moneyShort } }, legend: { position: 'bottom' } });
      $$('#scen button').forEach((b) => b.onclick = () => { app.sub.scen = { r: Number(b.dataset.r), d: Number(b.dataset.d) }; refresh(); });
      $('#scR').onchange = (e) => { app.sub.scen.r = Number(e.target.value) || 0; refresh(); };
      $('#scD').onchange = (e) => { app.sub.scen.d = Number(e.target.value) || 0; refresh(); };
    }
  },
};

/* ====================================================================== */
/* CADASTROS SIMPLES                                                      */
/* ====================================================================== */
ROUTES.centros = {
  html() {
    const y = app.month.slice(0, 4);
    return head('Centros de custo e projetos', 'Separe resultados por área, projeto ou finalidade', `<button class="btn btn-primary" id="newCC">${ic('plus')}Novo centro</button>`) + `
      <div class="card"><div class="table-wrap">${S().costCenters.length ? `<table class="tbl"><thead><tr><th>Nome</th><th class="num">Lançamentos</th><th class="num">Receitas ${y}</th><th class="num">Despesas ${y}</th><th class="num">Resultado ${y}</th><th class="act"></th></tr></thead><tbody>
      ${S().costCenters.map((c) => { const tx = S().tx.filter((t) => t.costCenterId === c.id && Calc.isResult(t)); const yr = tx.filter((t) => t.date.startsWith(y)); const r = yr.filter((t) => t.type === 'receita').reduce((s, t) => s + t.amount, 0), d = yr.filter((t) => t.type === 'despesa').reduce((s, t) => s + t.amount, 0);
        return `<tr><td>${esc(c.name)}</td><td class="num">${tx.length}</td><td class="num pos">${money(r)}</td><td class="num neg">${money(d)}</td><td class="num ${r - d >= 0 ? 'pos' : 'neg'}">${money(r - d)}</td>
        <td class="act"><button class="btn-icon" data-e="${c.id}">${ic('edit-2')}</button><button class="btn-icon" data-d="${c.id}">${ic('trash-2')}</button></td></tr>`; }).join('')}</tbody></table>` : emptyBox('Nenhum centro de custo.', 'layers')}</div></div>`;
  },
  after() {
    const form = (c = {}) => modal(c.id ? 'Editar centro de custo' : 'Novo centro de custo', field('Nome', `<input class="input" name="name" required value="${esc(c.name)}">`), { onSave: (d) => { Store.upsert('costCenters', { ...c, name: d.name }); toast('Salvo'); } });
    $('#newCC').onclick = () => form();
    $$('[data-e]').forEach((b) => b.onclick = () => form(Store.get('costCenters', b.dataset.e)));
    $$('[data-d]').forEach((b) => b.onclick = () => confirmBox('Excluir este centro? Os lançamentos ficarão sem centro de custo.', () => { S().tx.forEach((t) => { if (t.costCenterId === b.dataset.d) t.costCenterId = null; }); Store.remove('costCenters', b.dataset.d); }));
  },
};

app.sub.ct = '';
ROUTES.contatos = {
  html() {
    const list = S().contacts.filter((c) => !app.sub.ct || c.type === app.sub.ct);
    return head('Clientes e fornecedores', 'Cadastro de contatos vinculados aos lançamentos', `<button class="btn btn-primary" id="newCt">${ic('plus')}Novo contato</button>`) + `
      <div class="card"><div class="tabs">${[['', 'Todos'], ['cliente', 'Clientes'], ['fornecedor', 'Fornecedores']].map(([k, v]) => `<button data-f="${k}" class="${app.sub.ct === k ? 'on' : ''}">${v}</button>`).join('')}</div>
      <div class="table-wrap">${list.length ? `<table class="tbl"><thead><tr><th>Nome</th><th>Tipo</th><th>Contato</th><th class="num">Recebido</th><th class="num">Pago</th><th class="num">Em aberto</th><th class="act"></th></tr></thead><tbody>
      ${list.map((c) => { const tx = S().tx.filter((t) => t.contactId === c.id); const s = (f) => tx.filter(f).reduce((a, t) => a + t.amount, 0);
        return `<tr><td class="desc-cell"><b>${esc(c.name)}</b><small>${esc(c.doc || '')}</small></td><td><span class="badge ${c.type === 'cliente' ? 'b-success' : 'b-primary'}">${c.type === 'cliente' ? 'Cliente' : 'Fornecedor'}</span></td>
        <td class="desc-cell"><small>${esc(c.email || '')}${c.email && c.phone ? ' · ' : ''}${esc(c.phone || '')}</small></td>
        <td class="num pos">${money(s((t) => t.type === 'receita' && t.paid))}</td><td class="num neg">${money(s((t) => t.type === 'despesa' && t.paid))}</td><td class="num">${money(s((t) => !t.paid && !t.cardId))}</td>
        <td class="act"><button class="btn-icon" data-e="${c.id}">${ic('edit-2')}</button><button class="btn-icon" data-d="${c.id}">${ic('trash-2')}</button></td></tr>`; }).join('')}</tbody></table>` : emptyBox('Nenhum contato cadastrado.', 'users')}</div></div>`;
  },
  after() {
    const form = (c = {}) => modal(c.id ? 'Editar contato' : 'Novo contato', `<div class="form-grid">
      ${field('Nome / razão social', `<input class="input" name="name" required value="${esc(c.name)}">`, 'full')}
      ${field('Tipo', `<select class="input" name="type"><option value="cliente" ${c.type !== 'fornecedor' ? 'selected' : ''}>Cliente</option><option value="fornecedor" ${c.type === 'fornecedor' ? 'selected' : ''}>Fornecedor</option></select>`)}
      ${field('CPF / CNPJ', `<input class="input" name="doc" value="${esc(c.doc)}">`)}
      ${field('E-mail', `<input class="input" type="email" name="email" value="${esc(c.email)}">`)}
      ${field('Telefone', `<input class="input" name="phone" value="${esc(c.phone)}">`)}
    </div>`, { onSave: (d) => { Store.upsert('contacts', { ...c, ...d }); toast('Contato salvo'); } });
    $('#newCt').onclick = () => form();
    $$('[data-f]').forEach((b) => b.onclick = () => { app.sub.ct = b.dataset.f; refresh(); });
    $$('[data-e]').forEach((b) => b.onclick = () => form(Store.get('contacts', b.dataset.e)));
    $$('[data-d]').forEach((b) => b.onclick = () => confirmBox('Excluir este contato?', () => { S().tx.forEach((t) => { if (t.contactId === b.dataset.d) t.contactId = null; }); Store.remove('contacts', b.dataset.d); }));
  },
};

ROUTES.contas = {
  html() {
    const accs = S().accounts;
    return head('Contas bancárias', 'Contas correntes, poupanças, carteiras', `<button class="btn btn-outline" id="newTr">${ic('repeat')}Transferir</button><button class="btn btn-primary" id="newAcc">${ic('plus')}Nova conta</button>`) + `
      <div class="grid g-3">${accs.map((a) => { const b = Calc.accountBalance(a.id); const pend = S().tx.filter((t) => !t.paid && t.accountId === a.id && !t.cardId).reduce((s, t) => s + (t.type === 'receita' ? t.amount : -t.amount), 0); return `
        <div class="card" style="${a.archived ? 'opacity:.55' : ''}"><div class="tile">
          <div class="tile-top"><h6><span class="dot-c" style="background:${a.color}"></span>${esc(a.name)}</h6><span><button class="btn-icon" data-e="${a.id}">${ic('edit-2')}</button><button class="btn-icon" data-d="${a.id}">${ic('trash-2')}</button></span></div>
          <span class="muted">${ACC_TYPES[a.type] || ''}${a.archived ? ' · arquivada' : ''}</span>
          <div class="big-num ${b < 0 ? 'neg' : ''}" style="margin-top:10px">${money(b)}</div>
          <div class="row"><span class="muted">Saldo previsto (com pendentes)</span><b>${money(b + pend)}</b></div>
          <div class="row"><span class="muted">Saldo inicial</span><span>${money(a.initial)}</span></div>
          <a class="btn btn-sm btn-light" style="margin-top:14px" href="#/extrato" data-x="${a.id}">${ic('list')}Ver extrato</a>
        </div></div>`; }).join('') || `<div class="card" style="grid-column:1/-1">${emptyBox('Cadastre sua primeira conta.', 'archive')}</div>`}</div>`;
  },
  after() {
    const form = (a = {}) => modal(a.id ? 'Editar conta' : 'Nova conta', `<div class="form-grid">
      ${field('Nome', `<input class="input" name="name" required value="${esc(a.name)}">`, 'full')}
      ${field('Tipo', `<select class="input" name="type">${Object.entries(ACC_TYPES).map(([k, v]) => `<option value="${k}" ${a.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select>`)}
      ${field('Saldo inicial (R$)', `<input class="input" name="initial" inputmode="decimal" value="${a.initial ?? 0}">`)}
      ${field('Cor', `<input class="input" type="color" name="color" value="${a.color || '#7267ef'}" style="height:40px;padding:4px">`)}
      <label class="check" style="align-self:end"><input type="checkbox" name="archived" ${a.archived ? 'checked' : ''}> Arquivar conta</label>
    </div>`, { onSave: (d) => { Store.upsert('accounts', { ...a, ...d, initial: num(d.initial) }); toast('Conta salva'); } });
    $('#newAcc').onclick = () => form();
    $('#newTr').onclick = () => txForm({}, { type: 'transferencia', paid: true });
    $$('[data-e]').forEach((b) => b.onclick = () => form(Store.get('accounts', b.dataset.e)));
    $$('[data-x]').forEach((b) => b.onclick = () => { app.sub.ext.src = 'acc:' + b.dataset.x; });
    $$('[data-d]').forEach((b) => b.onclick = () => {
      const id = b.dataset.d;
      if (S().tx.some((t) => t.accountId === id || t.toAccountId === id)) return toast('Conta possui lançamentos — arquive em vez de excluir');
      confirmBox('Excluir esta conta?', () => Store.remove('accounts', id));
    });
  },
};

ROUTES.categorias = {
  html() {
    const block = (type) => {
      const roots = S().categories.filter((c) => c.type === type && !c.parentId).sort((a, b) => a.name.localeCompare(b.name));
      return `<div class="card"><div class="card-header"><h5>${type === 'receita' ? 'Receitas' : 'Despesas'}</h5><button class="btn btn-sm btn-light" data-new="${type}">${ic('plus')}Adicionar</button></div>
        ${roots.map((r) => `<div class="list-item"><span class="dot-c" style="background:${r.color}"></span><div class="grow"><b>${esc(r.name)}</b></div>
          <button class="btn-icon" data-sub="${r.id}" title="Subcategoria">${ic('corner-down-right')}</button><button class="btn-icon" data-e="${r.id}">${ic('edit-2')}</button><button class="btn-icon" data-d="${r.id}">${ic('trash-2')}</button></div>
          ${S().categories.filter((c) => c.parentId === r.id).map((c) => `<div class="list-item" style="padding-left:52px"><div class="grow"><small>›</small> ${esc(c.name)}</div><button class="btn-icon" data-e="${c.id}">${ic('edit-2')}</button><button class="btn-icon" data-d="${c.id}">${ic('trash-2')}</button></div>`).join('')}`).join('') || emptyBox('Nenhuma categoria.', 'tag')}</div>`;
    };
    return head('Categorias', 'Organize receitas e despesas em categorias e subcategorias') + `<div class="grid g-2">${block('despesa')}${block('receita')}</div>`;
  },
  after() {
    const form = (c = {}) => modal(c.id ? 'Editar categoria' : 'Nova categoria', `<div class="form-grid">
      ${field('Nome', `<input class="input" name="name" required value="${esc(c.name)}">`, 'full')}
      ${field('Categoria pai', `<select class="input" name="parentId"><option value="">— Nenhuma (principal) —</option>${S().categories.filter((x) => x.type === c.type && !x.parentId && x.id !== c.id).map((x) => `<option value="${x.id}" ${x.id === c.parentId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`)}
      ${field('Cor', `<input class="input" type="color" name="color" value="${c.color || '#7267ef'}" style="height:40px;padding:4px">`)}
    </div>`, { onSave: (d) => { Store.upsert('categories', { ...c, name: d.name, parentId: d.parentId || null, color: d.color }); toast('Categoria salva'); } });
    $$('[data-new]').forEach((b) => b.onclick = () => form({ type: b.dataset.new }));
    $$('[data-sub]').forEach((b) => { const p = Store.get('categories', b.dataset.sub); b.onclick = () => form({ type: p.type, parentId: p.id, color: p.color }); });
    $$('[data-e]').forEach((b) => b.onclick = () => form(Store.get('categories', b.dataset.e)));
    $$('[data-d]').forEach((b) => b.onclick = () => {
      const id = b.dataset.d;
      const used = S().tx.filter((t) => t.categoryId === id).length;
      const kids = S().categories.filter((c) => c.parentId === id).length;
      if (kids) return toast('Exclua as subcategorias primeiro');
      confirmBox(used ? `Esta categoria tem ${used} lançamentos, que ficarão sem categoria. Continuar?` : 'Excluir esta categoria?', () => {
        S().tx.forEach((t) => { if (t.categoryId === id) t.categoryId = null; });
        S().budgets = S().budgets.filter((x) => x.categoryId !== id);
        Store.remove('categories', id);
      });
    });
  },
};

/* ====================================================================== */
/* CONFIGURAÇÕES / AUDITORIA                                              */
/* ====================================================================== */
ROUTES.configuracoes = {
  html() {
    const s = S();
    const size = new Blob([JSON.stringify(s)]).size;
    return head('Configurações e backup', 'Preferências, importação e exportação de dados') + `
      <div class="grid g-2">
        <div class="card"><div class="card-header"><h5>Perfil</h5></div><div class="card-body">
          <form id="profForm" class="form-grid">${field('Seu nome', `<input class="input" name="userName" value="${esc(s.settings.userName)}">`, 'full')}
          <div class="full"><button class="btn btn-primary">Salvar</button></div></form></div></div>
        <div class="card"><div class="card-header"><h5>Backup</h5></div><div class="card-body">
          <p class="muted" style="margin-top:0">Os dados ficam salvos apenas neste navegador (${(size / 1024).toFixed(1)} KB · ${s.tx.length} lançamentos). Exporte um backup regularmente e use-o para levar os dados a outro computador.</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary" data-action="backup">${ic('download')}Exportar backup (JSON)</button>
            <label class="btn btn-outline">${ic('upload')}Restaurar backup<input type="file" id="restore" accept=".json" hidden></label>
            <button class="btn btn-outline" id="allCsv">${ic('file-text')}Todos os lançamentos (CSV)</button>
          </div></div></div>
        <div class="card"><div class="card-header"><h5>Zona de risco</h5></div><div class="card-body">
          <p class="muted" style="margin-top:0">Recomece do zero ou gere novamente os dados de exemplo. Essa ação não pode ser desfeita — exporte um backup antes.</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-danger" id="wipe">${ic('trash-2')}Apagar tudo e começar do zero</button><button class="btn btn-light" id="demo">${ic('refresh-cw')}Recarregar dados de exemplo</button></div>
        </div></div>
        <div class="card"><div class="card-header"><h5>Sobre</h5></div><div class="card-body muted">
          Ricco Orçamento — controle financeiro pessoal e de pequenos negócios: extrato, contas a pagar/receber, cartões, conciliação, orçamento, metas, investimentos, patrimônio, centros de custo, clientes/fornecedores, relatórios (fluxo de caixa, DRE, projeção) e auditoria.
        </div></div>
      </div>`;
  },
  after() {
    $('#profForm').onsubmit = (e) => { e.preventDefault(); S().settings.userName = e.target.userName.value.trim() || 'Usuário'; Store.log('editou', 'settings', 'Perfil'); Store.save(); toast('Perfil salvo'); refresh(); };
    $('#restore').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { const data = JSON.parse(await f.text()); if (!Array.isArray(data.tx) || !Array.isArray(data.accounts)) throw 0; confirmBox('Substituir todos os dados atuais pelo backup?', () => { Store.replaceAll(data); toast('Backup restaurado'); }, 'Restaurar'); }
      catch (err) { toast('Arquivo de backup inválido'); }
    };
    $('#allCsv').onclick = () => downloadCSV('lancamentos.csv', txCsvRows(S().tx.slice().sort((a, b) => a.date.localeCompare(b.date))));
    $('#wipe').onclick = () => confirmBox('Apagar <b>todos</b> os dados? Isso não pode ser desfeito.', () => {
      const s = emptyState(); s.settings = S().settings;
      s.accounts.push({ id: uid(), name: 'Conta principal', type: 'corrente', initial: 0, color: '#7267ef' });
      const seedCats = seed().categories; s.categories = seedCats;
      Store.replaceAll(s); toast('Dados apagados');
    }, 'Apagar tudo');
    $('#demo').onclick = () => confirmBox('Substituir os dados atuais pelos dados de exemplo?', () => { const s = seed(); s.settings = S().settings; Store.replaceAll(s); toast('Dados de exemplo carregados'); }, 'Substituir');
  },
};

ROUTES.auditoria = {
  html() {
    const a = S().audit.slice(0, 300);
    const labels = { tx: 'Lançamento', accounts: 'Conta', cards: 'Cartão', categories: 'Categoria', costCenters: 'Centro de custo', contacts: 'Contato', budgets: 'Orçamento', goals: 'Meta', assets: 'Patrimônio', investments: 'Investimento', settings: 'Configuração', backup: 'Backup', sistema: 'Sistema' };
    return head('Auditoria', 'Histórico de alterações feitas no sistema (últimos 300 registros)') + `
      <div class="card"><div class="table-wrap">${a.length ? `<table class="tbl"><thead><tr><th>Data e hora</th><th>Ação</th><th>Módulo</th><th>Descrição</th></tr></thead><tbody>
      ${a.map((x) => `<tr><td style="white-space:nowrap">${new Date(x.ts).toLocaleString('pt-BR')}</td><td><span class="badge ${x.action === 'excluiu' ? 'b-danger' : x.action === 'criou' ? 'b-success' : 'b-primary'}">${esc(x.action)}</span></td><td>${labels[x.entity] || esc(x.entity)}</td><td>${esc(x.desc)}</td></tr>`).join('')}
      </tbody></table>` : emptyBox('Nenhum registro.', 'shield')}</div></div>`;
  },
};

/* ---------- CSV / backup ---------- */
function txCsvRows(list) {
  return [['Data', 'Tipo', 'Descrição', 'Categoria', 'Conta/Cartão', 'Centro de custo', 'Contato', 'Valor', 'Status', 'Conciliado'],
    ...list.map((t) => [t.date, CAT_LABEL[t.type], t.desc, t.type === 'transferencia' ? '' : catName(t.categoryId), accName(t), Store.get('costCenters', t.costCenterId)?.name || '', Store.get('contacts', t.contactId)?.name || '', (t.type === 'despesa' ? -t.amount : t.amount), t.paid ? 'Pago' : 'Pendente', t.reconciled ? 'Sim' : 'Não'])];
}
function downloadCSV(name, rows) {
  const csv = '﻿' + rows.map((r) => r.map((v) => { const s = typeof v === 'number' ? String(round2(v)).replace('.', ',') : String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(';')).join('\n');
  download(name, csv, 'text/csv;charset=utf-8');
}
function download(name, content, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- Eventos globais ---------- */
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-action]');
  if (a?.dataset.action === 'new-tx') txForm();
  if (a?.dataset.action === 'backup') { download(`ricco-orcamento-backup-${todayStr()}.json`, JSON.stringify(S(), null, 2), 'application/json'); Store.log('exportou', 'backup', 'Backup exportado'); Store.save(); toast('Backup exportado'); }
  if (!e.target.closest('#bellBtn') && !e.target.closest('#alerts')) $('#alerts').classList.remove('open');
});
$('#bellBtn').onclick = () => $('#alerts').classList.toggle('open');
$('#menuBtn').onclick = () => {
  if (window.innerWidth <= 1024) document.body.classList.toggle('nav-open');
  else { const s = $('#sidebar'); const hidden = s.style.transform === 'translateX(-100%)'; s.style.transform = hidden ? '' : 'translateX(-100%)'; $('.header').style.left = hidden ? '' : '0'; $('#view').style.marginLeft = hidden ? '' : '0'; setTimeout(() => window.dispatchEvent(new Event('resize')), 260); }
};
$('#backdrop').onclick = () => document.body.classList.remove('nav-open');
$('#prevMonth').onclick = () => { app.month = addYm(app.month, -1); refresh(); };
$('#nextMonth').onclick = () => { app.month = addYm(app.month, 1); refresh(); };
$('#modalBg').addEventListener('mousedown', (e) => { if (e.target.id === 'modalBg') closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
window.addEventListener('hashchange', go);
go();
