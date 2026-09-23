---
adr-id: ADR-0007
titulo: Workflows do kit como Agent Skills, com comandos v2 como aliases
status: aceito
data: 2026-09-23
---

# ADR-0007: Workflows como Agent Skills

## Contexto
Os oito workflows do v2 eram comandos em `.claude/commands/` com o procedimento inteiro (o
`sdd-init` tinha 109 linhas), sem evals, sem controle de quem invoca e sem progressive disclosure.
Os motores em prosa (`GERADOR`, `DISCOVERY`, `AUDITORIA`) ficavam em `specs/_gerador/`, que não
existe num projeto em modo plugin.

## Decisão
1. Cada workflow vira `.claude/skills/<nome>/` (spec Agent Skills): `SKILL.md` curto com passos,
   contrato de saída e falhas; detalhes em `references/`; `evals/evals.json` (formato skill-creator).
2. Os motores em prosa passam a ser `references/` das skills (`gerar-projeto/references/GERADOR.md`,
   `sdd-init/references/{DISCOVERY,AUDITORIA,FECHAMENTO}.md`); os caminhos antigos viram stubs.
3. Workflows com efeito colateral usam `disable-model-invocation: true`.
4. A CLI é chamada por `node "${CLAUDE_SKILL_DIR}/../../../scripts/sdd.mjs"` — substituição documentada
   no conteúdo do SKILL.md, válida em skills de projeto e de plugin. As referências usam só `sdd`.
5. `.claude/commands/<nome>.md` vira alias fino (a skill de mesmo nome tem precedência, conforme a
   documentação). Remoção na 4.0.0.
6. Templates chegam por `sdd template show <nome>` e specs por `sdd spec new`, que gera plano e tarefas
   a partir da pipeline da config.
7. O doctor passa a checar frontmatter "YAML válido em parsers padrão": a migração revelou que o
   `/sdd-init` do v2 e as 14 skills do pack `arch` tinham `: ` sem aspas na descrição, o que fazia o
   Claude Code descartar o frontmatter.

## Consequências
- `/nome` continua funcionando (skill no modo cópia; `/sdd-kit:nome` ou `/nome` no modo plugin).
- Skills núcleo são identificadas por `metadata.sdd-core: "true"` e precisam de evals (doctor).
