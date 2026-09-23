---
adr-id: ADR-0008
titulo: Proveniência e integridade de skills por lockfile, com ingestão em quarentena
status: aceito
data: 2026-09-23
---

# ADR-0008: Supply chain de skills

## Contexto
Os packs vendorizados chegavam por cópia manual, sem hash, sem registro de versão/commit de origem e
com uma divergência de licença não percebida (`uiux-ui-styling`: MIT declarado × Apache-2.0 no
arquivo). A varredura da v3 também achou scripts do `uiux-design` que leem `.env` e chamam uma API
externa, sem que nada no kit sinalizasse isso.

## Decisão
1. `skills.lock.json` (motor) e `.sdd/skills.lock.json` (projeto), com schema: origem, ref, licença
   (+ notas), atribuição, hash sha256 do diretório (fim de linha normalizado), hash por skill, risco,
   scan estático e externo, confiança e data de revisão.
2. Scanner estático próprio (offline) sempre; Cisco skill-scanner opcional (`--external`), ausente =
   `NOT_RUN`.
3. Ingestão (`sdd skills add`) exige origem e licença, valida a spec, escaneia e coloca em quarentena;
   só `sdd skills review` libera. Achado de severidade error = `rejected`.
4. Ativação (`sdd pack activate`) confere hash e confiança; desativação move para `.sdd/backup/`.
5. Proveniência honesta: commits de origem não registrados no v2 ficam `ref: null`; revisão humana não
   registrada fica `reviewed_at: null`. Nada é inventado.
6. Doctor e CI verificam o lock; mudar skill sem atualizar o lock falha.

## Consequências
- Mantenedores rodam `sdd skills lock --update` depois de revisar mudanças em packs ou skills núcleo.
- `THIRD_PARTY.md` lista pendências de licença e risco que só a origem pode resolver.
