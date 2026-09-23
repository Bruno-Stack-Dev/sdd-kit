---
name: gerar-skills
description: Gera skills sob medida do projeto (domínio, integrações, infraestrutura concreta) a partir do discovery em specs/discovery/ e do sdd.config.yaml, no formato Agent Skills, sem inventar domínio. Use depois do /sdd-init, quando o usuário pedir skills do projeto, quando entrar um domínio ou integração novos, ou rodar /gerar-skills.
disable-model-invocation: true
license: MIT
metadata:
  sdd-core: "true"
  sdd-version: "3.0.0"
---

# /gerar-skills — skills sob medida

**`sdd`** = `node "${CLAUDE_SKILL_DIR}/../../../scripts/sdd.mjs"`

Aciona o `@agente-gerador-skills`. Pré-requisito: `specs/discovery/` preenchido.

1. O agente lê `specs/discovery/*` e a config e **propõe** candidatos por três lentes — domínio,
   integração, infraestrutura concreta — com nome, escopo e motivo. **Espere o usuário aprovar/cortar.**
2. Para cada skill aprovada, gera `.claude/skills/<slug>/SKILL.md` a partir do modelo
   [`../_template-skill.md`](../_template-skill.md):
   - frontmatter só com campos da spec Agent Skills (`name`, `description`, `license`, `metadata`);
     rastreabilidade em `metadata` (`gerada-de`, `atualizado-em`);
   - `description` na 3ª pessoa com gatilhos claros;
   - detalhes longos em `references/`.
3. Valide: `sdd doctor --skills` (spec Agent Skills, links, campos) — corrija até não haver falhas.

Regras: não inventa domínio (área em `<TODO>` no discovery fica de fora); não duplica o que pertence
à config (a skill descreve, a config governa); não gera skills de operação de design system (o pack
`ds` cobre).

Saída: skills criadas com seus gatilhos, áreas puladas e o resultado do doctor.
