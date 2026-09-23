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
