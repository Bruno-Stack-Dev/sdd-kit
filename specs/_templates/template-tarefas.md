---
tarefas-de: <PREFIXO>NNN
plano-relacionado: <PREFIXO>NNN
status: rascunho
atualizado-em: AAAA-MM-DD
pipeline: <nome da pipeline da config>
tags: [tarefas]
---

# Tarefas — <Título>

> **Gerado por `sdd spec new`**: uma tarefa por etapa de `pipelines.<nome>` da config, cada uma
> dependendo da anterior, atribuída ao agente da etapa. As linhas abaixo mostram só a forma.

## Convenções
- ID global: `<spec>/T-NNN`. Estados: `[ ]` pendente · `[~]` em andamento · `[!]` bloqueada ·
  `[x]` concluída · `[-]` cancelada. **O estado (`sdd event TASK_*`) é a autoridade**; os checkboxes
  são reescritos por `sdd tasks sync`.
- Dependências: `🔒 T-NNN` (mesma spec) ou `🔒 SPEC/T-NNN` (outra spec). O grafo precisa ser acíclico.

## Tarefas
- [ ] [T-001] <etapa 1 da pipeline> — <saída esperada> (@agente-da-etapa-1)
- [ ] [T-002] <etapa 2 da pipeline> — <saída esperada> (@agente-da-etapa-2) 🔒 T-001
- [ ] [T-003] <etapa 3 da pipeline> — <saída esperada> (@agente-da-etapa-3) 🔒 T-002
- [ ] [T-004] <etapa 4 da pipeline> — <saída esperada> (@agente-da-etapa-4) 🔒 T-003
- [ ] [T-005] <etapa 5 da pipeline> — <saída esperada> (@agente-da-etapa-5) 🔒 T-004
- [ ] [T-006] <etapa de testes da pipeline> — 1 teste por CA + negativos (@agente-qa-testes) 🔒 T-005
- [ ] [T-007] <etapa com guardian: true> — evidência por CA + padrões proibidos (@agente-spec-guardian) 🔒 T-006

## Definition of Done
- [ ] Cada CA da spec tem teste · [ ] Suíte verde · [ ] Padrões proibidos no esperado
- [ ] Guardião aprovou com evidência · [ ] Spec atualizada se houve divergência
