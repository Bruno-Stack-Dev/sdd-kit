# Evals do SDD Kit

Qualidade medida, não sentida. Duas suítes com custos diferentes:

| Suíte | O que mede | Custo | Quando roda |
|-------|-----------|-------|-------------|
| **Determinística** (`evals/deterministic/cases.json`) | comportamento do motor sobre fixtures: classificação, decomposição, gates, política, drift, retomada | zero (sem modelo, sem rede) | todo PR (CI) |
| **Com modelo** (`evals/promptfoo/`) | se skills e agentes seguem as regras quando o prompt os tenta a pular | tokens | manual, noturno ou release |

```bash
node scripts/sdd.mjs eval run                         # determinística + comparação com o baseline
node scripts/sdd.mjs eval run --filter guardian-recall
node scripts/sdd.mjs eval run --update-baseline       # depois de mudança intencional, revisada
node scripts/sdd.mjs eval run --suite model           # Promptfoo (ANTHROPIC_API_KEY; senão NOT_RUN)
node scripts/sdd.mjs eval export-promptfoo            # regenera generated-tests.yaml
```

## Métricas (determinística)

| Categoria | Como é medida |
|-----------|---------------|
| discovery-accuracy | linguagens e plugin LSP corretos por fixture |
| brownfield-classification | `project classify` acerta novo × existente |
| task-decomposition | `spec new` gera uma tarefa por etapa da pipeline certa (API, CLI, frontend) |
| agent-selection | agente de cada etapa; agente inexistente detectado |
| skill-activation | skills núcleo com evals; pack ativado só com hash conferido |
| spec-compliance | doctor reprova o projeto quebrado e aprova o saudável |
| guardian-recall | `SPEC_IMPLEMENTED` sem aprovação, aprovação sem evidência e `implementada` sem trilha são recusados |
| forbidden-action-rejection | força-push, leitura de `.env`, `curl \| sh`, `rm` aninhado, auditor escrevendo — e comando legítimo liberado |
| ca-coverage | `cas:` × CAs no corpo |
| orphan-detection | plano órfão, dependência inexistente, ciclo |
| drift-detection | visão da config desatualizada, MCP `@latest`, checkbox × estado |
| security-policy-compliance | segredo e `.env` detectados, dívida conhecida aceita, regressão reprovada, escrita em produção negada |
| resumability | retomada após interrupção e log truncado detectado |

## Baseline e regressão

`evals/baseline/deterministic.json` guarda o resultado de cada caso na versão registrada. O
`eval run` compara e **falha** quando um caso que passava passa a falhar. O baseline só muda com
`--update-baseline`, num commit revisado.

**v2 × v3:** o v2 não tinha CLI nem estado estruturado, então nenhum desses casos era executável
contra ele; por inspeção, só a checagem de placeholders da config (parte de `spec-compliance`) tinha
equivalente determinístico no v2. O baseline começa no 3.0.0.

## Suíte com modelo

`generated-tests.yaml` é gerado das evals de cada skill (`.claude/skills/*/evals/evals.json`) e dos
casos por agente (`evals/agents/agents.json`), com `llm-rubric` montado de `expected_output` +
`expectations`. Resultados ficam em `evals/results/` (não versionado). Compare execuções pelo
Promptfoo (`promptfoo view`) ou pelos JSONs.

## Fixtures

`tests/fixtures/` — projetos sintéticos pequenos, sem código proprietário (ver o README de lá).
Segredos de teste nunca são versionados: os casos os montam por concatenação em `overlay`.
