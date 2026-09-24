---
name: radar-ferramentas
description: "Pesquisa ferramentas, bibliotecas e serviços externos que melhorariam ESTE projeto, a partir do discovery, da stack e dos drivers declarados; descarta de forma determinística o que já está em uso, em ADR, no backlog ou em radar anterior (sdd radar check); compara candidatos com evidência atual (versão, data, link, licença) e sempre contra a opção mínima; grava um relatório datado em specs/discovery/RADAR-<data>.md. Só sugere: nunca instala, e cada adoção vira ADR por decisão humana. Use quando o usuário pedir sugestões de ferramentas, frameworks ou libs para o projeto, quiser saber o que poderia melhorar a stack, ao fechar o /gerar-projeto, ou rodar /radar-ferramentas."
disable-model-invocation: true
argument-hint: "[foco, ex.: agentes de IA | observabilidade]"
license: MIT
metadata:
  sdd-core: "true"
  sdd-version: "3.0.0"
---

# /radar-ferramentas — o que mais ajudaria este projeto

**`sdd`** = `node "${CLAUDE_SKILL_DIR}/../../../scripts/sdd.mjs"`

Você **sugere**; o humano decide. Nada é instalado, nenhuma dependência é adicionada e nenhuma ADR
nasce `aceito` nesta skill. Método de comparação: [references/AVALIACAO-DE-FERRAMENTAS.md](references/AVALIACAO-DE-FERRAMENTAS.md).

## 1. Inventário (determinístico)

`sdd radar inventory --json` → stack, packs, bloco `ai:`, dependências por manifesto, ADRs (com
status), docs de discovery, backlog, radares anteriores e `paths` (onde gravar: `paths.discovery`,
`paths.decisions` — seguem `paths.specs` da config; o padrão é `specs/`). Leia os docs que ele listar (`VISAO`,
`REQUISITOS`, `ARQUITETURA`, `INFRA`, `AI-*`) — é deles que saem os drivers. Sem `sdd.config.yaml`,
pare e sugira `/sdd-init`. Radar anterior existe? Parta dele: o que mudou desde a data dele.

## 2. Lacunas — do projeto, não de uma lista

Derive de 3 a 7 lacunas, cada uma ligada a um driver com fonte (RNF, INFRA, restrição do `ai:`,
risco da auditoria). Foco em `$ARGUMENTS` restringe o escopo. Anote as **restrições
eliminatórias** (ex.: LLM local → nada que exija cloud; licença; estágio do projeto). Mostre as
lacunas ao usuário e confirme **uma vez** antes de pesquisar.

## 3. Pesquisa com evidência atual

- Rode a busca **aqui, na sessão principal** (WebSearch/WebFetch; Context7 para a documentação de
  uma lib já identificada). Nunca delegue a um `@agente-*`: nenhum tem ferramenta de web (ADR-0009).
- Consultas só com termos genéricos (categoria + linguagem/stack + restrição). **Nunca** código,
  nomes internos, dados de cliente, URLs privadas ou segredos.
- Para cada candidato: versão avaliada, data da consulta, link oficial, licença, data do último
  release e sinais de manutenção. Sem web disponível ou sem confirmação → `NÃO VERIFICADO`; memória
  do modelo nunca vira fato.
- Lacuna de IA (orquestração de agentes, modelo, serving, RAG, memória, evals de LLM) com o pack
  `ai` ativo: siga `ai-architecture-evaluator` / `ai-model-strategy` e referencie os `AI-*`; sem o
  pack, sugira `sdd pack activate ai`.

## 4. Já está no roadmap? (determinístico)

`sdd radar check <cand1> <cand2> ... --json` para **todos** os candidatos, antes de comparar:

| Status | O que fazer |
|--------|-------------|
| `em-uso` | Sai do radar; vai para "Já coberto". |
| `em-adr` | Leia o ADR: `aceito` → já coberto; `descartado`/`superado` → só volte com fato novo que dispare o gatilho de reavaliação dele. |
| `no-backlog` | Já planejado: registre em "Já coberto"; sugira só o que complementa. |
| `avaliado` | Cite o radar anterior; reavalie só se versão, licença ou driver mudaram. |
| `mencionado` / `novo` | Segue para a comparação. |

Ocorrência não é decisão: a CLI mostra onde o nome aparece; o contexto é você quem lê.

## 5. Comparar e registrar

- Por lacuna: **opção mínima** (o que a stack atual ou código próprio já resolvem) + ao menos um
  candidato; critérios com pesos vindos dos drivers (referência acima).
- `sdd template show radar` → `<paths.discovery>/RADAR-<AAAA-MM-DD>.md` (`status: rascunho`,
  `doc-id` igual ao nome). Mesmo dia? Sufixo `-<foco>` em minúsculas, sem acento nem espaço
  (ex.: `RADAR-2026-09-24-observabilidade.md`).

## 6. Decisão humana

Apresente um resumo curto por lacuna e pergunte a decisão de cada candidato: **adotar · spike ·
adiar · descartar**. Registre-as na tabela "Decisões" e então:

- **adotar** → ADR `proposto` (`sdd template show adr` → `<paths.decisions>/`) com alternativas,
  evidência e gatilhos de reavaliação; o trabalho entra por item no `BACKLOG.md` ou `/nova-spec`.
- **spike** → casos, métrica e critério de corte definidos antes, como tarefa própria.
- **adiar / descartar** → motivo registrado (o próximo radar lê isto).

A dependência só entra depois, pelo gerenciador de pacotes do projeto (a política pede
confirmação). Com as decisões registradas: `status: aprovada` e `sdd doctor --fast` sem falhas.

Saída: caminho do radar, lacunas, candidatos por status, decisões e ADRs propostos.
