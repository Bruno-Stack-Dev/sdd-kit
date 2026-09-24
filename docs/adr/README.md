# ADRs do próprio SDD Kit

Decisões arquiteturais **do kit** (motor, CLI, formatos, segurança). Não confundir com
`specs/decisions/`, que é onde os **projetos consumidores** registram os ADRs deles.

- Numeração: `ADR-NNNN-<slug>.md`, sequencial, nunca reutilizada.
- Append-only: decisão mudou → ADR novo com `status: aceito` que declara `supera: ADR-NNNN`, e o
  antigo passa a `superado por ADR-NNNN` (única edição permitida no antigo).
- Formato: frontmatter `adr-id`, `titulo`, `status`, `data`; seções Contexto, Decisão,
  Alternativas, Consequências.

| ADR | Título | Status |
|-----|--------|--------|
| [0001](ADR-0001-registrar-decisoes-do-kit.md) | Registrar decisões do kit em `docs/adr/` | aceito |
| [0002](ADR-0002-parser-yaml-de-subconjunto.md) | Parser YAML de subconjunto próprio, sem dependência | aceito |
| [0003](ADR-0003-config-yaml-canonica.md) | `sdd.config.yaml` canônico; `sdd.config.md` gerado | aceito |
| [0004](ADR-0004-estado-por-eventos.md) | Estado por eventos; `state.json` e LEDGER derivados | aceito |
| [0005](ADR-0005-hooks-e-politica-deterministica.md) | Guardrails por hooks + política única + sandbox opcional | aceito |
| [0006](ADR-0006-plugin-e-modo-copia.md) | Motor como plugin do Claude Code, modo cópia mantido | aceito |
| [0007](ADR-0007-workflows-como-agent-skills.md) | Workflows como Agent Skills; comandos v2 como aliases | aceito |
| [0008](ADR-0008-supply-chain-de-skills.md) | Proveniência e integridade de skills por lockfile | aceito |
| [0009](ADR-0009-agentes-minimo-privilegio.md) | Agentes de mínimo privilégio, auditores somente leitura | aceito |
| [0010](ADR-0010-governanca-de-mcp.md) | MCP por allowlist, perfis e lock de schema | aceito |
| [0011](ADR-0011-evals-deterministicas-e-com-modelo.md) | Evals determinísticas em todo PR; com modelo fora do caminho crítico | aceito |
| [0012](ADR-0012-observabilidade-local-otel.md) | Trace local compatível com OTel; Phoenix opcional | aceito |
| [0013](ADR-0013-brownfield-observed-intended-runtime.md) | Brownfield OBSERVED × INTENDED × RUNTIME | aceito |
| [0014](ADR-0014-pipelines-dinamicas.md) | Pipelines vêm da config; templates não fixam stack | aceito |
| [0015](ADR-0015-packs-como-plugins.md) | Packs opcionais como plugins do marketplace | aceito |
| [0016](ADR-0016-pack-ai-por-criterios.md) | Pack ai por critérios e evidência atual; nenhum framework de IA no core | aceito |
| [0017](ADR-0017-adapters-cross-client.md) | Adapters para outros clientes: Agent Skills puro + AGENTS.md, sem simular garantias | aceito |
| [0018](ADR-0018-export-context-sanitizado.md) | Export de contexto embutido e sanitizado; Repomix opcional com consentimento | aceito |
| [0019](ADR-0019-ci-sem-segredos-no-pr.md) | CI determinístico sem segredos no PR; modelo e scanners em workflows manuais | aceito |
| [0020](ADR-0020-modelo-por-papel-do-agente.md) | O kit escolhe o modelo de cada agente pelo papel; overrides na config | aceito |
| [0021](ADR-0021-execucao-em-ondas.md) | Execução paralela em ondas: um agente por onda, guardião sozinho | aceito |
| [0022](ADR-0022-dashboard-local-snapshot-unico.md) | Dashboard local somente leitura: snapshot único, métricas determinísticas, TUI sem dependência | aceito |
| [0023](ADR-0023-trace-de-invocacoes-e-sanitizer-central.md) | Trace de invocações (`tool.called`), MCP/LSP observados e sanitizer central | aceito |
| [0024](ADR-0024-radar-de-ferramentas.md) | Radar de ferramentas por projeto: pesquisa na sessão principal, checagem determinística, só sugestão | aceito |
