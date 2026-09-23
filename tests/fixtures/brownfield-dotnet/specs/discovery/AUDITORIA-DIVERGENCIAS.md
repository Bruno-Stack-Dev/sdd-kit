---
doc-id: AUDITORIA-DIVERGENCIAS
titulo: Relatório de Divergências e Lacunas — Estoque
versao: 0.2.0
status: rascunho
atualizado-em: 2026-09-23
tags: [discovery, auditoria]
---

# Relatório de Divergências e Lacunas — Estoque

## 🔀 Divergências

| ID | Tema | Intended | Observed | Runtime | Classificação | Proveniência | Resolução |
|----|------|----------|----------|---------|---------------|--------------|-----------|
| DIV-01 | exclusão de produto | só gerente exclui (RBAC.md) | DELETE /produtos/{id} sem checagem de papel (src/ProdutosController.cs:1) | não verificada | SECURITY_DRIFT | CODE, DOC | pendente |
| DIV-02 | relógio | datas via IClock (ADR-002) | DateTime.Now direto (src/Relogio.cs:1) | não verificada | SPEC_DRIFT | CODE | corrigir-código |
| DIV-03 | README desatualizado | README cita SQL Server | Npgsql/PostgreSQL no código | não verificada | DOC_DRIFT | CODE, DOC | corrigir-doc |

## 🧾 Dívidas conhecidas

| Padrão | Escopo | Ocorrências hoje | Nota |
|--------|--------|------------------|------|
| `DateTime\.Now` | `src/` | 1 | `expected: 1` na config; não pode crescer |
