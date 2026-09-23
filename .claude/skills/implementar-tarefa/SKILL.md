---
name: implementar-tarefa
description: Implementa uma única tarefa do grafo de tarefas (specs/tasks/) pelo agente responsável, validando dependências pela CLI e registrando início, bloqueio ou conclusão no estado. Use quando o usuário pedir para fazer uma tarefa específica pelo ID (T-NNN ou SPEC/T-NNN), ou rodar /implementar-tarefa.
disable-model-invocation: true
argument-hint: "<T-NNN | SPEC/T-NNN>"
license: MIT
metadata:
  sdd-core: "true"
  sdd-version: "3.0.0"
---

# /implementar-tarefa <ID>

**`sdd`** = `node "${CLAUDE_SKILL_DIR}/../../../scripts/sdd.mjs"`

Se `$ARGUMENTS` estiver vazio, **peça o ID** — não adivinhe.

1. `sdd tasks show $ARGUMENTS` — se for ambíguo (o mesmo `T-NNN` em várias specs), mostre as opções
   e peça o ID qualificado `SPEC/T-NNN`.
2. `sdd models resolve --task <ID> --json` → `model` e `effort` escolhidos pelo kit para o papel do
   agente (não escolha por conta própria).
3. `sdd event TASK_STARTED --task <ID> --agent <agente> --model <model> --effort <effort>` — a CLI
   recusa se houver dependência não concluída; nesse caso, informe quais e pare.
4. Leia a spec mãe, o plano e a config; delegue ao `@agente` da tarefa **passando o `model`
   resolvido** (regras em `.claude/agents/<agente>.md`), respeitando stack, paths, gates e padrões
   proibidos da config. Sem subagentes no cliente, atue você mesmo como o papel.
5. Rode os testes da config e registre `TEST_PASSED`/`TEST_FAILED --spec <SPEC> --command "..."`.
6. Verde → `sdd event TASK_COMPLETED --task <ID>`; impedimento → `TASK_BLOCKED --task <ID> --reason "..."`.
7. `sdd tasks sync` (checkbox a partir do estado). Se a implementação divergiu da spec, atualize a
   spec (ou proponha ADR quando relaxar regra da config).

Tarefa do `@agente-spec-guardian`: siga o passo 4 de `/implementar-spec` (veredito com evidência).
