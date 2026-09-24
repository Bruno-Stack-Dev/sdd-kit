---
adr-id: ADR-0021
titulo: Execução paralela em ondas planejadas pela CLI; um agente por onda, guardião sozinho
status: aceito
data: 2026-09-24
---

# ADR-0021: Execução em ondas

## Contexto
`sdd tasks ready` já sugeria um lote `parallel_safe`, mas as skills executavam uma tarefa por vez.
Paralelizar de verdade esbarrava em três problemas concretos do kit:
- o hook `SubagentStop` identifica a tarefa pelo **tipo** do agente; duas tarefas do mesmo agente em
  andamento ficariam indistinguíveis (o primeiro subagente a terminar seria cobrado pela tarefa do
  outro);
- cada agente rodava a suíte de testes enquanto outros ainda escreviam — vermelho falso;
- `depende-de` entre specs não vira dependência de tarefa: a ordem do LEDGER, seguida à mão, é que
  impedia a UI de começar antes da API.

## Decisão
1. `sdd tasks wave [--spec S] [--max N]` planeja a próxima **onda** a partir das tarefas prontas,
   com regras determinísticas, avaliadas em ordem:
   specs de `depende-de` implementadas → guardião em andamento segura tudo → agente ocupado espera →
   papel exclusivo (`audit`) ou etapa `guardian: true` roda sozinho → **um agente por onda** →
   limite `agents.parallel.max` (padrão 3, teto 8; 1 = sequencial). Prioridade: ordem do LEDGER,
   depois o ID da tarefa. Cada tarefa sai com o `model`/`effort` do seu papel (ADR-0020).
2. `TASK_STARTED --wave <id>` marca a tarefa como parte da onda. O estado **recusa** iniciar numa
   onda uma tarefa de agente que já tem outra em andamento — a garantia não depende do orquestrador.
3. Numa onda, **quem fecha é o orquestrador**: os agentes implementam e rodam só verificações
   locais; o `SubagentStop` não os cobra pela tarefa da onda. Com todos de volta, a suíte roda uma
   vez; verde conclui a onda inteira, vermelho volta à correção em série, uma tarefa por vez.
4. `parallel_safe` de `tasks ready` passa a ser a mesma onda (antes: um por spec × agente, sem
   limite nem regra do guardião).
5. As regras de concorrência ficam em `policies/model-routing.json` (`concurrency`), junto dos
   papéis que elas usam.

## Alternativas
- **Worktree por agente**: isola arquivos, mas o estado (`.sdd/events.jsonl`) e os hooks leem a
  árvore do projeto, e cada onda terminaria num merge. Fica para quando houver conflito real medido.
- **Correlacionar tarefa por `agent_id` do subagente**: exigiria conhecer o id antes de criar o
  subagente; "um agente por onda" resolve com menos maquinaria.
- **Paralelizar dentro do agente** (um agente, várias tarefas): esconde o paralelismo do estado.

## Consequências
- Nas pipelines padrão, as etapas de uma spec são encadeadas: o paralelismo aparece **entre specs
  independentes** em etapas diferentes, ou em planos com ramos (ex.: mocks ∥ store depois dos
  contratos). Duas specs no mesmo passo esperam uma pela outra.
- Clientes sem subagentes (adapters) executam cada onda em série; o plano da CLI continua válido.
