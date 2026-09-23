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
