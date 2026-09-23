---
adr-id: ADR-0004
titulo: Estado do pipeline por eventos (events.jsonl) com estado e LEDGER derivados
status: aceito
data: 2026-09-23
---

# ADR-0004: Estado por eventos, `state.json` e LEDGER derivados

## Contexto
No v2 o estado do pipeline era o `LEDGER-<slug>.md` e os checkboxes de `specs/tasks/`, editados
livremente pelo LLM. A retomada dependia de o modelo reler prosa; a regra "só `implementada` com o
guardião aprovando" não tinha nenhum mecanismo. Os IDs `T-NNN` recomeçavam em cada arquivo.

## Decisão
- **Autoridade:** `.sdd/events.jsonl`, append-only, uma linha JSON por evento
  (`schemas/event.schema.json`, versão 1). Gravado só pela CLI (`sdd event`, `sdd tasks sync`),
  com lock de arquivo, chave de idempotência e validação da transição contra o estado atual.
- **Reducer determinístico** (`scripts/lib/state.mjs`) com máquinas de estado de spec e de tarefa.
  Regras que antes eram prosa agora recusam o evento: dependência não concluída, conclusão de tarefa
  de guardião sem `GUARDIAN_APPROVED`, aprovação sem evidência, reprovação ou bloqueio sem motivo,
  `SPEC_IMPLEMENTED` sem aprovação / com tarefa aberta / teste falhando / gate bloqueado.
- **Derivados:** `.sdd/state.json` (materializado a cada append, recalculável por `state rebuild`,
  divergência detectada por `state verify`) e `LEDGER-<slug>.md` (gerado com cabeçalho
  `AUTO-GENERATED`). Checkboxes passam a ser reescritos a partir do estado por `tasks sync`.
- **IDs globais de tarefa:** `<spec>/T-NNN`; o ID local continua aceito quando não é ambíguo.
- **Replay não reescreve a história:** a reexecução do log não reaplica checagens que dependem das
  definições atuais das tarefas (dependências), só as que dependem do próprio estado.
- **Recuperação:** cauda truncada (escrita interrompida) bloqueia novas gravações até
  `state repair`, que preserva o trecho em `.sdd/backup/`.
- **Adoção v2:** `state import-ledger` e a primeira `tasks sync` importam o estado antigo marcando-o
  como `imported` (sem fingir que houve aprovação do guardião).
- **Versionamento:** `events.jsonl` é versionado (trilha de auditoria, `merge=union`); `state.json`,
  cache, relatórios e backups ficam no `.sdd/.gitignore`.

## Alternativas
- **SQLite** — consultas melhores, mas dependência nativa e arquivo binário ruim de revisar em PR.
- **Só `state.json` editável** — volta ao problema de um arquivo de estado mutável sem trilha.
- **Frontmatter como estado** — espalha o estado por dezenas de arquivos editados pelo LLM.

## Consequências
- Uma sessão interrompida é retomada com `sdd state resume`, sem reconstrução manual.
- O guardião deixa de ser só uma instrução: o estado não aceita fechar spec sem ele.
- Custa disciplina: o motor (e os hooks da Fase 4) precisam registrar eventos; eventos esquecidos
  aparecem como checkbox divergente ou tarefa parada no `resume`/doctor.
