# Estratégia de modelos — <PROJETO>

> Artefato do pack `ai` (SDD Kit). Gere só se necessário (ver skill `ai-discovery`).
> Toda afirmação sobre ferramenta/modelo traz **fonte, versão e data da consulta**; o que não foi
> verificado fica `NÃO VERIFICADO`. Campos indefinidos ficam `<TODO>`.

| Campo | Valor |
|-------|-------|
| Status | rascunho \| revisado \| aceito |
| Atualizado em | <AAAA-MM-DD> |
| Specs relacionadas | <IDs> |
| ADRs relacionados | <ADR-NNN> |

## Requisitos por tarefa
| Tarefa | Tipo | Volume | Latência p95 | Contexto | Dados podem sair? | Risco |
|--------|------|--------|--------------|----------|-------------------|-------|

## Onde roda
API de provedor | nuvem gerenciada | self-hosted | híbrido — justificativa: <TODO>

## Modelos escolhidos
| Tarefa | Modelo (versão fixada) | Onde roda | Resultado na eval | Custo estimado |
|--------|------------------------|-----------|-------------------|----------------|

## Roteamento e fallback
- Regra de roteamento: <TODO>
- Fallback (avaliado e compatível com a restrição de dados): <TODO>

## Custo
Orçamento por requisição: <TODO> · mensal: <TODO> · alertas: <TODO>

## Serving próprio (se aplicável)
Hardware: <TODO> · servidor: <TODO> · quantização: <TODO> · benchmark: <TODO> · licença do modelo: <TODO>

## Processo de troca de modelo
Rodar a suíte de `AI-EVALS.md`; promover só sem regressão acima da tolerância.

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
