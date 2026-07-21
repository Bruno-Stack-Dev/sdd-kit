# /sdd-status

Dashboard do estado do SDD: derivado do frontmatter das specs, não do que está escrito à mão
no `CLAUDE.md`.

Passos:
1. Varra `specs/features/**`, `specs/architecture/**` e `specs/apis/**`.
2. Para cada spec, leia o frontmatter: `spec-id`, `titulo`, `status`, `cas`, `depende-de`.
3. Cruze com `specs/tasks/**`: conte tarefas `[ ]`/`[~]`/`[x]` por spec.
4. Rode `node scripts/sdd-lint.mjs` e inclua eventuais avisos (CAs faltando, status incoerente).
5. Se existir um `specs/_gerador/LEDGER-*.md`, mostre a ordem de execução e o que está `pendente`.
6. Imprima uma tabela:

   | Spec | Título | Status | CAs | Tarefas (x/total) | Pendência |
   |------|--------|--------|-----|-------------------|-----------|

7. Feche com: total de specs por status, próxima spec `pendente` no LEDGER, e alertas do linter.

Somente leitura: não edite nada. É um diagnóstico.
