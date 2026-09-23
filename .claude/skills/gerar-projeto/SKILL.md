---
name: gerar-projeto
description: Roda o pipeline completo do SDD Kit — lê o brief em specs/_entrada/, decompõe em specs numeradas, gera planos e tarefas pelas pipelines da config e implementa camada por camada com os agentes especializados, testes e aprovação do guardião. Use quando o usuário pedir para gerar/implementar o projeto a partir de um brief, "ler o gerador" ou rodar /gerar-projeto.
disable-model-invocation: true
license: MIT
metadata:
  sdd-core: "true"
  sdd-version: "3.0.0"
---

# /gerar-projeto — brief → specs → código

## CLI do motor

Nesta skill e na referência, **`sdd`** significa:

```bash
node "${CLAUDE_SKILL_DIR}/../../../scripts/sdd.mjs"
```

## Pré-condições (param o pipeline se falharem)

1. `sdd config validate` sai 0 — sem config, diga "rode `/sdd-init` primeiro".
2. `sdd doctor --fast` não está `NOT_READY`.
3. O comando `commands.test` da config passa (não gere sobre base vermelha).

## Execução

Leia [references/GERADOR.md](references/GERADOR.md) por completo e execute-o do início ao fim. O
único ponto de parada é o Passo 1 (brief incompleto ou tópico bloqueado).

Regras que a CLI e os hooks impõem (não tente contornar):

- IDs de spec: `sdd spec next-id` (nunca calcule à mão).
- Specs, planos e tarefas: `sdd spec new` gera a partir das pipelines da config; depois
  `sdd tasks sync`.
- Ordem: `sdd tasks ready`; ciclo de vida de cada tarefa com `sdd event TASK_STARTED/COMPLETED/BLOCKED`.
- Fechamento: `GUARDIAN_APPROVED` com evidência antes de `SPEC_IMPLEMENTED`; `sdd state ledger`.

## Contrato de saída

Por spec: testes (quantidade e resultado), arquivos criados, CAs cobertos, resultado de
`sdd check forbidden`, veredito do guardião e próxima spec. No fim: specs entregues, total de testes,
pendências humanas.

## Falhas

Suíte vermelha, gate bloqueado, guardião reprovando ou evento recusado pela CLI → pare na spec
atual, mostre o motivo e corrija; não avance para a próxima spec.
