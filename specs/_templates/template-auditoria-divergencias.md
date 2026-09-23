---
doc-id: AUDITORIA-DIVERGENCIAS
titulo: Relatório de Divergências e Lacunas — <Nome>
versao: 0.2.0
status: rascunho
atualizado-em: AAAA-MM-DD
tags: [discovery, auditoria, engenharia-reversa, divergencias]
---

# Relatório de Divergências e Lacunas — <Nome>

> Gerado pela **engenharia reversa** (auditoria do `/sdd-init`) num projeto existente. Separa três
> camadas — **OBSERVED** (o que o código/config faz), **INTENDED** (o que deveria fazer: spec, doc,
> ADR, confirmação do usuário) e **RUNTIME** (evidência de execução: teste rodado, log, requisição) —
> e classifica cada divergência. "O código existe" **não** significa "o código está certo".
> Validado por `sdd doctor --project`.

## Legenda

- **Proveniência** (de onde vem cada fato): `CODE` · `CONFIG` · `TEST` · `DOC` · `RUNTIME` ·
  `USER_CONFIRMED` · `INFERRED`.
- **Classificação:** `DOC_DRIFT` (doc desatualizada) · `SPEC_DRIFT` (spec × comportamento) ·
  `SECURITY_DRIFT` (controle de segurança diverge) · `RUNTIME_DRIFT` (execução contradiz o código/doc)
  · `CONFIG_DRIFT` (config × código) · `UNKNOWN`.
- **Resolução:** `pendente` · `corrigir-código` · `corrigir-doc` · `aceito-intencional (ADR-NNN)`.
- **Regra:** `SECURITY_DRIFT` (e divergência de comportamento crítico) **nunca** é reconciliada
  automaticamente: sair de `pendente` exige evidência de RUNTIME ou `USER_CONFIRMED`, e aceitar
  como intencional exige ADR.

## 🔀 Divergências

| ID | Tema | Intended | Observed | Runtime | Classificação | Proveniência | Resolução |
|----|------|----------|----------|---------|---------------|--------------|-----------|
| DIV-01 | <ex.: exclusão de usuário> | <ex.: só admin exclui (RBAC.md)> | <ex.: endpoint DELETE /users/:id sem checagem de papel (src/users/routes.ts:42)> | não verificada | SECURITY_DRIFT | CODE, DOC | pendente |

## 🕳️ Lacunas (`<TODO>` a resolver)

| # | Onde | O que falta | Quem responde |
|---|------|-------------|---------------|
| 1 | `VISAO.md` | personas | produto |

## 🧾 Dívidas conhecidas (padrões proibidos com contagem > 0)

| Padrão | Escopo | Ocorrências hoje | Nota |
|--------|--------|------------------|------|
| <ex.: `Date\.now\(\)`> | `src/` | <N> | registrado como `expected: N` na config; não pode crescer |

## 📅 Histórico

| Data | Versão | Mudança |
|------|--------|---------|
| AAAA-MM-DD | 0.1.0 | Auditoria inicial |
