# /nova-spec

Cria uma nova spec avulsa a partir do template.

Passos:
1. Copie `specs/_templates/template-spec.md`.
2. Renomeie para `specs/features/<PREFIXO>NNN-<slug>.md` (prefixo e numeração: `sdd.config.md`
   seção 4; varra `specs/**` para não colidir).
3. Preencha frontmatter (incl. `cas:` com a contagem) e seções; numere os CAs.
4. Crie plano e tarefas correspondentes (`template-plano.md`, `template-tarefas.md`).
5. Nas tarefas, atribua cada item a um `@agente-*` e a uma camada da config (seção 5).
6. Rode `node scripts/sdd-lint.mjs` para validar o frontmatter.
