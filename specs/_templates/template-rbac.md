---
doc-id: RBAC
titulo: Modelo de Permissões (RBAC) — <Nome>
versao: 0.1.0
status: rascunho
atualizado-em: AAAA-MM-DD
tags: [discovery, rbac, seguranca]
---

# Modelo de Permissões (RBAC) — <Nome>

> Artefato de **discovery** (Bloco 3/segurança). Define papéis, recursos e a matriz de acesso.
> Cada regra de autorização aqui deve virar um teste (permitir/negar) nas specs correspondentes.

## Papéis
| Papel | Descrição | Herda de |
|-------|-----------|----------|
| <ex.: admin> | <acesso total> | — |
| <ex.: bibliotecário> | <opera acervo> | — |
| <ex.: leitor> | <somente leitura> | — |

## Recursos e ações
| Recurso | Ações possíveis |
|---------|-----------------|
| <ex.: Livro> | criar, ler, editar, excluir |
| <ex.: Empréstimo> | criar, ler, devolver |

## Matriz de acesso (papel × ação)
| Recurso.Ação | admin | bibliotecário | leitor |
|--------------|:-----:|:-------------:|:------:|
| Livro.criar | ✅ | ✅ | ❌ |
| Livro.ler | ✅ | ✅ | ✅ |
| Empréstimo.criar | ✅ | ✅ | ❌ |

## Regras especiais / escopo
- <ex.: leitor só vê o próprio histórico>
- <ex.: escopo multi-tenant por `unidadeId` em todo acesso>

## Gates de controle humano (cruzar com config seção 8)
> Onde uma sugestão automática/IA **nunca** decide sozinha, independentemente do papel.

## 📅 Histórico
| Data | Versão | Mudança |
|------|--------|---------|
| AAAA-MM-DD | 0.1.0 | Versão inicial (discovery) |
