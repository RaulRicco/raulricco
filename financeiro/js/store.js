/* Ricco Orçamento — camada de dados (Cloudflare D1 via /api/fin, com cache local) */
const KEY = 'financakit:v1';
const COLLS = ['accounts', 'cards', 'categories', 'costCenters', 'contacts', 'tx', 'recurrences', 'budgets', 'goals', 'assets', 'investments', 'audit'];

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => ymd(new Date());
const ym = (s) => s.slice(0, 7);
const parseD = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addMonths = (s, n) => {
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(y, m - 1 + n, 1);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  return ymd(new Date(t.getFullYear(), t.getMonth(), Math.min(d, last)));
};
const addYm = (s, n) => addMonths(s + '-01', n).slice(0, 7);
const round2 = (n) => Math.round(n * 100) / 100;
const monthsBetween = (a, b) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));

function emptyState() {
  return {
    version: 1,
    settings: { userName: 'Usuário' },
    accounts: [], cards: [], categories: [], costCenters: [], contacts: [],
    tx: [], recurrences: [], budgets: [], goals: [], assets: [], investments: [], audit: [],
  };
}

class AuthError extends Error {}

async function api(path, body) {
  const res = await fetch('/api/' + path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  if (res.status === 401) throw new AuthError('Não autorizado');
  if (!res.ok) throw new Error('Erro ' + res.status);
  return res.json();
}

/** Converte o estado em registros {coll,id,data} — um por linha no banco. */
function toRecords(state) {
  const out = [{ coll: 'settings', id: 'main', data: state.settings || {} }];
  for (const c of COLLS) for (const o of state[c] || []) { if (!o.id) o.id = uid(); out.push({ coll: c, id: o.id, data: o }); }
  return out;
}
function fromRecords(records) {
  const s = emptyState();
  for (const r of records) {
    if (r.coll === 'settings') s.settings = { ...s.settings, ...r.data };
    else if (s[r.coll]) s[r.coll].push(r.data);
  }
  s.audit.sort((a, b) => b.ts.localeCompare(a.ts));
  return s;
}
const recKey = (r) => r.coll + '|' + r.id;

const Store = {
  state: null,
  synced: new Map(), // chave -> JSON do que o servidor já tem
  needReplace: false,
  status: 'ok', // ok | saving | error
  onStatus: () => {},
  timer: null,

  /** Carrega do servidor. Lança AuthError se não houver sessão. */
  async init() {
    const { records } = await api('fin/state');
    this.state = fromRecords(records);
    this.synced = new Map(toRecords(this.state).map((r) => [recKey(r), JSON.stringify(r.data)]));
    this.cache();
    return records.length > 0;
  },

  localBackup() {
    try { const raw = localStorage.getItem(KEY); return raw ? Object.assign(emptyState(), JSON.parse(raw)) : null; } catch (e) { return null; }
  },

  cache() { try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch (e) {} },

  save() {
    this.cache();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 400);
  },

  pending() { return this.needReplace || this.diff().total > 0; },

  diff() {
    const cur = new Map(toRecords(this.state).map((r) => [recKey(r), r]));
    const upserts = [], deletes = [];
    for (const [k, r] of cur) { const j = JSON.stringify(r.data); if (this.synced.get(k) !== j) upserts.push(r); }
    for (const k of this.synced.keys()) if (!cur.has(k)) { const [coll, id] = k.split('|'); deletes.push({ coll, id }); }
    return { upserts, deletes, total: upserts.length + deletes.length };
  },

  async flush() {
    if (this.flushing) { this.again = true; return; }
    this.flushing = true;
    try {
      const replace = this.needReplace;
      const d = replace ? null : this.diff();
      if (replace || d.total) {
        this.setStatus('saving');
        const snapshot = toRecords(this.state);
        if (replace) { await api('fin/replace', { records: snapshot }); this.needReplace = false; }
        else await api('fin/sync', { upserts: d.upserts, deletes: d.deletes });
        // marca como sincronizado exatamente o que foi enviado
        if (replace) this.synced = new Map(snapshot.map((r) => [recKey(r), JSON.stringify(r.data)]));
        else {
          d.upserts.forEach((r) => this.synced.set(recKey(r), JSON.stringify(r.data)));
          d.deletes.forEach((r) => this.synced.delete(recKey(r)));
        }
      }
      this.setStatus('ok');
    } catch (e) {
      this.setStatus(e instanceof AuthError ? 'auth' : 'error');
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.flush(), 10000);
    } finally {
      this.flushing = false;
      if (this.again) { this.again = false; this.flush(); }
    }
  },

  setStatus(s) { this.status = s; this.onStatus(s); },

  log(action, entity, desc) {
    this.state.audit.unshift({ id: uid(), ts: new Date().toISOString(), action, entity, desc });
    if (this.state.audit.length > 1000) this.state.audit.length = 1000;
  },

  upsert(coll, obj, label) {
    const list = this.state[coll];
    const i = obj.id ? list.findIndex((x) => x.id === obj.id) : -1;
    if (i >= 0) { list[i] = { ...list[i], ...obj }; this.log('editou', coll, label || obj.name || obj.desc || ''); }
    else { obj.id = obj.id || uid(); list.push(obj); this.log('criou', coll, label || obj.name || obj.desc || ''); }
    this.save();
    return obj;
  },

  remove(coll, id, label) {
    const list = this.state[coll];
    const i = list.findIndex((x) => x.id === id);
    if (i >= 0) { const [o] = list.splice(i, 1); this.log('excluiu', coll, label || o.name || o.desc || ''); }
    this.save();
  },

  replaceAll(next, label = 'Restauração de backup') {
    this.state = Object.assign(emptyState(), next);
    this.log('importou', 'backup', label);
    this.needReplace = true;
    this.save();
  },

  get(coll, id) { return this.state[coll].find((x) => x.id === id); },

  /* ---------- Lançamentos fixos (recorrentes) ---------- */
  /** Campos copiados do modelo para cada ocorrência. */
  recFields(r) {
    const { type, desc, amount, accountId, cardId, toAccountId, categoryId, costCenterId, contactId, notes } = r;
    return { type, desc, amount, accountId, cardId, toAccountId, categoryId, costCenterId, contactId, notes };
  },
  recTxId(r, month) { return `r_${r.id}_${month}`; },
  recDate(r, month) { return addMonths(r.startDate, monthsBetween(ym(r.startDate), month)); },

  /** Gera as ocorrências que faltam até `untilYm` (mín. 12 meses à frente). IDs determinísticos evitam duplicatas entre aparelhos. */
  materialize(untilYm) {
    const recs = this.state.recurrences || [];
    if (!recs.length) return 0;
    let until = addYm(ym(todayStr()), 12);
    if (untilYm && untilYm > until) until = untilYm;
    const have = new Set(this.state.tx.filter((t) => t.recurrenceId).map((t) => t.recurrenceId + '|' + t.recMonth));
    let created = 0;
    for (const r of recs) {
      const last = r.endYm && r.endYm < until ? r.endYm : until;
      const skips = new Set(r.skips || []);
      for (let m = ym(r.startDate); m <= last; m = addYm(m, 1)) {
        if (have.has(r.id + '|' + m) || skips.has(m)) continue;
        this.state.tx.push({ ...this.recFields(r), id: this.recTxId(r, m), date: this.recDate(r, m), paid: false, paidDate: null, reconciled: false, recurrenceId: r.id, recMonth: m });
        created++;
      }
    }
    if (created) this.save();
    return created;
  },

  /** Encerra a recorrência: mantém até `lastYm` (inclusive) e apaga as ocorrências depois disso. */
  endRecurrence(r, lastYm, onlyUnpaid = false) {
    this.state.tx = this.state.tx.filter((t) => !(t.recurrenceId === r.id && t.recMonth > lastYm && (!onlyUnpaid || !t.paid)));
    if (lastYm < ym(r.startDate)) this.remove('recurrences', r.id, r.desc);
    else { r.endYm = lastYm; this.log('encerrou', 'recurrences', `${r.desc} (último: ${lastYm})`); this.save(); }
  },

  /** Apaga a recorrência e suas ocorrências (todas, ou só as não pagas). */
  deleteRecurrence(r, keepPaid) {
    this.state.tx = this.state.tx.filter((t) => t.recurrenceId !== r.id || (keepPaid && t.paid));
    this.state.tx.forEach((t) => { if (t.recurrenceId === r.id) t.recurrenceId = null; });
    this.remove('recurrences', r.id, r.desc);
  },
};

