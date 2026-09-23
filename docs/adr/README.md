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
