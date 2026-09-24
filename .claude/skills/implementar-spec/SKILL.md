---
name: implementar-spec
description: Implementa uma spec de ponta a ponta seguindo as etapas da pipeline declarada na config, uma tarefa por vez pelo agente responsável, registrando o ciclo de vida no estado, até testes verdes, padrões proibidos no esperado e aprovação do guardião com evidência. Use quando o usuário pedir para implementar/entregar uma spec pelo ID, ou rodar /implementar-spec.
disable-model-invocation: true
argument-hint: "<SPEC-ID>"
license: MIT
metadata:
  sdd-core: "true"
  sdd-version: "3.0.0"
---

# /implementar-spec <SPEC-ID>

**`sdd`** = `node "${CLAUDE_SKILL_DIR}/../../../scripts/sdd.mjs"`

Se `$ARGUMENTS` estiver vazio, **peça o ID** — não adivinhe.

1. Localize a spec `$ARGUMENTS` (`sdd tasks list --json` filtra por spec). Sem tarefas no estado →
   `sdd tasks sync`. Grafo inválido → pare e mostre o erro.
2. Repita até não haver tarefas pendentes da spec:
   1. `sdd tasks ready` → escolha a próxima tarefa **desta spec**. Se o plano tiver ramos
      paralelos, `sdd tasks wave --spec <SPEC> --json` devolve as que podem rodar juntas; nesse
      caso siga o ciclo de onda do Passo 5 do GERADOR (`/gerar-projeto`).
   2. `sdd models resolve --task <SPEC>/T-NNN --json` → `model` e `effort` que o kit escolheu
      para o papel do agente (etapa da config > `agents.models` > política; sinais como reprovação
      no guardião sobem o nível). Não escolha o modelo por conta própria.
   3. `sdd event TASK_STARTED --task <SPEC>/T-NNN --agent <agente> --model <model> --effort <effort>`.
   4. Delegue ao `@agente` da tarefa **passando o `model` resolvido** na chamada do subagente, com a
      spec, o plano e a config. O agente segue as regras da config (seções 6–9) e o próprio
      contrato de saída.
   5. Rode `commands.test` (e `commands.e2e` quando a etapa for e2e); registre
      `sdd event TEST_PASSED|TEST_FAILED --spec <SPEC> --command "<cmd>"`.
   6. Verde → `sdd event TASK_COMPLETED --task ...`; travou → `TASK_BLOCKED --reason "..."` e pare.
3. `sdd check forbidden` — contagens no esperado.
4. Guardião: `sdd event GUARDIAN_STARTED --spec <SPEC>`; `@agente-spec-guardian` (no modelo de
   `sdd models resolve --task <tarefa do guardião>`, sempre no nível mais alto) devolve o relatório
   (CA → evidência de implementação, teste positivo, teste negativo quando houver regra crítica);
   então `GUARDIAN_APPROVED --evidence <relatório>` ou `GUARDIAN_REJECTED --reason "..."` (volte ao 2).
5. `sdd event SPEC_IMPLEMENTED --spec <SPEC>` (a CLI recusa sem aprovação/testes/tarefas fechadas),
   `status: implementada` no frontmatter, `sdd tasks sync`, `sdd state ledger`.

Saída: tarefas concluídas por agente, testes, resultado dos padrões proibidos, veredito e evidência.
