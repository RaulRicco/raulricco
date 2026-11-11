#!/usr/bin/env node
// Servidor MCP (stdio) do Flow Produtividade — expõe o sistema como ferramentas para assistentes de IA.
// Sem dependências: implementa o protocolo JSON-RPC 2.0 delimitado por linha.
import { createInterface } from 'node:readline';
import * as F from './lib.mjs';

const VERSION = '1.0.0';
const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const int = (description, extra = {}) => ({ type: 'integer', description, ...extra });
const DATE = 'Data YYYY-MM-DD, DD/MM, "hoje", "ontem" ou "amanhã" (fuso de São Paulo). Padrão: hoje.';
const AREA = 'Área pelo nome (ex.: "Saúde") ou id. Veja flow_list_areas.';
const QUAD = { type: 'string', enum: ['q1', 'q2', 'q3', 'q4'], description: 'Matriz de Eisenhower: q1 Fazer agora (urgente+importante), q2 Agendar (importante), q3 Delegar (urgente), q4 Eliminar.' };
const DUR = 'Duração: minutos (90) ou texto ("1h30", "45m", "2h").';

const TOOLS = [
    { name: 'flow_today', description: 'Resumo do dia: Flow Score, deep work, Big 3, tarefas, progresso de cada área contra a meta e shutdown.', inputSchema: { type: 'object', properties: {} }, run: () => F.today() },
    { name: 'flow_stats', description: 'Métricas de um período: deep work, sessões, Flow Score médio, tarefas, taxa do Big 3, qualidade do foco e meta × realizado por área.', inputSchema: { type: 'object', properties: { days: int('Dias para trás (1–180). Padrão 30.') } }, run: a => F.stats(a) },

    { name: 'flow_list_tasks', description: 'Lista tarefas de um dia ou de um intervalo.', inputSchema: { type: 'object', properties: { date: str(DATE), from: str('Início do intervalo (usar com to).'), to: str('Fim do intervalo.'), status: { type: 'string', enum: ['pending', 'done'] } } }, run: a => F.listTasks(a) },
    { name: 'flow_add_task', description: 'Cria uma tarefa.', inputSchema: { type: 'object', required: ['text'], properties: { text: str('Texto da tarefa.'), area: str(AREA), quadrant: QUAD, mit: { type: 'boolean', description: 'Marcar como Big 3 (máx. 3 por dia).' }, estimate: int('Pomodoros estimados (1–12).'), date: str(DATE) } }, run: a => F.addTask(a) },
    { name: 'flow_update_task', description: 'Edita uma tarefa: texto, área, quadrante, Big 3, estimativa, data (mover de dia) ou concluir/reabrir.', inputSchema: { type: 'object', required: ['id'], properties: { id: str('id da tarefa.'), text: str('Novo texto.'), area: str(AREA), quadrant: QUAD, mit: { type: 'boolean' }, estimate: int('Pomodoros estimados.'), date: str(DATE), completed: { type: 'boolean' } } }, run: ({ id, ...a }) => F.updateTask(id, a) },
    { name: 'flow_complete_step', description: 'Marca a tarefa como concluída HOJE (conta nas métricas do dia) e cria a próxima etapa para outro dia (padrão: amanhã). Use quando a demanda depende de outras etapas. A nova tarefa fica ligada à anterior (step + 1).', inputSchema: { type: 'object', required: ['id'], properties: { id: str('id da tarefa/etapa atual.'), next: str('Texto da próxima etapa (padrão: mesmo texto).'), date: str('Quando a próxima etapa aparece. ' + DATE.replace('Padrão: hoje.', 'Padrão: amanhã.')), keep_mit: { type: 'boolean', description: 'Manter a próxima etapa no Big 3.' } } }, run: a => F.completeStep(a.id, { next: a.next, date: a.date, keepMit: a.keep_mit }) },
    { name: 'flow_delete_task', description: 'Exclui uma tarefa.', inputSchema: { type: 'object', required: ['id'], properties: { id: str('id da tarefa.') } }, run: a => F.deleteTask(a.id) },

    { name: 'flow_log_time', description: 'Lança tempo de foco (deep work) em uma área e/ou tarefa. Conta para a meta da área e para o dashboard.', inputSchema: { type: 'object', required: ['minutes'], properties: { minutes: { type: ['integer', 'string'], description: DUR }, area: str(AREA), task: str('id da tarefa (opcional; a área vem dela se não informada).'), date: str(DATE), quality: int('Qualidade do foco 1–5 (opcional).', { minimum: 1, maximum: 5 }) } }, run: a => F.logTime(a) },
    { name: 'flow_list_sessions', description: 'Lista sessões de foco/pausa de um dia ou intervalo.', inputSchema: { type: 'object', properties: { date: str(DATE), from: str('Início.'), to: str('Fim.') } }, run: a => F.listSessions(a) },
    { name: 'flow_update_session', description: 'Dá nota de qualidade (1–5) a uma sessão.', inputSchema: { type: 'object', required: ['id', 'quality'], properties: { id: str('id da sessão.'), quality: int('1–5', { minimum: 1, maximum: 5 }) } }, run: a => F.rateSession(a.id, a.quality) },
    { name: 'flow_delete_session', description: 'Exclui uma sessão (ex.: tempo lançado por engano).', inputSchema: { type: 'object', required: ['id'], properties: { id: str('id da sessão.') } }, run: a => F.deleteSession(a.id) },

    { name: 'flow_list_areas', description: 'Lista as áreas com meta de foco (minutos por dia/semana/mês), cor, ícone e se estão arquivadas.', inputSchema: { type: 'object', properties: {} }, run: () => F.listAreas() },
    { name: 'flow_upsert_area', description: 'Cria uma área (sem id) ou edita uma existente (com id/nome). Também arquiva/restaura.', inputSchema: { type: 'object', properties: { id: str('id ou nome da área a editar. Omitir para criar.'), name: str('Nome.'), target: { type: ['integer', 'string'], description: 'Meta de foco: ' + DUR + ' 0 = sem meta.' }, period: { type: 'string', enum: ['dia', 'semana', 'mes'], description: 'Período da meta.' }, color: str('Cor #RRGGBB.'), icon: str('Ícone Font Awesome, ex.: "dumbbell", "book", "briefcase".'), archived: { type: 'boolean' } } }, run: a => F.upsertArea(a) },

    { name: 'flow_list_goals', description: 'Lista metas (trimestrais, mensais, semanais) com progresso.', inputSchema: { type: 'object', properties: {} }, run: () => F.listGoals() },
    { name: 'flow_add_goal', description: 'Cria uma meta.', inputSchema: { type: 'object', required: ['title'], properties: { title: str('Título.'), period: { type: 'string', enum: ['trimestral', 'mensal', 'semanal'] }, area: str(AREA), target: int('Valor alvo numérico.') } }, run: a => F.addGoal(a) },
    { name: 'flow_update_goal', description: 'Atualiza progresso (current), alvo ou título de uma meta.', inputSchema: { type: 'object', required: ['id'], properties: { id: str('id da meta.'), current: int('Valor atual.'), target: int('Novo alvo.'), title: str('Novo título.') } }, run: ({ id, ...a }) => F.updateGoal(id, a) },
    { name: 'flow_delete_goal', description: 'Exclui uma meta.', inputSchema: { type: 'object', required: ['id'], properties: { id: str('id da meta.') } }, run: a => F.deleteGoal(a.id) },

    { name: 'flow_get_review', description: 'Lê o shutdown diário (energia, humor, vitória, bloqueio, prioridade de amanhã).', inputSchema: { type: 'object', properties: { date: str(DATE) } }, run: a => F.getReview(a.date) },
    { name: 'flow_set_review', description: 'Grava/atualiza o shutdown diário. Campos omitidos são mantidos.', inputSchema: { type: 'object', properties: { date: str(DATE), energy: int('1–5', { minimum: 1, maximum: 5 }), mood: int('1–5', { minimum: 1, maximum: 5 }), wins: str('Vitória do dia.'), blockers: str('O que atrapalhou.'), tomorrow: str('Prioridade nº 1 de amanhã.') } }, run: a => F.setReview(a) },

    { name: 'flow_api', description: 'Chamada direta à API do Flow para casos não cobertos (ex.: GET /analytics?since=YYYY-MM-DD). Use as outras ferramentas sempre que possível.', inputSchema: { type: 'object', required: ['method', 'path'], properties: { method: { type: 'string', enum: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] }, path: str('Caminho começando com /'), body: { type: 'object' } } }, run: a => F.api(a.method, a.path, a.body) },
];

