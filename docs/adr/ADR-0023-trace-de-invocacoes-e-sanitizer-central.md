---
adr-id: ADR-0023
titulo: Trace de invocações (tool.called), MCP/LSP observados e sanitizer central para toda telemetria
status: aceito
data: 2026-09-24
---

# ADR-0023: Trace de invocações e sanitizer central

## Contexto
O trace local (ADR-0012) registrava só conclusões (`tool.completed`, `file.modified`) e decisões
não permissivas da política. Para o dashboard (ADR-0022) isso deixava sem base real:
- **autonomia** (quantas ações rodaram sem intervenção) — ações permitidas não eram registradas;
- **latência** de ferramentas e de MCP — sem início, não há duração;
- **uso de MCP e LSP** — as ferramentas `mcp__*` e `LSP` não estavam no matcher dos hooks;
- **leituras** (`Read`, `Grep`, `Glob`) — só apareciam quando negadas.
A redação de segredos existia (`redact`), mas cada consumidor a aplicava do seu jeito, só sobre
valores textuais e sem olhar o nome do campo (um `authorization: "..."` sem padrão conhecido
passava).

## Decisão
1. **PreToolUse registra `tool.called`** para toda chamada permitida (nome, alvo resumido e
   `tool.use_id`), sem correlação de tarefa (que exigiria reler o estado em cada chamada). Decisões
   `deny`/`ask` continuam como `policy.decision`, agora também com `tool.use_id`.
2. **PostToolUse grava `tool.use_id`** e, quando o cliente informa, `duration_ms`. O dashboard
   pareia início e fim pelo id; sem id, a latência é `n/d`.
3. **Matchers ampliados:** PreToolUse passa a cobrir `Glob|Skill|Agent|Task|mcp__.*`; PostToolUse
   passa a cobrir `LSP|mcp__.*`. O servidor/ferramenta MCP (`mcp.server`, `mcp.tool`) e a operação
   LSP (`lsp.operation`) viram atributos. LSP fica fora do PreToolUse de propósito: é frequente e
   rápido, e um processo a mais por consulta pesaria mais do que a latência que mediria.
4. **Sanitizer central** (`scripts/lib/sanitize.mjs`): redação por valor (padrões de
   `secrets.mjs`, agora com `Bearer`/`Basic` preservando o nome do esquema) + redação por nome de
   campo (`authorization`, `password`, `token`, `api_key`...). Usado por `appendEvent` (meta dos
   eventos de domínio), `traceEvent`, normalização do dashboard, log de diagnóstico e `toOtlp`.
5. **Atributos OTel:** os nomes existentes (`sdd.spec`, `sdd.task`, `sdd.agent`, `tool.name`...)
   ficam — renomear quebraria quem já exporta. Entram só `mcp.server`, `mcp.tool`, `lsp.operation`
   e `tool.use_id`, todos de cardinalidade limitada (exceto `tool.use_id`, que é por span, como o
   próprio `span_id`).
6. Sem mudança de schema: `schemas/event.schema.json` (v1) e o formato do trace (v1) continuam; os
   campos novos são aditivos. Traces antigos continuam legíveis (o dashboard conta conclusões sem
   par como ações).

## Alternativas
- **Arquivo de eventos novo para o dashboard**: dois sistemas de telemetria independentes, contra o
  princípio de uma fonte por fato.
- **Medir latência no PostToolUse com timestamp guardado em cache**: exigiria escrita de estado
  compartilhado por chamada; o par `tool.called`/`tool.completed` no próprio trace é mais simples.
- **Redigir só no export OTLP**: o segredo já estaria gravado em disco no trace local.

## Consequências
- Um processo de hook a mais por chamada de `Skill`/`Agent`/`Task`/MCP (antes só havia o
  PostToolUse), e o trace cresce ~2× (uma linha no início, outra no fim). Continua local, não
  versionado e desligável (`observability.trace: false`).
- Mudar hooks/matchers é mudança de guardrail: projetos em modo cópia recebem pelo `sdd upgrade`
  (que mescla os hooks do motor); no modo plugin, pela atualização do plugin.
- Redação por nome de campo pode esconder um valor inofensivo num campo chamado `token`; é o lado
  seguro do erro.
