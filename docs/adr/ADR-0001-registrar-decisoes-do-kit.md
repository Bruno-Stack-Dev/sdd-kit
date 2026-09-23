---
adr-id: ADR-0001
titulo: Registrar decisões arquiteturais do kit em docs/adr/
status: aceito
data: 2026-09-23
---

# ADR-0001: Registrar decisões arquiteturais do kit em `docs/adr/`

## Contexto
A evolução v2 → v3 toma decisões estruturais (formato de config, estado, hooks, plugin). O kit já
tem `specs/decisions/`, mas essa pasta é **copiada para os projetos consumidores** e pertence a eles:
escrever ali os ADRs do kit poluiria cada projeto instalado.

## Decisão
ADRs do kit vivem em `docs/adr/ADR-NNNN-<slug>.md` (4 dígitos, para não colidir visualmente com os
`ADR-NNN` dos projetos). `docs/` não faz parte do conjunto copiado para projetos.

## Alternativas
- **`specs/decisions/` do próprio repo** — rejeitada: vazaria para os consumidores.
- **Só `CHANGELOG.md`** — rejeitada: registra o quê, não o porquê nem as alternativas.

## Consequências
- Toda mudança estrutural da v3 referencia um ADR daqui.
- O doctor valida estes ADRs com as mesmas regras de frontmatter aplicadas aos ADRs de projeto.
