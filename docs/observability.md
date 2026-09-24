# Observabilidade

Objetivo: investigar uma execução problemática por **sessão, spec, tarefa, agente ou trace ID** sem
depender só do transcript do chat.

## Nível 1 — local e barato (padrão)

Os hooks gravam `.sdd/trace/<sessão>.jsonl` (não versionado):

| Evento | Quando |
|--------|--------|
| `session.started` / `session.finished` | início e fim da sessão |
| `agent.spawned` / `agent.stopped` | subagente começou/terminou (com a tarefa correlacionada) |
| `tool.called` | a política permitiu a chamada (PreToolUse): ferramenta, alvo resumido e `tool.use_id` |
| `tool.completed` | Bash, Skill, Agent/Task, LSP e MCP (`mcp__*`) concluídos, com `tool.use_id` |
| `file.modified` | Write/Edit (só o caminho) |
| `policy.decision` | a política negou ou pediu confirmação (regra e decisão) |

`tool.called` + `tool.completed` com o mesmo `tool.use_id` dão a latência; `mcp.server`/`mcp.tool`
e `lsp.operation` identificam uso de MCP e LSP ([ADR-0023](adr/ADR-0023-trace-de-invocacoes-e-sanitizer-central.md)).

Os eventos de domínio (`.sdd/events.jsonl`: `task.started`, `test.failed`, `guardian.approved`...)
entram na mesma linha do tempo:

```bash
sdd trace show --task BIB-110/T-003
sdd trace show --spec BIB-110
sdd trace show --agent agente-backend --session <id>
sdd trace show --trace <trace_id> --json
```

**Nunca registrado:** conteúdo de arquivo, saída de ferramenta, segredos (comandos passam por
redação e truncamento). A mesma sanitização (`scripts/lib/sanitize.mjs`: padrões de segredo +
campos com nome de credencial) vale para os eventos de domínio, o painel, o log de diagnóstico e o
export OTLP. Desligar: `observability.trace: false` no `sdd.config.yaml`.

## Painel local — `sdd status` e `sdd dashboard`

Os mesmos dois arquivos (trace + eventos de domínio) alimentam o painel local em tempo real:
saúde, progresso, agentes, gates, entrega, segurança, autonomia, MCP, LSP e rastreabilidade —
sem outro sistema de eventos e sem perguntar nada ao modelo. Ver [`docs/dashboard.md`](dashboard.md).

## Nível 2 — OpenTelemetry (opcional)

Os registros já têm o formato de spans: `trace_id` (sha256 da sessão, 32 hex), `span_id` (16 hex),
`parent_span_id`, nome, status e atributos (`sdd.spec`, `sdd.task`, `sdd.agent`, `tool.name`,
`policy.decision`...). `sdd trace export --otlp <url>` converte para OTLP/HTTP JSON e envia.

## Nível 3 — Phoenix (opcional)

[Arize Phoenix](https://github.com/Arize-ai/phoenix) (Elastic License 2.0) funciona como visualizador
de traces e plataforma de experimentos. Com um Phoenix local:

```bash
sdd trace export --otlp http://localhost:6006/v1/traces   # endpoint OTLP/HTTP usual; confira na versão
```

Phoenix fora do ar **nunca** impede o desenvolvimento: o export avisa e o trace local permanece.
Nada no core depende dele.

## Fail-open

Qualquer falha de trace é engolida pelo hook. Observabilidade não bloqueia trabalho; só as regras de
segurança destrutivas são fail-closed (ver `docs/security/threat-model.md`).
