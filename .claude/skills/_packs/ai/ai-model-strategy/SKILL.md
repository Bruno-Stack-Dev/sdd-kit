---
name: ai-model-strategy
description: "Define a estratégia de modelos de uma aplicação de IA: provedor em nuvem × modelo local/self-hosted × híbrido, seleção por tarefa, roteamento e fallback, orçamento de custo e latência, e serving próprio (ex.: vLLM, SGLang, llama.cpp) quando justificado — com critérios, documentação atual verificada e ADR. Acione quando pedirem: qual modelo usar, rodar modelo local, reduzir custo de tokens, fallback entre provedores, servir modelo open-weights, GPU ou quantização. Não acione para arquitetura de agentes (ai-architecture-evaluator)."
license: MIT
metadata:
  sdd-pack: "ai"
  sdd-version: "3.0.0"
---

# ai-model-strategy

Método obrigatório: [AVALIACAO-DE-TECNOLOGIA.md](../_ai-references/AVALIACAO-DE-TECNOLOGIA.md).
Saída: `specs/discovery/AI-MODEL-STRATEGY.md` (← `../_ai-templates/AI-MODEL-STRATEGY.md`) + ADR.

## Passo 1 — Requisitos por tarefa

Para cada tarefa de IA (da `AI-ARCHITECTURE.md`), registre: tipo (raciocínio, extração,
classificação, geração longa, código, visão, embeddings), volume esperado, latência aceitável
(p50/p95), janela de contexto necessária, idioma, restrição de dados (pode sair do ambiente?),
risco de erro. **Modelos diferentes por tarefa** é normal e costuma reduzir custo.

## Passo 2 — Onde o modelo roda

| Opção | Favorece | Custa |
|-------|----------|-------|
| API de provedor | qualidade de ponta, zero operação, escala | dados saem do ambiente; custo por token; dependência do provedor |
| Nuvem gerenciada do seu provedor de cloud | residência/contrato já existentes | catálogo e versões podem atrasar |
| Self-hosted (open-weights) | controle de dados, custo previsível em alto volume, offline | GPU, operação, atualização, qualidade a validar |
| Híbrido | dado sensível local, resto em API | duas pilhas para operar e avaliar |

Dado sensível ou residência obrigatória (bloco `ai:` / `AI-DATA-GOVERNANCE.md`) pesa mais que
preferência de qualidade.

## Passo 3 — Seleção de modelo

- Monte uma **lista curta** a partir da documentação atual dos provedores (preço, contexto,
  limites, política de retenção de dados, datas de descontinuação). Registre versão exata do
  modelo e data da consulta — nomes e preços mudam.
- Decida com **eval do próprio produto** (`ai-evals-designer`), não com leaderboard genérico.
  Mesmo conjunto de casos em todos os candidatos; métrica definida antes.
- Fixe a versão do modelo em configuração (nunca "latest" em produção) e defina o processo de
  troca: rodar a suíte de evals antes de promover um modelo novo.

## Passo 4 — Roteamento, fallback e custo

- Roteamento: tarefa simples → modelo menor; escala para modelo maior por regra verificável
  (tamanho, confiança, falha de validação) — não por "sensação".
- Fallback: outro modelo/provedor para indisponibilidade, **avaliado** com a mesma suíte; o
  fallback não pode violar a restrição de dados.
- Custo: orçamento por requisição e mensal, cache de prompt/respostas quando aplicável, limites
  de tokens de saída, alertas (ver `ai-observability-governance`).

## Passo 5 — Serving próprio (só se o Passo 2 escolheu self-hosted)

Exemplos de candidatos a verificar: vLLM, SGLang, llama.cpp, servidores de inferência de
fornecedores de hardware. Critérios específicos:

- hardware alvo (GPU de datacenter, GPU de consumo, CPU/Apple Silicon, edge);
- suporte aos modelos e à quantização desejada; throughput × latência no seu perfil de carga;
- API compatível com a usada pelo código (evita lock-in no cliente);
- structured output/constrained decoding nativo, se necessário;
- operação: imagens de container, métricas, atualização de segurança, licença do modelo
  (open-weights ≠ open source: confira termos de uso comercial).

Faça benchmark com a carga do produto antes de decidir; registre hardware, versão e resultado.

## Qualidade

- Cada tarefa tem modelo, onde roda, versão fixada e justificativa com evidência datada.
- Restrição de dados respeitada inclusive no fallback.
- Troca de modelo condicionada a evals; orçamento e alertas definidos.
