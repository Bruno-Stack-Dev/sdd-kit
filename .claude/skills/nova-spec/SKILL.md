---
name: nova-spec
description: Cria uma spec avulsa com ID calculado pela CLI a partir da numeração da config, mais o plano e as tarefas correspondentes geradas pelas pipelines da config, e registra tudo no estado. Use quando o usuário quiser especificar uma funcionalidade ou incremento fora de um brief completo, ou rodar /nova-spec.
disable-model-invocation: true
argument-hint: "<slug> [título]"
license: MIT
metadata:
  sdd-core: "true"
  sdd-version: "3.0.0"
---

# /nova-spec — spec avulsa

**`sdd`** = `node "${CLAUDE_SKILL_DIR}/../../../scripts/sdd.mjs"`

1. Entenda o pedido; se faltar objetivo, papéis, regras críticas ou critérios de aceitação, pergunte
   **uma vez** listando só os gaps.
2. Gere os arquivos: `sdd spec new --slug <slug> --title "<título>" [--pipeline <nome>]`
   (argumentos em `$ARGUMENTS`). A CLI calcula o ID (`numbering` da config), cria
   `features/`, `plans/` e `tasks/` com uma tarefa por etapa da pipeline e registra os eventos.
3. Preencha a spec: objetivos, não-objetivos, RF/RNF, modelo de dados, **CAs numerados**
   (`- **CA-01**: ...`), gates e dados sensíveis (config seções 8 e 10). Mantenha `cas:` igual ao
   número de CAs — o hook de edição recusa a divergência fora de rascunho.
4. Decisão transversal nova → ADR em `specs/decisions/` (`sdd template show adr`).
5. `sdd doctor --fast` sem falhas.

Saída: caminhos criados, ID, número de CAs e tarefas por agente.