/* ---------- Cálculos ---------- */
const Calc = {
  /** Mês de fatura de uma compra no cartão (YYYY-MM). Compra após o fechamento cai na fatura seguinte. */
  invoiceOf(card, date) {
    const d = Number(date.slice(8, 10));
    const base = ym(date);
    // fatura referenciada pelo mês do vencimento
    const closeMonth = d > card.closeDay ? addYm(base, 1) : base;
    return card.dueDay <= card.closeDay ? addYm(closeMonth, 1) : closeMonth;
  },
  invoiceDue(card, invYm) {
    const [y, m] = invYm.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    return `${invYm}-${pad(Math.min(card.dueDay, last))}`;
  },
  invoiceItems(cardId, invYm) {
    const card = Store.get('cards', cardId);
    if (!card) return [];
    return Store.state.tx.filter((t) => t.cardId === cardId && !t.cardPayment && this.invoiceOf(card, t.date) === invYm);
  },
  invoiceTotal(cardId, invYm) {
    return round2(this.invoiceItems(cardId, invYm).reduce((s, t) => s + (t.type === 'receita' ? -t.amount : t.amount), 0));
  },
  invoicePayment(cardId, invYm) {
    return Store.state.tx.find((t) => t.cardPayment && t.cardId === cardId && t.invoice === invYm);
  },
  cardUsed(cardId) {
    // limite usado = soma das faturas não pagas
    const card = Store.get('cards', cardId);
    const months = new Set(Store.state.tx.filter((t) => t.cardId === cardId && !t.cardPayment).map((t) => this.invoiceOf(card, t.date)));
    let used = 0;
    months.forEach((m) => { const p = this.invoicePayment(cardId, m); if (!p || !p.paid) used += this.invoiceTotal(cardId, m); });
    return round2(used);
  },

  accountBalance(accId, until) {
    const acc = Store.get('accounts', accId);
    let bal = acc ? Number(acc.initial || 0) : 0;
    for (const t of Store.state.tx) {
      if (!t.paid) continue;
      const d = t.paidDate || t.date;
      if (until && d > until) continue;
      if (t.type === 'transferencia') {
        if (t.accountId === accId) bal -= t.amount;
        if (t.toAccountId === accId) bal += t.amount;
      } else if (t.accountId === accId && !t.cardId) {
        bal += t.type === 'receita' ? t.amount : -t.amount;
      } else if (t.cardPayment && t.accountId === accId) {
        bal -= t.amount;
      }
    }
    return round2(bal);
  },
  totalBalance(until) {
    return round2(Store.state.accounts.filter((a) => !a.archived).reduce((s, a) => s + this.accountBalance(a.id, until), 0));
  },

  /** Lançamentos que contam como receita/despesa (exclui transferências e pagamento de fatura). */
  isResult(t) { return t.type !== 'transferencia' && !t.cardPayment && !t.invoiceResidual; },

  monthTotals(month) {
    let rec = 0, desp = 0, recPaid = 0, despPaid = 0;
    for (const t of Store.state.tx) {
      if (!this.isResult(t) || ym(t.date) !== month) continue;
      if (t.type === 'receita') { rec += t.amount; if (t.paid) recPaid += t.amount; }
      else { desp += t.amount; if (t.paid || t.cardId) despPaid += t.amount; }
    }
    return { rec: round2(rec), desp: round2(desp), recPaid: round2(recPaid), despPaid: round2(despPaid), res: round2(rec - desp) };
  },

  byCategory(month, type, filterFn) {
    const map = {};
    for (const t of Store.state.tx) {
      if (!this.isResult(t) || t.type !== type) continue;
      if (month && !(Array.isArray(month) ? month.includes(ym(t.date)) : ym(t.date) === month)) continue;
      if (filterFn && !filterFn(t)) continue;
      const cat = Store.get('categories', t.categoryId);
      const root = cat && cat.parentId ? Store.get('categories', cat.parentId) : cat;
      const key = root ? root.id : '_none';
      map[key] = (map[key] || 0) + t.amount;
    }
    return Object.entries(map).map(([id, v]) => {
      const c = Store.get('categories', id);
      return { id, name: c ? c.name : 'Sem categoria', color: c ? c.color : '#c4c8d4', value: round2(v) };
    }).sort((a, b) => b.value - a.value);
  },

  spentInCategory(catId, month) {
    return round2(Store.state.tx.filter((t) => {
      if (!this.isResult(t) || t.type !== 'despesa' || ym(t.date) !== month) return false;
      if (t.categoryId === catId) return true;
      const c = Store.get('categories', t.categoryId);
      return c && c.parentId === catId;
    }).reduce((s, t) => s + t.amount, 0));
  },

  /** Itens a pagar / receber em aberto (inclui faturas de cartão). */
  openItems() {
    const items = Store.state.tx.filter((t) => !t.paid && !t.cardId && t.type !== 'transferencia').map((t) => ({
      kind: t.type === 'receita' ? 'receber' : 'pagar', date: t.date, desc: t.desc, amount: t.amount, tx: t,
    }));
    for (const card of Store.state.cards) {
      const months = new Set(Store.state.tx.filter((t) => t.cardId === card.id && !t.cardPayment).map((t) => this.invoiceOf(card, t.date)));
      months.forEach((m) => {
        const p = this.invoicePayment(card.id, m);
        const total = this.invoiceTotal(card.id, m);
        if ((!p || !p.paid) && total > 0) items.push({ kind: 'pagar', date: this.invoiceDue(card, m), desc: `Fatura ${card.name} (${monthName(m)})`, amount: total, invoice: { cardId: card.id, month: m } });
      });
    }
    return items.sort((a, b) => a.date.localeCompare(b.date));
  },

  investTotals() {
    const inv = Store.state.investments;
    const invested = inv.reduce((s, i) => s + Number(i.invested || 0), 0);
    const current = inv.reduce((s, i) => s + Number(i.current || 0), 0);
    return { invested: round2(invested), current: round2(current), gain: round2(current - invested) };
  },

  netWorth() {
    const cash = this.totalBalance();
    const inv = this.investTotals().current;
    const bens = Store.state.assets.filter((a) => a.kind === 'bem').reduce((s, a) => s + Number(a.value), 0);
    const dividas = Store.state.assets.filter((a) => a.kind === 'divida').reduce((s, a) => s + Number(a.value), 0);
    const cards = Store.state.cards.reduce((s, c) => s + this.cardUsed(c.id), 0);
    return { cash, inv, bens, dividas, cards, total: round2(cash + inv + bens - dividas - cards) };
  },
};

