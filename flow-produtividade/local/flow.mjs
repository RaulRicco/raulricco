#!/usr/bin/env node
// flow — linha de comando do Flow Produtividade (para você e para o seu assistente virtual)
// Saída: texto legível no terminal; JSON quando usado com --json ou quando a saída não é um terminal.
import { createInterface } from 'node:readline';
import * as F from './lib.mjs';

const argv = process.argv.slice(2);
const BOOL_FLAGS = new Set(['mit', 'no-mit', 'pending', 'done', 'json', 'j', 'keep-mit']);
const opts = {};
const pos = [];
for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
        const [k, v] = a.slice(2).split('=');
        if (v !== undefined) opts[k] = v;
        else if (BOOL_FLAGS.has(k)) opts[k] = true;
        else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) opts[k] = argv[++i];
        else opts[k] = true;
    } else pos.push(a);
}
const JSON_OUT = opts.json || opts.j || !process.stdout.isTTY;
const flag = (k, neg) => (opts[k] ? true : opts[neg] ? false : undefined);

function out(data, human) {
    if (JSON_OUT || !human) console.log(JSON.stringify(data, null, 2));
    else console.log(human(data));
}

const QL = { q1: 'Fazer agora', q2: 'Agendar', q3: 'Delegar', q4: 'Eliminar' };
const taskLine = t => `${t.completed ? '✔' : '○'} ${t.is_mit ? '★ ' : ''}${t.text}  [${QL[F.quadrantOf(t)]} · ${t.area || 'sem área'} · ${t.date}]  ${t.id}`;

const HELP = `flow — Flow Produtividade na linha de comando

Conta
  flow login [--token flow_pat_...]   Conecta (email/senha cria uma chave de API)
  flow whoami | flow logout

Visão geral
  flow today                          Resumo do dia (score, Big 3, tarefas, áreas)
  flow stats [--days 30]              Métricas do período + metas de foco por área

Tarefas
  flow tasks [--date D | --from D --to D] [--pending|--done]
  flow task add "Texto" [--area Nome] [--q q1..q4] [--mit] [--est 2] [--date D]
  flow task done|undo|rm <id>
  flow task step <id> [--next "Próxima etapa"] [--date amanhã] [--keep-mit]
                                      Etapa feita hoje; a continuação aparece no dia seguinte
  flow task edit <id> [--text ..] [--area ..] [--q ..] [--mit|--no-mit] [--est N] [--date D]

Tempo / foco
  flow log <duração> --area Nome [--task id] [--date D] [--quality 1-5]   ex.: flow log 1h30 --area Saúde
  flow sessions [--date D | --from D --to D]
  flow session rm <id> | flow session rate <id> <1-5>

Áreas
  flow areas
  flow area add "Nome" [--target 5h] [--per semana|dia|mes] [--color #hex] [--icon dumbbell]
  flow area edit <id|nome> [--name ..] [--target ..] [--per ..] [--color ..] [--icon ..]
  flow area archive|restore <id|nome>

Metas
  flow goals
  flow goal add "Título" [--period trimestral|mensal|semanal] [--area Nome] [--target 10]
  flow goal set <id> <valor atual> | flow goal rm <id>

Shutdown diário
  flow review [--date D]
  flow review set [--energy 1-5] [--mood 1-5] [--wins ..] [--blockers ..] [--tomorrow ..] [--date D]

Avançado
  flow api <GET|POST|PATCH|PUT|DELETE> <caminho> ['{"json":1}']

Datas: YYYY-MM-DD, DD/MM, hoje, ontem, amanhã. Adicione --json para saída JSON.`;

async function ask(q, hidden = false) {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
        const write = rl._writeToOutput.bind(rl);
        rl._writeToOutput = s => write(s.startsWith(q) ? s : '');
    }
    return new Promise(r => rl.question(q, a => { rl.close(); if (hidden) process.stdout.write('\n'); r(a.trim()); }));
}

