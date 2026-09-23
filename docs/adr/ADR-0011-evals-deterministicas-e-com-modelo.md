---
adr-id: ADR-0011
titulo: Evals em duas suítes — determinística em todo PR, com modelo fora do caminho crítico
status: aceito
data: 2026-09-23
---

# ADR-0011: Evals determinísticas e com modelo

## Contexto
A qualidade do kit era avaliada por impressão. Mudanças em regras, templates ou prompts podiam
regredir comportamento sem nada acusar.

## Decisão
1. **Determinística** (`evals/deterministic/cases.json`): fixtures sintéticas + CLI, expectativas sobre
   a saída JSON, 13 categorias (descoberta, classificação, decomposição, seleção de agente, ativação de
   skill, conformidade, recall do guardião, rejeição de ação proibida, cobertura de CA, órfãos, drift,
   política de segurança, retomada). Roda em todo PR; baseline versionado; regressão = falha.
2. **Com modelo** (`evals/promptfoo/`): Promptfoo com o provider do Claude Agent SDK em modo somente
   leitura, testes gerados das evals das skills e dos agentes (`llm-rubric`). Roda só manual/noturno/
   release; sem `ANTHROPIC_API_KEY` = `NOT_RUN`.
3. Classificação greenfield × brownfield passou a ser determinística (`sdd project classify`) — é
   métrica de eval e reduz adivinhação no `/sdd-init`.
4. Segredos de teste nunca versionados: overlays os montam por concatenação.

## Consequências
- Mudança intencional de comportamento exige `eval run --update-baseline` num commit revisado.
- O custo de tokens fica fora do CI de PR.
