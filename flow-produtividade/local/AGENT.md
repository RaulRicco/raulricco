# Flow Produtividade — guia para o assistente virtual

O Flow é o sistema de produtividade do Raul. Você pode ler e editar tudo nele por **três caminhos** (escolha o que seu runtime suporta):

1. **MCP (stdio)** — comando: `~/.local/bin/flow-mcp` (ou `node ~/.flow/app/mcp.mjs`). Ferramentas `flow_*` descritas abaixo.
2. **CLI** — comando `flow` (em `~/.local/bin`). Saída JSON quando chamada por outro programa (stdout não é terminal) ou com `--json`. Erros saem em stderr como `{"error": "...", "status": N}` com código de saída 1.
3. **HTTP** — `https://flow-produtividade-api.raulriccoads.workers.dev`, cabeçalho `Authorization: Bearer <token>`. O token fica em `~/.flow/config.json` (campo `token`) ou na variável `FLOW_TOKEN`.

Datas são sempre no fuso **America/Sao_Paulo**, formato `YYYY-MM-DD` (CLI/MCP também aceitam `DD/MM`, `hoje`, `ontem`, `amanhã`).

## O sistema (para decidir bem)

- **Áreas**: cada área da vida (Profissional, Pessoal, Saúde…) tem uma meta de foco em minutos por `daily`/`weekly`/`monthly`. Semana = segunda a domingo. Ids `work` e `personal` são as áreas padrão; áreas criadas têm id UUID. Pode referenciar por nome.
- **Tarefas**: classificadas na Matriz de Eisenhower — `q1` Fazer agora (urgente+importante), `q2` Agendar (importante), `q3` Delegar (urgente), `q4` Eliminar. **Big 3** (`mit`) = até 3 tarefas principais do dia. `estimate` = pomodoros estimados. Tarefas pendentes de dias anteriores são movidas para hoje automaticamente quando o app abre.
- **Sessões**: tempo de foco (`mode: focus`) com `duration_minutes`, área, tarefa opcional e nota de qualidade 1–5. É isso que conta para as metas das áreas. Lançar tempo = criar sessão.
- **Metas**: `quarterly`/`monthly`/`weekly`, com `current_value`/`target_value` numéricos.
- **Shutdown diário** (`reviews`): energia 1–5, humor 1–5, vitória, bloqueios, prioridade de amanhã.
- **Flow Score** diário (0–100) = 40 deep work (meta 3h) + 30 Big 3 + 20 tarefas concluídas + 10 qualidade do foco.

## Boas práticas

- Comece com `flow today` / `flow_today` para ter contexto (ids das tarefas, progresso das áreas).
- Antes de **excluir** qualquer coisa, confirme com o Raul.
- Ao criar tarefa, escolha quadrante e área; não marque mais de 3 Big 3 no mesmo dia (o app limita).
- Para "quanto falta" em uma área use `flow stats` / `flow_stats` → `areas[].current_period` (`missing_minutes`, `needed_per_day_minutes`).

## CLI — referência rápida

```bash
flow today                                   # resumo do dia (JSON se não for terminal)
flow stats --days 30
flow tasks --date hoje --pending
flow tasks --from 2026-11-01 --to 2026-11-30 --done
flow task add "Enviar proposta" --area Profissional --q q1 --mit --est 2
flow task edit <id> --q q2 --date amanhã --area Clientes
flow task done <id>        # undo <id> reabre; rm <id> exclui
flow log 1h30 --area Saúde --quality 4      # lançar tempo de foco
flow log 25 --task <id>                      # a área vem da tarefa
flow sessions --date hoje | flow session rm <id> | flow session rate <id> 5
flow areas
flow area add "Estudos" --target 1h --per dia --color "#c98500" --icon book
flow area edit Estudos --target 5h --per semana | flow area archive Estudos
flow goals | flow goal add "Fechar 5 clientes" --period trimestral --area Profissional --target 5
flow goal set <id> 3 | flow goal rm <id>
flow review --date ontem
flow review set --energy 4 --mood 5 --wins "Fechei a proposta" --tomorrow "Gravar vídeo"
flow api GET "/analytics?since=2026-10-01"   # acesso direto
```

## Ferramentas MCP

`flow_today`, `flow_stats{days}`, `flow_list_tasks{date|from,to,status}`, `flow_add_task{text,area,quadrant,mit,estimate,date}`, `flow_update_task{id,…,completed}`, `flow_delete_task{id}`, `flow_log_time{minutes,area,task,date,quality}`, `flow_list_sessions`, `flow_update_session{id,quality}`, `flow_delete_session{id}`, `flow_list_areas`, `flow_upsert_area{id?,name,target,period,color,icon,archived}`, `flow_list_goals`, `flow_add_goal`, `flow_update_goal{id,current,target,title}`, `flow_delete_goal{id}`, `flow_get_review{date}`, `flow_set_review{date,energy,mood,wins,blockers,tomorrow}`, `flow_api{method,path,body}`.

Exemplo de configuração MCP (formato Claude Desktop / Cursor / maioria dos clientes):

```json
{ "mcpServers": { "flow": { "command": "/Users/raulricco/.local/bin/flow-mcp" } } }
```

## API HTTP

| Método | Caminho | Corpo / parâmetros |
|---|---|---|
| GET | `/me` | — |
| GET | `/tasks?date=D` ou `?from=D&to=D[&status=pending\|done]` | — |
| POST | `/tasks` | `text, date, area, important(0/1), urgent(0/1), is_mit, estimate` |
| PATCH | `/tasks/:id` | qualquer de `text, completed, area, important, urgent, is_mit, estimate, date, sort_order` |
| DELETE | `/tasks/:id` | — |
| GET | `/sessions?date=D` ou `?from=D&to=D` | — |
| POST | `/sessions` | `mode(focus\|shortBreak\|longBreak), duration_minutes(1–720), date, area, task_id` |
| PATCH | `/sessions/:id` | `focus_quality(1–5), task_id` |
| DELETE | `/sessions/:id` | — |
| GET/POST | `/areas` | POST: `name, color(#RRGGBB), icon(fa-*), target_minutes, target_period(daily\|weekly\|monthly)` |
| PATCH | `/areas/:id` | mesmos campos + `archived, sort_order` |
| GET/POST | `/goals` | POST: `title, period(weekly\|monthly\|quarterly), area, target_value` |
| PATCH/DELETE | `/goals/:id` | PATCH: `title, current_value, target_value` |
| GET/PUT | `/reviews?date=D` | PUT: `energy, mood, wins, blockers, tomorrow` (substitui o dia inteiro) |
| GET | `/analytics?since=D` | dados brutos: `sessions, tasks, reviews, goals, areas` desde D |

Chaves de API (`flow_pat_…`) são criadas/revogadas no app em **Integrações** (ou `flow login`). Uma chave não pode criar nem revogar outras chaves.
