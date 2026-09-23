---
name: ai-observability-governance
description: "Define observabilidade e governança de dados de uma aplicação de IA: traces por chamada de modelo, ferramenta e passo de agente (convenções OpenTelemetry para GenAI), custo e latência, redação de PII em logs, retenção de prompts e respostas, residência de dados, uso de dados pelo provedor, LGPD e trilha de auditoria — com ferramentas verificadas na documentação atual (ex.: Arize Phoenix, Langfuse, backends OTel). Acione quando pedirem: monitorar o LLM, custo de tokens, tracing de agentes, logs de prompt, LGPD com IA, residência de dados, auditoria de decisões do modelo."
license: MIT
metadata:
  sdd-pack: "ai"
  sdd-version: "3.0.0"
---

# ai-observability-governance

Método obrigatório: [AVALIACAO-DE-TECNOLOGIA.md](../_ai-references/AVALIACAO-DE-TECNOLOGIA.md).
Saídas: `specs/discovery/AI-OBSERVABILITY.md` e `AI-DATA-GOVERNANCE.md` (templates em
`../_ai-templates/`).

## Observabilidade

### 1. O que registrar

Por requisição: modelo e versão, tokens de entrada/saída, custo estimado, latência (incluindo
tempo até o primeiro token), resultado da validação de schema, ferramentas chamadas com duração e
resultado, passos do agente, documentos recuperados (IDs, não conteúdo), decisão de gate humano,
erro. Correlacione com o trace da aplicação (mesmo trace id).

### 2. Padrão aberto primeiro

Prefira instrumentação **OpenTelemetry** com as convenções semânticas de GenAI (verifique o estado
atual da especificação — parte dela ainda evolui). Assim o backend é substituível.
Backends a verificar: o de observabilidade que o projeto já usa, Arize Phoenix, Langfuse, outros
compatíveis com OTLP. A opção "backend já operado pelo time" entra sempre na comparação.

### 3. Conteúdo de prompts e respostas

É o dado mais sensível do trace. Decida explicitamente: não registrar; registrar redigido (PII e
segredos removidos); ou registrar integral com acesso restrito e retenção curta. Padrão seguro:
**redigido**, com amostragem.

### 4. Alertas

Custo por hora/dia acima do orçamento, taxa de erro/validação inválida, latência p95, recusas
anômalas, uso de ferramenta com efeito colateral fora do padrão, queda de métrica de eval online.

## Governança de dados

Responda e registre em `AI-DATA-GOVERNANCE.md`:

- **Inventário**: que dados entram em prompts, índices, memória, logs e datasets de eval.
- **Base legal e finalidade** (LGPD): consentimento/legítimo interesse, minimização, direitos do
  titular (acesso, correção, eliminação) — inclusive sobre memória e índices vetoriais.
- **Provedor**: retenção de dados pelo provedor, uso para treinamento, região de processamento,
  contrato/DPA. Verifique nos termos **atuais** e registre data e link.
- **Residência**: onde cada dado é processado e armazenado (modelo, embeddings, índice, traces,
  fallback). O fallback não pode violar a residência.
- **Retenção**: prazos para prompts, respostas, traces, memória e datasets; processo de eliminação.
- **Auditoria**: decisões relevantes do modelo (especialmente com efeito sobre pessoas) rastreáveis
  — entrada, versão do modelo e do prompt, saída, revisão humana.

## Qualidade

- Traces com custo, latência, ferramentas e versão do modelo; conteúdo redigido por padrão.
- Instrumentação em padrão aberto; backend escolhido com evidência datada.
- Inventário, base legal, residência e retenção definidos, incluindo provedor e fallback.
