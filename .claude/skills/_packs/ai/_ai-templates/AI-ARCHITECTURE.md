# Arquitetura de IA — <PROJETO>

> Artefato do pack `ai` (SDD Kit). Gere só se necessário (ver skill `ai-discovery`).
> Toda afirmação sobre ferramenta/modelo traz **fonte, versão e data da consulta**; o que não foi
> verificado fica `NÃO VERIFICADO`. Campos indefinidos ficam `<TODO>`.

| Campo | Valor |
|-------|-------|
| Status | rascunho \| revisado \| aceito |
| Atualizado em | <AAAA-MM-DD> |
| Specs relacionadas | <IDs> |
| ADRs relacionados | <ADR-NNN> |

## Problema e risco
- O que a IA faz no produto: <TODO>
- Risco se errar: informativo | sugestão revisada | efeito colateral | irreversível
- Por que não uma solução determinística: <TODO>

## Forma do sistema (por capacidade)
| Capacidade | Forma (chamada única / workflow / agente / multiagente) | Justificativa para o nível |
|------------|----------------------------------------------------------|----------------------------|
| <TODO> | <TODO> | <TODO> |

## Componentes e fluxo
<diagrama ou lista: entrada → orquestração → modelo(s) → ferramentas → saída>

## Ferramentas do modelo
| Ferramenta | Efeito colateral? | Escopo/credencial | Gate |
|------------|-------------------|-------------------|------|
| <TODO> | sim/não | <TODO> | humano / política / nenhum |

## Protocolos
| Protocolo (MCP, A2A, AG-UI, ACP…) | Versão da especificação | Uso | Limite de confiança |
|-----------------------------------|-------------------------|-----|---------------------|

## Saídas estruturadas
| Saída | Schema (caminho) | Mecanismo | Validação no código |
|-------|------------------|-----------|---------------------|

## Orçamento por execução
Máx. passos: <N> · máx. tokens: <N> · timeout: <s>

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
