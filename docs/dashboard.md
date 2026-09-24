# Dashboard local — `sdd status` e `sdd dashboard`

Visão em tempo real do que acontece num projeto SDD: quem está trabalhando, em quê, por quê, com
que permissões e ferramentas, quanto foi concluído, o que está bloqueado, qual gate está ativo e se
a entrega está pronta. **Tudo derivado dos dados do kit** — nada é perguntado ao modelo.

```
.sdd/events.jsonl ─┐   specs/ · config ─┐   .claude/agents · policies ─┐
.sdd/trace/*.jsonl ┘                    │                               │
        │ tail incremental               │ recarga quando muda           │
        ▼                                ▼                               ▼
   event store ──► reducer incremental + índice de atividade ──► métricas (progresso, saúde,
                                                                 autonomia, gates, entrega,
                                                                 rastreabilidade)
                                                                        │
                                                                        ▼
                                                               DashboardSnapshot
                                                   ┌──────────────┬──────┴────────┐
                                                sdd status   status --json    sdd dashboard (TUI)
```

Decisões: [ADR-0022](adr/ADR-0022-dashboard-local-snapshot-unico.md) (snapshot único, métricas,
TUI sem dependência) e [ADR-0023](adr/ADR-0023-trace-de-invocacoes-e-sanitizer-central.md)
(trace de invocações, MCP/LSP, sanitizer central).

## Comandos

