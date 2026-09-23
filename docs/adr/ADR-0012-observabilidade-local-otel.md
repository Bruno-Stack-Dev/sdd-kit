---
adr-id: ADR-0012
titulo: Trace local em JSONL compatível com OpenTelemetry; Phoenix opcional
status: aceito
data: 2026-09-23
---

# ADR-0012: Observabilidade

## Contexto
Uma execução problemática só podia ser investigada pelo transcript do chat; não havia ligação entre
chamadas de ferramenta, agentes, tarefas e specs.

## Decisão
1. Hooks gravam `.sdd/trace/<sessão>.jsonl` (não versionado, fail-open): sessão, agentes, ferramentas,
   arquivos modificados e decisões da política, correlacionados à tarefa em andamento.
2. Campos no formato de spans OTel (`trace_id` = sha256 da sessão, `span_id`, atributos `sdd.*`).
3. `sdd trace show` junta trace e eventos de domínio com filtros por sessão/spec/tarefa/agente/trace.
4. `sdd trace export --otlp` para qualquer backend OTLP (Phoenix como exemplo), explícito e fail-open.
5. Privacidade: nunca conteúdo de arquivo nem saída de ferramenta; comandos redigidos e truncados;
   desligável por `observability.trace: false`. Sem telemetria remota por padrão.

## Consequências
- Um hook a mais por chamada de ferramenta relevante (PostToolUse e SubagentStart).
- Phoenix e OTel nunca são dependências do core.
