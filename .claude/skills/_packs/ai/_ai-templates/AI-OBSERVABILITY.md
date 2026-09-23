# Observabilidade de IA — <PROJETO>

> Artefato do pack `ai` (SDD Kit). Gere só se necessário (ver skill `ai-discovery`).
> Toda afirmação sobre ferramenta/modelo traz **fonte, versão e data da consulta**; o que não foi
> verificado fica `NÃO VERIFICADO`. Campos indefinidos ficam `<TODO>`.

| Campo | Valor |
|-------|-------|
| Status | rascunho \| revisado \| aceito |
| Atualizado em | <AAAA-MM-DD> |
| Specs relacionadas | <IDs> |
| ADRs relacionados | <ADR-NNN> |

## Atributos por requisição
modelo/versão, tokens, custo, latência (TTFT e total), validação, ferramentas, passos, IDs
recuperados, gate, erro — correlacionados ao trace da aplicação.

## Instrumentação
OpenTelemetry (convenções GenAI, versão: <TODO>) · backend: <TODO>

## Conteúdo de prompts e respostas
não registrar | redigido (padrão) | integral com acesso restrito — retenção: <TODO>

## Alertas
| Sinal | Limite | Destino |
|-------|--------|---------|
| Custo | | |
| Erro/validação inválida | | |
| Latência p95 | | |

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
