---
doc-id: AUDITORIA-DIVERGENCIAS
titulo: Relatório de Divergências e Lacunas — <Nome>
versao: 0.1.0
status: rascunho
atualizado-em: AAAA-MM-DD
tags: [discovery, auditoria, engenharia-reversa, divergencias]
---

# Relatório de Divergências e Lacunas — <Nome>

> Gerado pela **engenharia reversa** (`specs/_gerador/AUDITORIA.md`) num projeto existente.
> Mapa do que a documentação ainda não fecha. **Regra:** o código prevalece sobre a fala do
> usuário; aqui só se registra, para revisão humana — não se decide.

## 🔀 Divergências (código × usuário)
| # | Tema | Usuário afirmou | Código mostra | Resolução |
|---|------|-----------------|---------------|-----------|
| 1 | <ex.: estilo de API> | REST | GraphQL (schema em `src/graphql`) | código prevalece — revisar |

## 🕳️ Lacunas (`<TODO>` a resolver)
| # | Onde | O que falta | Quem responde |
|---|------|-------------|---------------|
| 1 | `VISAO.md` | personas | produto |

## 🧾 Dívidas conhecidas (greps de padrões proibidos com contagem > 0)
| Padrão | Escopo | Ocorrências hoje | Nota |
|--------|--------|------------------|------|
| <ex.: `Date\.now\(\)`> | `src/` | <N> | pré-existente; não bloqueia adoção |

## 📅 Histórico
| Data | Versão | Mudança |
|------|--------|---------|
| AAAA-MM-DD | 0.1.0 | Auditoria inicial |
