---
description: Gera skills sob medida do projeto (domínio, integração, banco) a partir do discovery.
---

# /gerar-skills

Gera **skills sob medida** para este projeto, a partir do que o discovery já sabe. Aciona o
`@agente-gerador-skills`. Rode depois que `specs/discovery/` estiver preenchido (via `/sdd-init`).

## O que faz

1. **Lê o discovery inteiro** (`specs/discovery/*`) e o `sdd.config.md`.
2. **Propõe candidatos a skill** por três lentes e apresenta a lista para você aprovar/cortar:
   - **Domínio:** grupos coesos de entidades + regras (ex., num e-commerce: `cadastro-produtos`).
   - **Integração:** sistemas externos/capacidades transversais (ex.: `marketplace`, `pagamentos`).
   - **Infra concreta:** a tecnologia já decidida (ex.: o banco específico do projeto).
3. **Para cada skill aprovada**, gera `.claude/skills/<slug>/SKILL.md` a partir de
   `.claude/skills/_template-skill.md`, extraindo a perícia real do recorte (entidades,
   invariantes, gates, armadilhas) — com `gerada-de:` para rastreabilidade.
4. **Resumo final:** skills criadas, gatilhos de cada uma e áreas puladas por estarem em `<TODO>`.

## Regras

- Não inventa domínio: se o discovery não afirma, não presume. Áreas incompletas ficam de fora.
- Não hardcoda stack/domínio no kit — o resultado vive em `.claude/skills/` do **projeto**.
- Skill descreve; a config governa. Nada que pertença ao `sdd.config.md` é duplicado na skill.

## Sem o slash command

O motor é o agente (markdown). Se preferir, peça no chat: "aja como `@agente-gerador-skills`:
leia o discovery e proponha as skills deste projeto."