const send = msg => process.stdout.write(JSON.stringify(msg) + '\n');
const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

async function handle(msg) {
    const { id, method, params } = msg;
    if (method === 'initialize') {
        return reply(id, {
            protocolVersion: params?.protocolVersion || '2025-06-18',
            capabilities: { tools: {} },
            serverInfo: { name: 'flow-produtividade', version: VERSION },
            instructions: 'Flow Produtividade: sistema de produtividade do usuário (tarefas com Matriz de Eisenhower e Big 3, áreas com meta de foco, sessões de deep work, metas e shutdown diário). Datas no fuso de São Paulo. Comece por flow_today para contexto. Use nomes de área (flow_list_areas). Confirme com o usuário antes de excluir.',
        });
    }
    if (method === 'notifications/initialized' || method?.startsWith('notifications/')) return;
    if (method === 'ping') return reply(id, {});
    if (method === 'tools/list') return reply(id, { tools: TOOLS.map(({ run, ...t }) => t) });
    if (method === 'tools/call') {
        const tool = TOOLS.find(t => t.name === params?.name);
        if (!tool) return fail(id, -32602, `Ferramenta desconhecida: ${params?.name}`);
        try {
            const result = await tool.run(params.arguments || {});
            return reply(id, { content: [{ type: 'text', text: JSON.stringify(result ?? { ok: true }, null, 2) }] });
        } catch (e) {
            return reply(id, { content: [{ type: 'text', text: `Erro: ${e.message}` }], isError: true });
        }
    }
    if (id !== undefined) fail(id, -32601, `Método não suportado: ${method}`);
}

const rl = createInterface({ input: process.stdin });
rl.on('line', line => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch { return fail(null, -32700, 'JSON inválido'); }
    handle(msg).catch(e => fail(msg.id ?? null, -32603, e.message));
});
