---
name: sdd-status
description: Mostra o painel do SDD — saúde, progresso, requisitos, tarefas, agentes, gates, entrega e segurança, calculados pela CLI a partir do estado estruturado (.sdd/events.jsonl) e do trace — mais as specs, próximas tarefas prontas, bloqueios e alertas do doctor. Somente leitura. Use quando o usuário perguntar o andamento do projeto, o que falta, o que está bloqueado, por onde retomar, ou rodar /sdd-status.
license: MIT
metadata:
  sdd-core: "true"
  sdd-version: "3.0.0"
---

# /sdd-status — painel (somente leitura)

**`sdd`** = `node "${CLAUDE_SKILL_DIR}/../../../scripts/sdd.mjs"`

Não edite nada: este é um diagnóstico. **Não estime** progresso, saúde ou prontidão: os números vêm
da CLI, que os calcula deterministicamente (fórmulas em `docs/dashboard.md`). Número que a CLI
devolve como `null`/indisponível continua indisponível na sua resposta.

1. `sdd status --json` — saúde (com as razões), progresso por dimensão (com a fonte), requisitos
   verificados, tarefas por status, agentes, gate atual, prontidão de entrega, segurança e autonomia.
2. `sdd state resume --json` — sessões abertas, specs ativas, tarefas em andamento/bloqueadas/prontas,
   testes falhando, gates bloqueados, checkboxes divergentes.
3. `sdd tasks list --json` — tarefas por spec com status efetivo.
4. `sdd doctor --fast --json` — falhas e avisos de config, specs, grafo, estado e agentes.

Imprima o resumo do `status` (saúde, progresso, entrega, gate atual) e depois:

| Spec | Título | Status (estado) | Gate atual | Requisitos (verificados/total) | Tarefas (concluídas/total) | Pendência |
|------|--------|-----------------|------------|--------------------------------|----------------------------|-----------|

Feche com: próximas tarefas prontas (com agente), bloqueios com motivo, as razões de saúde e os
alertas do doctor. Se o estado ainda não existir (`sdd tasks sync` nunca rodou), diga isso e sugira
rodar — sem rodar você mesmo. Para acompanhar em tempo real, sugira `sdd dashboard` (terminal
interativo) ou `sdd status --watch`.
