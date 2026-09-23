---
adr-id: ADR-0015
titulo: Packs opcionais também distribuídos como plugins do marketplace do kit
status: aceito
data: 2026-09-23
---

# ADR-0015: Packs como plugins

## Decisão
Cada pack (`arch`, `ds`, `uiux`, e o `ai` da Fase 17) ganha `.claude-plugin/plugin.json` com
`skills: "./"` no próprio diretório e entra no `marketplace.json` como plugin opcional
(`sdd-architecture`, `sdd-design-system`, `sdd-uiux`, `sdd-ai`). A ativação por cópia
(`sdd pack activate`, verificada contra o lock) continua. O manifesto do plugin fica fora do hash do
lock e nunca é copiado na ativação. `sdd-security`/`sdd-devops` não foram criados: sem conteúdo real,
seriam abstração sem uso.

## Consequências
O core funciona sem nenhum pack; o doctor valida os manifestos e avisa pack ativo em dobro.
