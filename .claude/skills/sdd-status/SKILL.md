---
name: sdd-status
description: Mostra o painel do SDD — status de cada spec pelo estado estruturado (.sdd/events.jsonl), tarefas por spec, próximas tarefas prontas, bloqueios, testes falhando e alertas do doctor. Somente leitura. Use quando o usuário perguntar o andamento do projeto, o que falta, o que está bloqueado, por onde retomar, ou rodar /sdd-status.
license: MIT
metadata:
  sdd-core: "true"
  sdd-version: "3.0.0"
---

# /sdd-status — painel (somente leitura)

**`sdd`** = `node "${CLAUDE_SKILL_DIR}/../../../scripts/sdd.mjs"`

Não edite nada: este é um diagnóstico.

1. `sdd state resume --json` — sessões abertas, specs ativas, tarefas em andamento/bloqueadas/prontas,
   testes falhando, gates bloqueados, checkboxes divergentes.
2. `sdd tasks list --json` — tarefas por spec com status efetivo.
3. `sdd doctor --fast --json` — falhas e avisos de config, specs, grafo, estado e agentes.
4. Leia o frontmatter das specs (`spec-id`, `titulo`, `status`, `cas`) só para o título.

Imprima:

| Spec | Título | Status (estado) | CAs | Tarefas (concluídas/total) | Pendência |
|------|--------|-----------------|-----|----------------------------|-----------|

Feche com: total de specs por status, próximas tarefas prontas (com agente), bloqueios com motivo e
os alertas do doctor. Se o estado ainda não existir (`sdd tasks sync` nunca rodou), diga isso e
sugira rodar — sem rodar você mesmo.
