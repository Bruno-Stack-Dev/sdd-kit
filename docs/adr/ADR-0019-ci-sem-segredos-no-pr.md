---
adr-id: ADR-0019
titulo: CI determinístico sem segredos no PR; modelo e scanners só em workflows manuais/noturnos
status: aceito
data: 2026-09-23
---

# ADR-0019: Política de CI

## Decisão
- `ci.yml` roda em `pull_request` e em `push` **só na main** (sem execução dupla em branches de
  PR), com `permissions: contents: read`, `persist-credentials: false`, concorrência por ref e
  nenhum segredo. Jobs: lint, `doctor --full`, `doctor --security`, `skills verify`, sincronia dos
  testes do Promptfoo e da visão da config de exemplo, evals determinísticas contra o baseline,
  `node --test` em Linux e Windows, instalação em modo cópia no **Node 20** (runtime mínimo) e
  pytest do pack `uiux`.
- `evals.yml` (noturno + manual) é o único com `ANTHROPIC_API_KEY`; instala o Claude Agent SDK
  fixado só ali; sem o segredo a suíte termina `NOT_RUN`.
- `agent-scan.yml` só manual, com input de consentimento obrigatório e `SNYK_TOKEN`, em runner
  descartável.
- Toda action fixada por SHA (tag em comentário); ferramentas instaladas no CI com versão exata;
  Dependabot propõe atualizações de SHA por PR revisável.
- Nenhum workflow faz push, publica pacote ou cria release: publicar é ação humana.
- Um teste (`tests/unit/ci-workflows.test.mjs`) impede regressões nessas regras.

## Consequências
PRs de forks rodam o CI completo sem expor segredos; o custo de tokens fica fora do caminho do PR.
