# Recuperação de conhecimento (RAG) — <PROJETO>

> Artefato do pack `ai` (SDD Kit). Gere só se necessário (ver skill `ai-discovery`).
> Toda afirmação sobre ferramenta/modelo traz **fonte, versão e data da consulta**; o que não foi
> verificado fica `NÃO VERIFICADO`. Campos indefinidos ficam `<TODO>`.

| Campo | Valor |
|-------|-------|
| Status | rascunho \| revisado \| aceito |
| Atualizado em | <AAAA-MM-DD> |
| Specs relacionadas | <IDs> |
| ADRs relacionados | <ADR-NNN> |

## Por que RAG
<corpus grande/mutável/com permissões — ou por que não basta o contexto do modelo>

## Fontes e ingestão
| Fonte | Formato | Atualização | Remoção propaga? | Permissão |
|-------|---------|-------------|------------------|-----------|

## Permissões
Filtro aplicado na busca por: <usuário/tenant/perfil>

## Chunking e metadados
Estratégia: <TODO> · metadados por chunk: fonte, data, permissão, versão

## Embeddings
Modelo: <TODO> · dimensão: <TODO> · plano de re-embedding: <TODO>

## Busca
vetorial | híbrida | grafo — top-k: <N> · reranking: <TODO> · citação de fontes: sim

## Armazenamento
<TODO — comparar com o banco já operado pelo projeto>

## Avaliação
Recuperação (recall@k, MRR): <TODO> · geração (fidelidade, recusa): <TODO> — casos em `AI-EVALS.md`

## Alternativas avaliadas

Inclua sempre a opção mínima (SDK oficial + código próprio / não adotar).

| Critério (peso) | Opção mínima | Candidato A | Candidato B |
|-----------------|--------------|-------------|-------------|
| <critério> (<peso>) | <nota + evidência> | | |

**Decisão:** <TODO> · **Gatilhos de reavaliação:** <TODO>

## Evidências consultadas

| Fonte (link) | Versão | Consultado em | O que confirma |
|--------------|--------|---------------|----------------|
| <TODO> | <TODO> | <AAAA-MM-DD> | <TODO> |