function monthName(m, long) {
  const [y, mo] = m.split('-').map(Number);
  const s = new Date(y, mo - 1, 1).toLocaleDateString('pt-BR', { month: long ? 'long' : 'short', year: 'numeric' });
  return s.replace('.', '').replace(' de ', ' ');
}

/** Estado inicial limpo: categorias padrão e uma conta. */
function blankState(settings) {
  const s = emptyState();
  if (settings) s.settings = settings;
  s.categories = seed().categories;
  s.accounts.push({ id: uid(), name: 'Conta principal', type: 'corrente', initial: 0, color: '#7267ef' });
  s.costCenters.push({ id: uid(), name: 'Pessoal' });
  return s;
}

/* ---------- Dados de exemplo ---------- */
function seed() {
  const s = emptyState();
  const cat = (name, type, color, parentId) => { const c = { id: uid(), name, type, color, parentId: parentId || null }; s.categories.push(c); return c; };
  const salario = cat('Salário', 'receita', '#17c666');
  const freela = cat('Serviços / Freelas', 'receita', '#3ec9d6');
  const rendim = cat('Rendimentos', 'receita', '#7267ef');
  cat('Outras receitas', 'receita', '#a3a0f5');
  const moradia = cat('Moradia', 'despesa', '#7267ef');
  const aluguel = cat('Aluguel', 'despesa', '#7267ef', moradia.id);
  const energia = cat('Energia e água', 'despesa', '#7267ef', moradia.id);
  const internet = cat('Internet e telefone', 'despesa', '#7267ef', moradia.id);
  const alim = cat('Alimentação', 'despesa', '#9a93f4');
  const mercado = cat('Supermercado', 'despesa', '#9a93f4', alim.id);
  const restaurante = cat('Restaurantes', 'despesa', '#9a93f4', alim.id);
  const transp = cat('Transporte', 'despesa', '#b9b4f8');
  const saude = cat('Saúde', 'despesa', '#ea4d4d');
  const lazer = cat('Lazer', 'despesa', '#ffa21d');
  const educ = cat('Educação', 'despesa', '#3ec9d6');
  const assin = cat('Assinaturas', 'despesa', '#5b52d6');
  const impostos = cat('Impostos e taxas', 'despesa', '#6b7280');
  cat('Outras despesas', 'despesa', '#c4c8d4');

  const nubank = { id: uid(), name: 'Conta Corrente', type: 'corrente', initial: 4200, color: '#7267ef' };
  const poup = { id: uid(), name: 'Poupança', type: 'poupanca', initial: 8000, color: '#17c666' };
  const cart = { id: uid(), name: 'Carteira', type: 'carteira', initial: 500, color: '#ffa21d' };
  s.accounts.push(nubank, poup, cart);

  const card = { id: uid(), name: 'Cartão Roxo', limit: 6000, closeDay: 3, dueDay: 10, color: '#7267ef', accountId: nubank.id };
  s.cards.push(card);

  const pessoal = { id: uid(), name: 'Pessoal' }, trab = { id: uid(), name: 'Trabalho' };
  s.costCenters.push(pessoal, trab);
  const cli = { id: uid(), name: 'Cliente Exemplo Ltda', type: 'cliente', email: '', phone: '', doc: '' };
  const forn = { id: uid(), name: 'Imobiliária Centro', type: 'fornecedor', email: '', phone: '', doc: '' };
  s.contacts.push(cli, forn);

  const today = todayStr();
  const cur = ym(today);
  const add = (o) => s.tx.push({ id: uid(), paid: false, reconciled: false, notes: '', costCenterId: pessoal.id, ...o, amount: round2(o.amount) });
  const rnd = (a, b) => a + Math.random() * (b - a);

  for (let k = -11; k <= 1; k++) {
    const m = addYm(cur, k);
    const past = m < cur;
    const isCur = m === cur;
    const dayPaid = (d) => past || (isCur && `${m}-${pad(d)}` <= today);
    add({ type: 'receita', desc: 'Salário', amount: 6500, date: `${m}-05`, accountId: nubank.id, categoryId: salario.id, paid: dayPaid(5) });
    if (k % 2 === 0 || k === 0) add({ type: 'receita', desc: 'Projeto freelance', amount: rnd(900, 2600), date: `${m}-18`, accountId: nubank.id, categoryId: freela.id, contactId: cli.id, costCenterId: trab.id, paid: dayPaid(18) });
    add({ type: 'receita', desc: 'Rendimento poupança', amount: rnd(40, 60), date: `${m}-28`, accountId: poup.id, categoryId: rendim.id, paid: dayPaid(28) });
    add({ type: 'despesa', desc: 'Aluguel', amount: 1800, date: `${m}-10`, accountId: nubank.id, categoryId: aluguel.id, contactId: forn.id, paid: dayPaid(10) });
    add({ type: 'despesa', desc: 'Conta de energia', amount: rnd(160, 260), date: `${m}-15`, accountId: nubank.id, categoryId: energia.id, paid: dayPaid(15) });
    add({ type: 'despesa', desc: 'Internet fibra', amount: 119.9, date: `${m}-20`, accountId: nubank.id, categoryId: internet.id, paid: dayPaid(20) });
    if (k <= 0) {
      add({ type: 'despesa', desc: 'Supermercado', amount: rnd(450, 800), date: `${m}-07`, cardId: card.id, categoryId: mercado.id });
      add({ type: 'despesa', desc: 'Restaurante', amount: rnd(80, 260), date: `${m}-12`, cardId: card.id, categoryId: restaurante.id });
      add({ type: 'despesa', desc: 'Combustível', amount: rnd(200, 380), date: `${m}-09`, cardId: card.id, categoryId: transp.id });
      add({ type: 'despesa', desc: 'Streaming', amount: 55.9, date: `${m}-02`, cardId: card.id, categoryId: assin.id });
      add({ type: 'despesa', desc: 'Academia', amount: 99.9, date: `${m}-06`, accountId: nubank.id, categoryId: saude.id, paid: dayPaid(6) });
      add({ type: 'despesa', desc: 'Lazer / passeio', amount: rnd(60, 400), date: `${m}-22`, accountId: nubank.id, categoryId: lazer.id, paid: dayPaid(22) });
      if (k >= -5) add({ type: 'despesa', desc: 'Padaria', amount: rnd(20, 45), date: `${m}-16`, accountId: cart.id, categoryId: mercado.id, paid: dayPaid(16) });
      if (k % 3 === 0) add({ type: 'despesa', desc: 'Curso online', amount: rnd(150, 400), date: `${m}-14`, cardId: card.id, categoryId: educ.id, costCenterId: trab.id });
      if (k === -8) add({ type: 'despesa', desc: 'IPVA', amount: 1240, date: `${m}-25`, accountId: nubank.id, categoryId: impostos.id, paid: true });
    }
  }
  // pagamentos de fatura passados
  const invMonths = new Set(s.tx.filter((t) => t.cardId).map((t) => Calc.invoiceOf(card, t.date)));
  invMonths.forEach((m) => {
    const due = Calc.invoiceDue(card, m);
    if (due < today) {
      const tot = s.tx.filter((t) => t.cardId === card.id && !t.cardPayment && Calc.invoiceOf(card, t.date) === m).reduce((a, t) => a + t.amount, 0);
      s.tx.push({ id: uid(), type: 'despesa', desc: `Pagamento fatura ${card.name}`, amount: round2(tot), date: due, paidDate: due, accountId: nubank.id, cardId: card.id, cardPayment: true, invoice: m, paid: true, reconciled: true, notes: '' });
    }
  });
  s.tx.push({ id: uid(), type: 'transferencia', desc: 'Reserva mensal', amount: 500, date: `${cur}-06`, accountId: nubank.id, toAccountId: poup.id, paid: `${cur}-06` <= today, reconciled: false, notes: '' });

  s.budgets.push(
    { id: uid(), categoryId: alim.id, amount: 1100 },
    { id: uid(), categoryId: transp.id, amount: 350 },
    { id: uid(), categoryId: lazer.id, amount: 300 },
    { id: uid(), categoryId: moradia.id, amount: 2200 },
    { id: uid(), categoryId: assin.id, amount: 80 },
  );
  s.goals.push(
    { id: uid(), name: 'Reserva de emergência', target: 30000, saved: 14500, deadline: addMonths(today, 10), color: '#7267ef' },
    { id: uid(), name: 'Viagem de férias', target: 8000, saved: 2300, deadline: addMonths(today, 6), color: '#17c666' },
  );
  s.investments.push(
    { id: uid(), name: 'Tesouro Selic 2029', type: 'Renda fixa', broker: 'Tesouro Direto', invested: 10000, current: 11380, date: addMonths(today, -14) },
    { id: uid(), name: 'CDB 110% CDI', type: 'Renda fixa', broker: 'Banco', invested: 5000, current: 5420, date: addMonths(today, -8) },
    { id: uid(), name: 'ETF BOVA11', type: 'Renda variável', broker: 'Corretora', invested: 4000, current: 4310, date: addMonths(today, -6) },
  );
  s.assets.push(
    { id: uid(), name: 'Carro', kind: 'bem', value: 48000, notes: '' },
    { id: uid(), name: 'Financiamento do carro', kind: 'divida', value: 12500, notes: '' },
  );
  s.audit.push({ id: uid(), ts: new Date().toISOString(), action: 'criou', entity: 'sistema', desc: 'Dados de exemplo gerados' });
  return s;
}
