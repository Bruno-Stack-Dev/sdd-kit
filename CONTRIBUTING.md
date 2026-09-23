# Contribuindo com o SDD Kit

Obrigado por contribuir. Documentação, mensagens da CLI e skills são em **português**;
identificadores de código em inglês ou português, seguindo o arquivo ao redor.

## Ambiente

- Node.js **22+** para desenvolver (os testes usam o glob nativo do `node --test`); o runtime do kit
  exige só Node 20+.
- Python 3.12 + `pytest` apenas para os testes do pack `uiux`.
- Nenhum `npm install`: o core não tem dependências.

```bash
node scripts/sdd-lint.mjs            # lint de specs e skills
npm test                             # node --test "tests/**/*.test.mjs"
node scripts/sdd.mjs doctor --full   # saúde do motor
node scripts/sdd.mjs eval run        # evals determinísticas contra o baseline
python -m pytest .claude/skills -q   # pack uiux (opcional)
```

## Fluxo

1. Abra uma branch a partir da `main`.
2. Mudança estrutural (formato, schema, política, dependência, nova integração) → **ADR** em
   `docs/adr/` (modelo em [`ADR-0001`](docs/adr/ADR-0001-registrar-decisoes-do-kit.md)) e linha no
   índice.
3. Testes para todo comportamento novo; o CI roda tudo em Linux e Windows.
4. Entrada no [`CHANGELOG.md`](CHANGELOG.md) (seção "Não lançado" no topo, se ainda não houver
   release).
5. Commits no estilo *Conventional Commits* (`feat(escopo): ...`, `fix(...)`, `docs(...)`).

## Política de dependências

- **Core sem dependências de runtime.** Nada de `dependencies` no `package.json`. Precisa de um
  parser, validador ou utilitário? Escreva o subconjunto necessário, com testes (ex.: ADR-0002).
- **Ferramentas externas são opcionais**, com **versão exata** fixada no código
  (`npx pacote@x.y.z`, `uvx pacote@x.y.z`), executadas só com consentimento explícito quando
  baixam código ou enviam dados, e com resultado `NOT_RUN` quando ausentes — nunca `PASS`.
- **Frameworks de IA não entram no core** (frameworks de agentes, memória, RAG, serving, guardrails,
  observabilidade de LLM). O pack `ai` ensina a avaliá-los; quem adota é o projeto, com ADR.
- **Actions do CI fixadas por SHA**, com a tag em comentário; atualização via Dependabot.
- Nova dependência de qualquer tipo = ADR com alternativas, licença, manutenção e superfície de
  ataque; registre versão e data em
  [`docs/references/integrations-snapshot.md`](docs/references/integrations-snapshot.md).
- Sem telemetria oculta. Qualquer saída de dados é explícita, documentada e desligada por padrão.

## Adicionar ou alterar uma skill

- **Núcleo** (`.claude/skills/<nome>/`): frontmatter só com campos da spec Agent Skills mais as
  extensões documentadas do Claude Code; `metadata.sdd-core: "true"`; `evals/evals.json`;
  `disable-model-invocation: true` se tiver efeito colateral; valores com `: ` entre aspas.
  Depois:

  ```bash
  node scripts/sdd.mjs skills lock --update     # após revisar o diff
  node scripts/sdd.mjs eval export-promptfoo    # regenera evals/promptfoo/generated-tests.yaml
  node scripts/sdd.mjs doctor --skills
  ```

- **Pack** (`.claude/skills/_packs/<pack>/`): mesmas regras; `ATTRIBUTION` e `LICENSE` no pack;
  entrada no `skills.lock.json` com origem, licença e confiança; manifesto
  `.claude-plugin/plugin.json` e entrada no marketplace.
- **Externa**: nunca copie direto. Use `sdd skills add <dir> --source <url> --license <SPDX>` (entra
  em quarentena) e `sdd skills review <nome> --trust reviewed` após revisão humana — ver
  [`docs/security/skills-supply-chain.md`](docs/security/skills-supply-chain.md).

## Adicionar um servidor MCP com segurança

1. Verifique origem, licença, manutenção e o que o servidor acessa (rede, arquivos, credenciais).
2. Adicione em `mcp/policies/allowlist.yaml` com versão exata, transporte, `network`,
   `data_egress` e credenciais só por variável de ambiente.
3. Inclua-o nos perfis que fizerem sentido (`mcp/profiles/*.json`).
4. Fixe o schema das ferramentas (`sdd mcp pin <servidor>`) — inspeção executa o servidor: faça em
   ambiente isolado.
5. `sdd doctor --mcp` e testes. Detalhes em [`docs/mcp/README.md`](docs/mcp/README.md).

## Evals

Casos determinísticos em `evals/deterministic/cases.json`. Ao adicionar casos ou mudar
comportamento intencionalmente: `node scripts/sdd.mjs eval run --update-baseline` e explique no PR.
Regressão contra o baseline falha o CI.

## Release (feito por humano)

1. Versão igual em `scripts/lib/engine.mjs` (`ENGINE_VERSION`), `package.json`,
   `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` e
   `.claude/skills/_packs/*/.claude-plugin/plugin.json` — o doctor falha se divergirem.
2. `CHANGELOG.md` com a data; `node scripts/sdd.mjs eval run --update-baseline` se a versão mudou.
3. `npm test`, `node scripts/sdd.mjs doctor --full`, `node scripts/sdd.mjs skills verify`.
4. Tag `vX.Y.Z` e release criados manualmente pelo mantenedor. Nenhum workflow publica ou faz push.