| Comando | O que faz |
|---------|-----------|
| `sdd status` | resumo rápido: saúde, progresso, requisitos, tarefas, agentes, testes, segurança, gate atual, entrega |
| `sdd status --verbose` | + progresso por dimensão (com peso e fonte), specs, gates, agentes, scans, autonomia, estado |
| `sdd status --json` | contrato estável [`schemas/status.schema.json`](../schemas/status.schema.json) (`schemaVersion: 1`) |
| `sdd status --watch` | redesenha a cada mudança (Ctrl+C sai); sem TTY, imprime um bloco por mudança |
| `sdd status --session <id>` | limita a atividade (trace) a uma sessão |
| `sdd status --no-scan` | pula o secret scan (mais rápido; segurança aparece como `NOT_RUN`) |
| `sdd dashboard` | TUI interativa em tempo real (precisa de terminal interativo) |
| `sdd dashboard --tab <tela>` | abre numa tela: `overview`, `agents`, `tasks`, `specs`, `quality`, `security`, `events`, `runtime` (ou 1–8) |
| `sdd dashboard --once [--width W --height H]` | imprime um único quadro, sem interação (CI, documentação, depuração) |
| `sdd dashboard --demo [--interval ms]` · `sdd status --demo [--step N]` | dados **sintéticos** (ver [Demo](#modo-demo)) |
| `sdd sessions [--json]` | sessões registradas: status, início, duração, eventos, agentes, tarefas, arquivos |
| `sdd doctor --dashboard` | diagnóstico do dashboard (também roda em `--project` e `--full`) |

Opções comuns: `--ascii` (símbolos ASCII), `--no-color` (ou `NO_COLOR=1`), `--debug` (log de
diagnóstico em `.sdd/cache/dashboard.log`, sanitizado). Saídas: `0` ok · `1` não é projeto SDD ou
sem terminal interativo · `2` uso incorreto.

Exemplo real (`sdd status --demo --step 12`):

```text
SDD KIT   DEMO DATA — dados sintéticos
Projeto: Loja Escola (DEMO)
Branch:  indisponível (não é um repositório git)
Sessão:  demo-session-0001 · ativa há 0s

Saúde            ✕ DEGRADED
Progresso        █████░░░░░░░░░░░░░░░  23%
Requisitos       0/11 verificados pelo guardião
Tarefas          2/8 concluídas · 1 em andamento · 1 bloqueada(s)
Agentes ativos   2 / 12
Testes           7/8 casos · 0/2 specs verdes
Segurança        0 crítico · 1 bloqueio(s) de política · sandbox INACTIVE
Gate atual       CODE (DEMO-100)
Entrega          ⚠ BLOCKED
                 teste falhando em DEMO-100

Por quê
  ✕ teste falhando em DEMO-100
  ✕ agente agente-backend BLOCKED: tarefa bloqueada: DEMO-100/T-002
  ⚠ 1 tarefa(s) bloqueada(s)
  ⚠ 1 ação(ões) negada(s) pela política
```

## Telas e atalhos

| Tecla | Ação |
|-------|------|
| `1`–`8` | Overview · Agents · Tasks · Specs · Quality · Security · Events · Runtime |
| `←` `→` · `Tab` | tela anterior/seguinte (num detalhe, `←` volta) |
| `↑` `↓` · `j` `k` · `PgUp` `PgDn` · `Home` `End` | navegar |
| `Enter` | detalhe da linha (agente, tarefa, spec, requisito, arquivo, evento, decisão da política) |
| `Esc` · `Backspace` | voltar / limpar busca |
| `w` | **WHY?** — a cadeia pedido → spec → requisito → ADR → tarefa → arquivo → teste |
| `/` | buscar na lista atual |
| `f` | filtro de eventos: todos → erros → ferramentas → arquivos → segurança → testes → MCP → com agente |
| `p` | pausar/retomar o stream (congela o quadro) |
| `r` | refresh completo (relê tudo, git e scans) |
| `?` | ajuda · `q` / `Ctrl+C` sair |

- **Overview** — só o essencial: progresso (geral, por dimensão e por pipeline), contagens,
  agentes ativos, pipeline de gates com a etapa atual, entrega, qualidade, segurança, eventos
  recentes.
- **Agents** — todos os agentes detectados (projeto + motor). Detalhe: status e razão, saúde com
  as razões, tarefa atual, modelo (e de onde veio), contexto, chamadas, falhas, arquivos, retries,
  bloqueios, papel, **objetivo atual** (tarefa + spec — nunca raciocínio do modelo), ferramentas
  (frontmatter), **permissões** (derivadas de `policies/sdd-policy.json` + config) e linha do
  tempo de ações filtrável.
- **Tasks** — grafo por spec em ordem topológica, com status, peso, agente e dependências. Detalhe:
  todos os campos da tarefa, dependências, dependentes, arquivos e testes.
- **Specs** — specs com cobertura de requisitos; detalhe com gates (checks, evidência, motivo de
  bloqueio), ADRs citados (ausentes em vermelho) e requisitos (Enter → rastreabilidade).
- **Quality** — suítes com contagens, specs com a última suíte, evals (`evals/results/`).
- **Security** — sandbox, policy engine, hooks, trace, scans, achados e decisões da política
  (Enter: quando, agente, tentativa, regra, decisão).
- **Events** — stream ao vivo dos dois logs, mais novo no topo, com filtro, busca e pausa.
- **Runtime** — sessão (ID, início, duração, branch, HEAD, working tree, contagens), autonomia,
  ferramentas (chamadas, falhas, latência, última, agentes), MCP, LSP, arquivos tocados (Enter →
  WHY) e sessões anteriores.

Terminais pequenos: abaixo de 100 colunas o Overview vira uma coluna; abaixo de 90, as abas são
abreviadas. Sem terminal interativo (CI, pipe), `sdd dashboard` sai 1 e sugere `sdd status`.

## Métricas

Regra geral: **todo número tem origem** (`source` no JSON; `--verbose` mostra). Sem dado, o valor é
`null` / `n/d` — nunca estimado. Não existem métricas subjetivas ("qualidade do código: 97%").

### Progresso

| Dimensão | Fórmula | Fonte |
|----------|---------|-------|
| implementation | Σ peso(tarefas concluídas) / Σ peso(tarefas não canceladas) | `specs/tasks/*.md` + estado |
| requirements | requisitos de specs `approved`/`implemented` / requisitos das specs ativas | linhas `RF-`/`RNF-`/`CA-` × `GUARDIAN_APPROVED` |
| tests | specs ativas cuja última suíte passou / specs ativas | `TEST_PASSED`/`TEST_FAILED` |
| security | checagens de segurança aprovadas / executadas | secret scan, arquivos sensíveis, gates de segurança |
| documentation | média, por spec, de: frontmatter coerente (`cas` = CAs), plano, arquivo de tarefas | `specs/` |

**Overall** = Σ(peso × %) / Σ(peso), só sobre as dimensões **disponíveis** (os pesos são
renormalizados). Sem tarefas no grafo não há overall — segurança e documentação sozinhas não dizem
quanto do trabalho foi feito. Testes e requisitos sem registro contam **0 de N** (é fato: nada foi
aprovado), não saem do cálculo. Segurança sem nenhuma checagem executada sai do cálculo.

Pesos padrão e por quê: `implementation 0.45` (sinal mais granular, já inclui as etapas de teste e
de guardião das pipelines), `requirements 0.25` (verificação com evidência pelo guardião),
`tests 0.15` (evita contar duas vezes o que as tarefas de teste já contam), `security 0.10`,
`documentation 0.05`. Por pipeline: a mesma conta de implementation, agrupada pelo `pipeline:` do
arquivo de tarefas.

**Peso de tarefa**: `pesos:` (ou `weights:`) no frontmatter do arquivo de tarefas; padrão 1.

```yaml
---
tarefas-de: BIB-110
pesos:
  T-002: 3
  T-005: 2
---
```

### Saúde do projeto (Health Engine)

Avaliada em ordem; o pior nível vence e todas as razões são listadas.

| Nível | Quando |
|-------|--------|
| `BLOCKED` | `.sdd/events.jsonl` com cauda truncada · gate bloqueado (`gate_failure`) · achado crítico de segurança (`critical_security`) |
| `DEGRADED` | config inválida · erros no grafo de tarefas/specs · eventos rejeitados na reexecução · teste falhando em spec ativa · tarefas bloqueadas ≥ `blocked_tasks_degraded` · agente `DEGRADED`/`BLOCKED` |
| `ATTENTION` | tarefa bloqueada (abaixo de `blocked_tasks_degraded`) · agente em `ATTENTION` · ação negada pela política ≥ `policy_block_warning` · spec reprovada aguardando correção · checkboxes divergentes · linhas inválidas nos logs · specs sem estado · aviso de config do dashboard |
| `HEALTHY` | nenhuma regra disparou |
| `UNKNOWN` | não é um projeto SDD |

### Saúde do agente

| Nível | Sinais (limiares em `dashboard.health`) |
|-------|------------------------------------------|
| `BLOCKED` | tarefa do agente bloqueada |
| `DEGRADED` | retries ≥ `retry_critical` · falhas de ferramenta ≥ `tool_failure_critical` · bloqueios de política ≥ `policy_block_critical` · possível loop (≥ `loop_repeat` chamadas idênticas seguidas: mesma ferramenta e mesmo alvo — arquivo, comando ou padrão; chamada sem alvo conhecido, como WebFetch ou MCP, não conta) · contexto ≥ `context_critical` · teste falhando na spec da tarefa atual |
| `ATTENTION` | os mesmos sinais nos limiares `*_warning` · spec reprovada pelo guardião · tarefa em andamento há ≥ `task_minutes_warning` · subagente sem atividade há ≥ `stale_minutes` |
| `UNKNOWN` | agente sem tarefas nem atividade observada |

Retries = inícios de uma tarefa além do primeiro (`TASK_STARTED` repetido, após bloqueio ou
reabertura).

### Status do agente

`working` (subagente iniciado e não encerrado numa sessão aberta, com atividade recente) ·
`assigned` (tarefa `in_progress` sem subagente observado) · `blocked` · `ready` (tem tarefa pronta)
· `waiting` (tarefas aguardando dependências) · `idle`.

**Contexto**: o Claude Code não informa uso de contexto aos hooks, então aparece como
*indisponível*. Se um cliente gravar `context.used`/`context.limit` nos atributos do trace, o
dashboard passa a mostrar — nunca estima.

### Autonomia

```
ações         = invocações observadas, cada uma contada uma vez:
                tool.called + policy.decision (deny, e ask com tool_use_id)
                + conclusões sem par (trace gravado antes do tool.called existir)
autônomas     = ações − confirmações pedidas (ask) − bloqueios (deny)
autonomia (%) = autônomas / ações
```

Autonomia **não é qualidade**: mede só quantas ações rodaram sem intervenção humana. Confirmações
pedidas pelo próprio Claude Code (fora da política do SDD) não são observáveis.

### Gates e entrega

Pipeline de gates por spec: `SPEC → CODE → TEST → GATES → GUARDIAN → DELIVERY`.

| Gate | Aprovado quando |
|------|-----------------|
| SPEC | spec no estado e com plano |
| CODE | tarefas de papel `build`/`design`/`support`/`review` concluídas (papel: `policies/model-routing.json`) |
| TEST | tarefas de papel `verify` concluídas e a última suíte da spec verde |
| GATES | `GATE_PASSED` da spec (ou global) para cada portão de engenharia `enabled` + `blocking` da config, e nenhum `GATE_BLOCKED` |
| GUARDIAN | `GUARDIAN_APPROVED` com evidência (reprovado = `GUARDIAN_REJECTED` ainda não refeito) |
| DELIVERY | `SPEC_IMPLEMENTED` |

Etapa sem evidência registrada, mas com uma etapa posterior aprovada, aparece como `skipped`
("não observada") — nunca como aprovada. O gate atual do projeto é o da spec ativa mais atrasada.

**Entrega**: `UNKNOWN` (sem estado ou sem specs) · `BLOCKED` (gate bloqueado, teste falhando,
tarefa bloqueada, log truncado ou achado crítico) · `READY` (toda spec ativa implementada) ·
`NOT_READY` (o resto, com o motivo).

### Qualidade e segurança

Contagens de teste só existem quando o evento as traz, e só entram no total quando estão
**completas** (`--total`, ou `--passed` **e** `--failed`); uma suíte com `--passed 8` sozinho fica
fora do total e é contada como parcial — nunca vira "8/8, 0 falhas":

```bash
sdd event TEST_PASSED --spec BIB-110 --suite unit --passed 142 --failed 0 --total 142 --coverage 84
```

Segurança: o secret scan e a checagem de arquivos sensíveis são os mesmos do `doctor --security`
(rodam no startup e no `r`); dependency audit e SAST vêm dos portões de engenharia (`GATE_*`); o
agent scan, do último relatório de `sdd scan agents`. Scanner que não rodou é `NOT_RUN` — nunca
`PASS`. Crítico = segredo de alta confiança ou arquivo sensível versionado; médio = padrão de baixa
confiança (JWT, `Bearer`, senha em URL). **Sem git** não há como saber se um arquivo está
versionado (um `.env` local é normal): esses achados contam como médios, com o motivo. Altos/baixos
só existem quando um scanner os produz.

## Rastreabilidade (WHY?)

Só vínculos explícitos; o resto é `UNKNOWN`:

| Vínculo | Como é provado |
|---------|----------------|
| spec → requisito | linha `- **RF-01**:` / `- **CA-01**:` no corpo da spec |
| requisito → tarefa | o título da tarefa cita o ID (`[T-003] Serviço OAuth CA-01 CA-02`) |
| tarefa → arquivo | trace `file.modified` correlacionado à tarefa pelo hook |
| requisito → teste | arquivo de teste que cita o ID da spec **e** o do requisito (paths de teste da config ou, sem eles, pelo nome do arquivo) |
| spec → ADR | a spec cita `ADR-NNN` (`specs/decisions/`; no repositório do motor, também `docs/adr/`) |

O pedido original do usuário não é rastreado nos dados do kit e aparece como `UNKNOWN`. A cadeia é
derivada sob demanda (`traceability.mjs`) a partir do snapshot — mesmos dados, nenhuma inferência. Arquivo
sem tarefa correlacionada: *No traceability metadata available*.

## Eventos observados

O dashboard **não cria** um sistema de eventos: lê os dois logs existentes.

- **Domínio** — `.sdd/events.jsonl` ([`schemas/event.schema.json`](../schemas/event.schema.json),
  v1): `SESSION_*`, `SPEC_*`, `PLAN_CREATED`, `TASK_*`, `TEST_*`, `GUARDIAN_*`, `GATE_*`... É a
  autoridade do estado; o dashboard aplica o mesmo reducer, incrementalmente.
- **Trace** — `.sdd/trace/<sessão>.jsonl` (v1, gravado pelos hooks): `tool.called`,
  `tool.completed`, `file.modified`, `policy.decision`, `agent.spawned`, `agent.stopped`,
  `session.started`, `session.finished`. Atributos: `sdd.agent`, `sdd.task`, `sdd.spec`,
  `tool.name`, `tool.use_id`, `file.path`, `tool.command` (redigido e truncado), `mcp.server`,
  `mcp.tool`, `lsp.operation`, `policy.decision`, `policy.rule`.

Na tela, cada registro vira um rótulo (`TASK_STARTED`, `FILE_READ`, `FILE_MODIFIED`,
`TOOL_FAILED`, `POLICY_DENY`, `MCP_CALLED`, `LSP_FIND_REFERENCES`...). Linha inválida é contada e
ignorada; arquivo que encolheu (rotação/truncamento) é relido do início.

## Configuração (opcional)

Sem o bloco valem os defaults. Validado por `sdd config validate`.

```yaml
dashboard:
  refresh_ms: 1000            # stat de segurança do watcher (o fs.watch é o gatilho)
  progress:                   # pesos do overall (0–1; renormalizados)
    implementation: 0.45
    requirements: 0.25
    tests: 0.15
    security: 0.10
    documentation: 0.05
  health:
    context_warning: 75       # %
    context_critical: 90
    retry_warning: 3
    retry_critical: 6
    tool_failure_warning: 3
    tool_failure_critical: 10
    policy_block_warning: 1
    policy_block_critical: 5
    loop_repeat: 5            # chamadas idênticas seguidas
    task_minutes_warning: 60
    stale_minutes: 30         # subagente sem atividade = sessão interrompida?
    blocked_tasks_degraded: 3
    critical_security: blocked   # blocked | degraded
    gate_failure: blocked        # blocked | degraded
  events:
    max_displayed: 500        # janela de eventos em memória
  ui:
    compact: auto
```

## Segurança

- **Somente leitura**: nenhum comando ou tecla altera o projeto; não há "kill agent", "forçar gate"
  nem edição de política. Um teste garante que `status`, `sessions`, `doctor --dashboard` e
  `dashboard --once` não mudam nenhum byte do projeto.
- **Sanitizer central** (`scripts/lib/sanitize.mjs`) em eventos, trace, dashboard (inclusive os
  textos do estado vindos de logs antigos), log de diagnóstico e export OTLP: padrões de segredo
  (chaves, tokens, JWT, `Bearer`, `Basic`, senha em URL) viram `[REDACTED:<tipo>]`; campos cujo nome
  termina num termo de credencial (`authorization`, `password`, `github_token`, `DB_PASSWORD`,
  `x-api-key`...) viram `[REDACTED]`.
- **Sem injeção no terminal**: caracteres de controle (inclusive `ESC`) de qualquer texto observado
  são removidos antes de chegar à tela ou ao JSON; quebras de linha viram espaço.
- A decisão da política (`deny`/`ask`) é emitida **antes** do trace: nenhuma falha de
  observabilidade anula um bloqueio.
- Git só com comandos de leitura (`git --no-optional-locks status`, `rev-parse`).
- O dashboard nunca chama MCP nem LSP: as métricas vêm do uso real registrado pelos hooks.
- **Demo** grava só num diretório temporário próprio (marcado com `DEMO-DATA.txt`) e o apaga ao sair.

## Modo demo

`sdd dashboard --demo` cria um projeto **sintético** (loja escolar com login Google, 2 specs,
8 tarefas, 5 agentes) num diretório temporário e roda um simulador que grava pelos escritores reais
do kit: sessão, ondas paralelas, leituras, LSP, MCP, bloqueio de `.env` pela política, teste
falhando, retry, gate de dependências, reprovação e aprovação do guardião, entrega. Cabeçalho e
JSON marcados `DEMO DATA` / `"demo": true`. `--interval` ajusta o ritmo (padrão 900 ms);
`sdd status --demo --step N` mostra o estado após N passos. Os mesmos passos são usados nos testes.

## OpenTelemetry

`sdd trace export --otlp <url>` continua sendo o caminho para Phoenix ou outro backend; o dashboard
lê os mesmos arquivos (um evento, vários consumidores). Os atributos existentes foram mantidos
(renomear quebraria exportações); entraram `mcp.server`, `mcp.tool`, `lsp.operation` e
`tool.use_id`. Tudo passa pelo sanitizer antes de sair.

## Desempenho

Cenário sintético de 50 agentes, 1 000 tarefas, 100 specs, 50 ADRs e 100 000 eventos:
startup ~1,6 s, atualização incremental de 1 000 registros ~35 ms, quadro da TUI ~3 ms, CPU ociosa
< 0,5% — números e ambiente em [`docs/reports/dashboard-performance.md`](reports/dashboard-performance.md)
(`node tests/perf/dashboard.perf.mjs --report ...`).

## Solução de problemas

| Sintoma | Causa provável / ação |
|---------|-----------------------|
| `terminal interativo não detectado` | CI, pipe ou IDE sem TTY — use `sdd status`, `sdd status --watch` ou `sdd dashboard --once` |
| `nenhum projeto SDD em ...` | rode na raiz do projeto (ou `--root`); projeto novo: `/sdd-init`; para ver a ferramenta: `--demo` |
| Requisitos `0/N` e "sem estado estruturado" | `sdd tasks sync` nunca rodou |
| Autonomia/ferramentas vazias | trace desligado (`observability.trace: false`) ou hooks ausentes (`sdd doctor --security`) |
| Latência `n/d` | a chamada não tinha `tool_use_id` (cliente antigo) ou a ferramenta não passa pelo PreToolUse (LSP) |
| Contexto `n/d` | esperado: o runtime não informa uso de contexto aos hooks |
| Log truncado → `BLOCKED` | escrita interrompida: `sdd state repair` |
| Símbolos quebrados no terminal | `--ascii`; cores estranhas: `--no-color` |
| Algo parece errado | `sdd doctor --dashboard` e `sdd status --verbose --debug` (log em `.sdd/cache/dashboard.log`) |
