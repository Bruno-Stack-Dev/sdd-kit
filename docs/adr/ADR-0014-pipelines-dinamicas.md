---
adr-id: ADR-0014
titulo: Pipelines vêm da config; templates e motor não fixam camadas de stack
status: aceito
data: 2026-09-23
---

# ADR-0014: Pipelines dinâmicas

## Contexto
O v2 tinha três "pipelines" implícitas nas seções 5/5-B/5-C e templates de plano/tarefas que
codificavam Contratos → Mocks → Store → UI. Uma CLI Go ou um ETL herdavam camadas de frontend.

## Decisão
1. `pipelines` da config é um mapa nome → etapas (`id`, `name`, `agent`, `output`, `when`,
   `guardian`); qualquer número de pipelines com qualquer nome.
2. `sdd spec new --pipeline <nome>` gera plano (uma fase por etapa) e tarefas (uma por etapa,
   encadeadas, com o agente da etapa). Os templates estáticos mostram só a forma.
3. O motor (GERADOR) escolhe a pipeline por spec; entregas que cruzam camadas viram specs separadas
   ligadas por `depende-de`.
4. Exemplos versionados para API, frontend, CLI e dados em `docs/examples/pipelines/`, validados
   pelo schema num teste; evals determinísticas cobrem decomposição para stacks diferentes.

## Consequências
- Reordenar etapas é mudar a config, não o plano à mão.
- Configs v2 migradas ganham `frontend`/`backend`/`delivery` a partir das seções 5/5-B/5-C.