async function login() {
    const cfg = F.loadConfig();
    let token = typeof opts.token === 'string' ? opts.token : null;
    if (!token) {
        const email = opts.email || await ask('Email: ');
        const password = await ask('Senha: ', true);
        const res = await fetch(`${cfg.api}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new F.FlowError(data.error || 'Falha no login', res.status);
        const name = typeof opts.name === 'string' ? opts.name : 'Assistente MacBook';
        const created = await F.api('POST', '/tokens', { name }, { token: data.token });
        token = created.token;
    }
    if (!token.startsWith('flow_pat_')) throw new F.FlowError('A chave deve começar com flow_pat_', 400);
    const me = await F.api('GET', '/me', undefined, { token });
    F.saveConfig({ api: cfg.api, token });
    return { ok: true, user: me.email, config: F.CONFIG_FILE };
}

async function main() {
    const [cmd, sub, ...rest] = pos;
    switch (cmd) {
        case undefined: case 'help': case '-h': console.log(HELP); return;
        case 'login': return out(await login(), r => `Conectado como ${r.user}. Chave salva em ${r.config}`);
        case 'logout': F.saveConfig({ api: F.loadConfig().api, token: null }); return out({ ok: true }, () => 'Chave removida deste computador (revogue no app em Integrações).');
        case 'whoami': return out(await F.api('GET', '/me'), u => `${u.name} <${u.email}> · via ${u.auth}`);

        case 'today': return out(await F.today(), d => [
            `Hoje ${d.date} · Flow Score ${d.flow_score}/100 · deep work ${d.deep_work}`,
            `Big 3: ${d.big3.map(t => `${t.done ? '✔' : '○'} ${t.text}`).join(' | ') || '(não definido)'}`,
            '', 'Tarefas:', ...d.tasks.map(t => `  ${t.done ? '✔' : '○'} ${t.mit ? '★ ' : ''}${t.text}  (${QL[t.quadrant]} · ${t.area})  ${t.id}`),
            '', 'Áreas:', ...d.areas.map(a => `  ${a.name}: ${F.fmtMinutes(a.done_minutes)}${a.target ? ` / ${a.target} (${a.percent}%)${a.missing_minutes ? ` · faltam ${F.fmtMinutes(a.missing_minutes)}` : ' ✔'}` : ''}`),
        ].join('\n'));

        case 'stats': return out(await F.stats({ days: opts.days }), s => [
            `${s.period.from} → ${s.period.to} (${s.period.days} dias)`,
            `Deep work ${s.deep_work} · ${s.sessions} sessões · Flow Score médio ${s.flow_score_avg} · tarefas ${s.tasks_done}/${s.tasks_total} · Big 3 ${s.big3_rate_percent ?? '—'}% · qualidade ${s.focus_quality_avg ?? '—'}`,
            '', 'Áreas (período atual da meta):',
            ...s.areas.map(a => `  ${a.name}: ${F.fmtMinutes(a.current_period.done_minutes)}${a.target ? ` / ${a.target} (${a.current_period.percent}%)` : ''} · no período consultado: ${F.fmtMinutes(a.range_minutes)}`),
        ].join('\n'));

        case 'tasks': return out(await F.listTasks({ date: opts.date, from: opts.from, to: opts.to, status: opts.pending ? 'pending' : opts.done ? 'done' : undefined }),
            ts => ts.map(taskLine).join('\n') || '(nenhuma tarefa)');

        case 'task': {
            const id = rest[0];
            if (sub === 'add') return out(await F.addTask({ text: rest.join(' ') || opts.text, area: opts.area, quadrant: opts.q, mit: !!opts.mit, estimate: opts.est ? +opts.est : undefined, date: opts.date }), taskLine);
            if (sub === 'done' || sub === 'undo') return out(await F.updateTask(id, { completed: sub === 'done' }), taskLine);
            if (sub === 'rm') return out(await F.deleteTask(id), () => 'Tarefa excluída.');
            if (sub === 'step') return out(await F.completeStep(id, { next: opts.next, date: opts.date, keepMit: !!opts['keep-mit'] }),
                r => `✔ Etapa ${r.done.step || 1} concluída hoje.\n→ Etapa ${r.next.step} em ${r.next.date}: ${r.next.text}  ${r.next.id}`);
            if (sub === 'edit') return out(await F.updateTask(id, { text: opts.text, area: opts.area, quadrant: opts.q, mit: flag('mit', 'no-mit'), estimate: opts.est ? +opts.est : undefined, date: opts.date }), taskLine);
            break;
        }

        case 'log': return out(await F.logTime({ minutes: sub, area: opts.area, task: opts.task, date: opts.date, quality: opts.quality ? +opts.quality : undefined }),
            s => `Lançado: ${F.fmtMinutes(s.duration_minutes)} em ${s.area || 'sem área'} (${s.date})  ${s.id}`);
        case 'sessions': return out(await F.listSessions({ date: opts.date, from: opts.from, to: opts.to }),
            ss => ss.map(s => `${s.date} ${s.mode} ${F.fmtMinutes(s.duration_minutes)} · ${s.area || 'sem área'}${s.focus_quality ? ` · foco ${s.focus_quality}/5` : ''}  ${s.id}`).join('\n') || '(nenhuma sessão)');
        case 'session':
            if (sub === 'rm') return out(await F.deleteSession(rest[0]), () => 'Sessão excluída.');
            if (sub === 'rate') return out(await F.rateSession(rest[0], +rest[1]), () => 'Nota salva.');
            break;

        case 'areas': return out(await F.listAreas(), as => as.map(a => `${a.archived ? '[arquivada] ' : ''}${a.name} · meta ${a.target_minutes ? F.fmtMinutes(a.target_minutes) + '/' + a.target_period : 'nenhuma'} · ${a.color} ${a.icon}  id=${a.id}`).join('\n'));
        case 'area': {
            const ref = rest.join(' ');
            const common = { target: opts.target, period: opts.per, color: opts.color, icon: opts.icon };
            if (sub === 'add') return out(await F.upsertArea({ name: ref || opts.name, ...common }), a => `Área criada: ${a.name}  id=${a.id}`);
            if (sub === 'edit') return out(await F.upsertArea({ id: ref, name: opts.name, ...common }), a => `Área atualizada: ${a.name}`);
            if (sub === 'archive' || sub === 'restore') return out(await F.upsertArea({ id: ref, archived: sub === 'archive' }), a => `${a.name}: ${a.archived ? 'arquivada' : 'restaurada'}`);
            break;
        }

        case 'goals': return out(await F.listGoals(), gs => gs.map(g => `${g.title} · ${g.current_value}/${g.target_value} · ${g.period} · ${g.area} · até ${g.end_date}  ${g.id}`).join('\n') || '(nenhuma meta)');
        case 'goal':
            if (sub === 'add') return out(await F.addGoal({ title: rest.join(' ') || opts.title, period: opts.period, area: opts.area, target: opts.target }), g => `Meta criada: ${g.title}  ${g.id}`);
            if (sub === 'set') return out(await F.updateGoal(rest[0], { current: rest[1] }), g => `${g.title}: ${g.current_value}/${g.target_value}`);
            if (sub === 'rm') return out(await F.deleteGoal(rest[0]), () => 'Meta excluída.');
            break;

        case 'review':
            if (sub === 'set') return out(await F.setReview({ date: opts.date, energy: opts.energy ? +opts.energy : undefined, mood: opts.mood ? +opts.mood : undefined, wins: opts.wins, blockers: opts.blockers, tomorrow: opts.tomorrow }), () => 'Shutdown salvo.');
            return out(await F.getReview(opts.date || sub), r => r ? `Energia ${r.energy ?? '—'} · Humor ${r.mood ?? '—'}\nVitória: ${r.wins || '—'}\nBloqueio: ${r.blockers || '—'}\nAmanhã: ${r.tomorrow || '—'}` : '(sem shutdown nesse dia)');

        case 'api': {
            const body = rest[1] ? JSON.parse(rest[1]) : undefined;
            return out(await F.api(String(sub).toUpperCase(), rest[0], body));
        }
    }
    throw new F.FlowError(`Comando desconhecido: ${pos.join(' ')}. Rode: flow help`, 400);
}

main().catch(e => {
    if (JSON_OUT) console.error(JSON.stringify({ error: e.message, status: e.status || 1 }));
    else console.error(`Erro: ${e.message}`);
    process.exit(1);
});
