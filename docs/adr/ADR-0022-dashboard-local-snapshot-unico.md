---
adr-id: ADR-0022
titulo: Dashboard local somente leitura — snapshot único, métricas determinísticas e TUI própria sem dependência
status: aceito
data: 2026-09-24
---

# ADR-0022: Dashboard local e `sdd status`

## Contexto
O andamento de um projeto SDD só era visível por arquivos e comandos separados (`state resume`,
`tasks list`, `trace show`, `doctor`) ou perguntando ao modelo — que devolvia uma estimativa
("estamos em 82%") sem origem. Faltava uma visão única, em tempo real, de quem está trabalhando,
em quê, por quê, com que permissões, e do que falta para entregar. Restrições do kit:
- **zero dependências de runtime** (CONTRIBUTING, doctor e teste de release falham com uma);
- o estado já tem autoridade única (`.sdd/events.jsonl`, ADR-0004) e há um trace local
  compatível com OTel (`.sdd/trace/`, ADR-0012) — não pode surgir um terceiro sistema de eventos;
- nenhuma métrica pode ser estimada por LLM.

## Decisão
1. **Um snapshot, vários consumidores.** `scripts/lib/dashboard/` monta um `DashboardSnapshot`
   (tipos em `types.mjs`) a partir de definições (config, specs, tarefas, agentes), do estado
   (reducer) e do índice de atividade (trace + eventos). `sdd status` (texto), `sdd status --json`
   (contrato `schemas/status.schema.json`, `schemaVersion 1`, mapeado explicitamente para não
   acoplar ao formato interno) e `sdd dashboard` (TUI) consomem o mesmo objeto. As telas não
   calculam métricas; a cadeia "WHY?" é derivada sob demanda por funções puras de domínio
   (`traceability.mjs`: `whyChain`, `testsForTask`) sobre o próprio snapshot, porque
   pré-calculá-la para cada tarefa, requisito e arquivo custaria mais do que exibi-la.
2. **Camadas separadas:** coleta (`sources.mjs`, `event-store.mjs`) → métricas (`metrics/*`,
   `traceability.mjs`) → agregação (`snapshot.mjs`) → apresentação (`format/*`, `tui/*`). A TUI
   não escreve nada: na demo, quem liga o simulador é o comando, que o injeta no loop.
3. **Métricas determinísticas com origem.** Toda métrica carrega `source`; indisponível é `null`
   (`n/d`), nunca estimado. Fórmulas documentadas em `docs/dashboard.md`: progresso ponderado por
   dimensão (pesos configuráveis, overall só com tarefas), requisitos verificados pelo guardião,
   Health Engine por regras e limiares (`dashboard.health`), autonomia por invocação observada,
   prontidão de entrega derivada dos gates. Contexto do modelo: `indisponível` — os hooks não o
   recebem.
4. **Rastreabilidade só por vínculo explícito** (requisito numerado na spec, ID citado no título da
   tarefa, `file.modified` correlacionado pelo hook, teste que cita spec + requisito, ADR citado).
   O resto é `UNKNOWN`.
5. **Incremental:** leitura dos logs por offset (tail), reducer incremental (`createReducer`, as
   mesmas regras do `reduce`), recarga de definições só quando arquivos mudam, scans de segurança só
   no startup e no refresh. `fs.watch` como gatilho, `stat` periódico como rede de segurança.
6. **TUI própria** (`tui/`): ANSI de 16 cores, tela alternativa, raw mode via
   `readline.emitKeypressEvents`, quadro inteiro por linha com "apagar até o fim da linha".
   O app é uma máquina de estado pura (`frame`/`handleKey`), testável sem TTY; `--once` imprime um
   quadro para CI, documentação e testes. Status sempre como símbolo + texto (+ cor); `--ascii` e
   `NO_COLOR` suportados.
7. **Somente leitura.** Nenhuma tecla ou comando altera o projeto (sem kill, forçar gate, editar
   política ou deploy). O único arquivo escrito é o log de diagnóstico opt-in
   (`--debug` → `.sdd/cache/dashboard.log`, sanitizado e limitado).
8. **Demo isolada.** `--demo` cria um projeto sintético num diretório temporário e grava pelos
   escritores reais (`appendEvent`, `traceEvent`); o snapshot sai `demo: true` e a UI mostra
   `DEMO DATA`. Os mesmos passos alimentam os testes de integração.

## Alternativas
- **Ink** (React para terminal): bom modelo de componentes, mas traz React, Yoga (layout) e uma
  árvore de dependências transitivas — viola o core zero-dependência e aumenta a superfície de
  supply chain de um kit cujo valor é governança.
- **blessed / neo-blessed**: widgets prontos (tabelas, scroll), porém `blessed` não tem release
  desde 2015 e o fork `neo-blessed` também parou; API imperativa difícil de testar sem TTY.
- **terminal-kit**: mantido, mas grande e com várias dependências próprias.
- **Dashboard web local**: mais rico visualmente, mas exige servidor, porta e navegador; fica como
  consumidor futuro do mesmo snapshot (`--web`), não agora.
- **Perguntar ao modelo o progresso**: descartado por princípio — não é reproduzível nem auditável.

## Consequências
- ~3,9 mil linhas próprias (coleta, métricas, snapshot, formatadores e TUI), cobertas por testes; o
  custo de manter widgets é nosso, em troca de zero dependência e testabilidade total.
- Projetos grandes: 100 mil eventos sobem em ~1,6 s e cada atualização custa dezenas de ms
  (`docs/reports/dashboard-performance.md`).
- Métricas que dependem de dados que o runtime não expõe (contexto, tokens, latência sem
  `tool_use_id`) aparecem como indisponíveis até que o dado exista — sem aproximação.
- Superfície pública nova (SemVer): comandos `status`, `dashboard`, `sessions`, flags, e o contrato
  `schemas/status.schema.json`.
