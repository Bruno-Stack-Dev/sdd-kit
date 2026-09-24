# Guia de uso do SDD Kit (3.0.0)

Guia visual de como usar o kit no dia a dia: instalar, iniciar um projeto **novo** ou **existente**,
gerar e implementar specs, acompanhar o andamento e resolver bloqueios. Os diagramas são Mermaid e
renderizam direto no GitHub e na maioria dos editores.

> Neste guia, **`sdd`** é a CLI determinística do kit. No modo cópia é `node scripts/sdd.mjs`; no
> modo plugin o caminho exato aparece no contexto da sessão ("CLI determinística: ..."). No modo
> plugin as skills ganham o prefixo do plugin: `/sdd-init` vira `/sdd-kit:sdd-init`.

**Sumário**

1. [Legenda dos diagramas](#1-legenda-dos-diagramas)
2. [Mapa geral](#2-mapa-geral)
3. [Instalação: plugin ou cópia](#3-instalação-plugin-ou-cópia)
4. [Fluxo para projeto novo](#4-fluxo-para-projeto-novo-greenfield)
5. [Fluxo para projeto existente](#5-fluxo-para-projeto-existente-brownfield)
6. [Ciclo de implementação de uma spec](#6-ciclo-de-implementação-de-uma-spec)
7. [Ciclo de vida da spec no estado](#7-ciclo-de-vida-da-spec-no-estado)
8. [Pipelines e agentes](#8-pipelines-e-agentes)
9. [Retomar uma sessão interrompida](#9-retomar-uma-sessão-interrompida)
10. [Comandos mais usados](#10-comandos-mais-usados)
11. [Guardrails: o que o kit bloqueia](#11-guardrails-o-que-o-kit-bloqueia)
12. [Onde ler mais](#12-onde-ler-mais)

---

## 1. Legenda dos diagramas

Todos os fluxogramas deste guia usam as mesmas formas e cores:

```mermaid
%%{init: {"flowchart": {"wrappingWidth": 400}}}%%
flowchart LR
  L1(["/skill no Claude Code"]):::skill
  L8["Etapa dentro de uma skill"]:::skill
  L2["sdd comando da CLI"]:::cli
  L3[["@agente-* especializado"]]:::agent
  L4("Decisão ou confirmação humana"):::human
  L5{"Condição"}:::decision
  L6[("Artefato ou estado gravado")]:::artifact
  L7{{"Gate ou parada obrigatória"}}:::gate
  L1 ~~~ L8 ~~~ L2 ~~~ L3
  L4 ~~~ L5 ~~~ L6 ~~~ L7

  classDef skill fill:#dbeafe,stroke:#2563eb,stroke-width:2px,color:#0f172a
  classDef cli fill:#dcfce7,stroke:#16a34a,color:#0f172a
  classDef agent fill:#ccfbf1,stroke:#0d9488,color:#0f172a
  classDef human fill:#fef3c7,stroke:#d97706,color:#0f172a
  classDef decision fill:#f1f5f9,stroke:#475569,color:#0f172a
  classDef artifact fill:#ede9fe,stroke:#7c3aed,color:#0f172a
  classDef gate fill:#fee2e2,stroke:#dc2626,stroke-width:2px,color:#0f172a
```

| Forma | Cor | Significa | Exemplo |
|-------|-----|-----------|---------|
| Pílula | azul | **Skill** (workflow com julgamento) que você chama no Claude Code | `/sdd-init`, `/implementar-spec` |
| Retângulo | azul | **Etapa conduzida por uma skill** (não é um comando separado) | blocos do discovery, passos da auditoria |
| Retângulo | verde | **Comando da CLI** — determinístico, mesmo resultado sempre | `sdd doctor --fast` |
| Retângulo com barras | turquesa | **Subagente** especializado que executa uma etapa | `@agente-frontend` |
| Retângulo arredondado | âmbar | **Você decide ou confirma** — o kit para e pergunta | confirmar a raiz do projeto |
| Losango | cinza | **Condição** que desvia o fluxo | "testes verdes?" |
| Cilindro | roxo | **Artefato ou estado** gravado em disco | `sdd.config.yaml`, `.sdd/events.jsonl` |
| Hexágono | vermelho | **Gate / parada obrigatória** — não dá para pular | `GUARDIAN_APPROVED`, base vermelha |

Linhas cheias são o caminho normal; linhas **tracejadas** são caminhos opcionais ou de exceção.

---

## 2. Mapa geral

O kit tem três fases. A primeira roda uma vez por projeto; as outras duas se repetem a cada
entrega.

```mermaid
%%{init: {"flowchart": {"wrappingWidth": 400}}}%%
flowchart TB
  subgraph F1["1 · Preparar (uma vez)"]
    I["sdd init<br/>--mode plugin ou copy"]:::cli --> SI(["/sdd-init"]):::skill
    SI --> C{"Projeto novo<br/>ou existente?"}:::decision
    C -- novo --> D["Discovery<br/>entrevista em blocos"]:::skill
    C -- existente --> A["Auditoria<br/>engenharia reversa"]:::skill
    D --> CFG[("sdd.config.yaml<br/>specs/discovery/<br/>ADRs · CLAUDE.md")]:::artifact
    A --> CFG
  end

  subgraph F2["2 · Especificar"]
    GP(["/gerar-projeto<br/>brief completo"]):::skill
    NS(["/nova-spec<br/>incremento avulso"]):::skill
    GP --> SP[("specs + planos<br/>+ tarefas em DAG")]:::artifact
    NS --> SP
  end

  subgraph F3["3 · Implementar e acompanhar"]
    IS(["/implementar-spec"]):::skill --> G{{"Guardião aprova<br/>com evidência"}}:::gate
    G --> OK[("Spec implementada<br/>próximo incremento: /nova-spec")]:::artifact
    ST(["/sdd-status<br/>sdd dashboard"]):::skill -.-> IS
  end

  CFG --> GP
  CFG --> NS
  SP --> IS

  classDef skill fill:#dbeafe,stroke:#2563eb,stroke-width:2px,color:#0f172a
  classDef cli fill:#dcfce7,stroke:#16a34a,color:#0f172a
  classDef agent fill:#ccfbf1,stroke:#0d9488,color:#0f172a
  classDef human fill:#fef3c7,stroke:#d97706,color:#0f172a
  classDef decision fill:#f1f5f9,stroke:#475569,color:#0f172a
  classDef artifact fill:#ede9fe,stroke:#7c3aed,color:#0f172a
  classDef gate fill:#fee2e2,stroke:#dc2626,stroke-width:2px,color:#0f172a
```

**Regra de ouro:** todo código deriva de uma spec. Sem spec, rode `/nova-spec` antes de codar.
IDs, tarefas e estado vêm da CLI — o modelo nunca os inventa.

---

## 3. Instalação: plugin ou cópia

Pré-requisitos: **Claude Code** autenticado e **Node.js ≥ 20** (sem `npm install`). Git é
recomendado. Detalhes em [`SETUP.md`](../SETUP.md).

```mermaid
%%{init: {"flowchart": {"wrappingWidth": 400}}}%%
flowchart TD
  S("Abra o terminal<br/>na raiz do projeto"):::human --> Q{"Precisa de CI com a CLI no repo<br/>ou de Codex / OpenCode / Cline?"}:::decision
  Q -- não --> P["node caminho/do/sdd-kit/scripts/sdd.mjs<br/>init --mode plugin --root ."]:::cli
  Q -- sim --> CP["node caminho/do/sdd-kit/scripts/sdd.mjs<br/>init --mode copy --root ."]:::cli
  P --> PI("No Claude Code:<br/>/plugin marketplace add Bruno-Stack-Dev/sdd-kit<br/>/plugin install sdd-kit@sdd-kit"):::human
  CP --> V["sdd version"]:::cli
  PI --> V
  V --> INIT(["/sdd-init"]):::skill
  CP -. atualizar depois .-> UP["sdd upgrade<br/>backup em .sdd/backup/"]:::cli
  CP -. outros clientes .-> AD["sdd adapters build<br/>codex, opencode, cline, generic"]:::cli

  classDef skill fill:#dbeafe,stroke:#2563eb,stroke-width:2px,color:#0f172a
  classDef cli fill:#dcfce7,stroke:#16a34a,color:#0f172a
  classDef human fill:#fef3c7,stroke:#d97706,color:#0f172a
  classDef decision fill:#f1f5f9,stroke:#475569,color:#0f172a
```

| Modo | O projeto guarda | O motor mora | Atualizar |
|------|------------------|--------------|-----------|
| **Plugin** (recomendado) | config, specs, `.sdd/`, `CLAUDE.md`, `.claude/settings.json` | no plugin do Claude Code | atualizar o plugin |
| **Cópia** | tudo, inclusive `scripts/` e `.claude/` | dentro do projeto | `sdd upgrade` |

> Vindo do kit v2? Rode `sdd upgrade`, depois `sdd config migrate` e
> `sdd state import-ledger <LEDGER>`. Passo a passo em [`MIGRATION.md`](../MIGRATION.md).

---

## 4. Fluxo para projeto novo (greenfield)

Ponto de partida: uma pasta vazia (ou quase). O `/sdd-init` conduz uma entrevista em blocos e gera
toda a documentação técnica, a config e um brief pronto para o `/gerar-projeto`.

```mermaid
%%{init: {"flowchart": {"wrappingWidth": 400}}}%%
flowchart TD
  A("Pasta vazia<br/>cd meu-projeto e claude"):::human --> B["sdd init --mode plugin<br/>ou --mode copy"]:::cli
  B --> C(["/sdd-init"]):::skill
  C --> D("Confirma que esta é<br/>a raiz do projeto"):::human
  D --> E["sdd project classify"]:::cli
  E --> F("Confirma: projeto NOVO"):::human
  F --> G["Discovery em blocos<br/>1 Produto e requisitos · 2 Dados<br/>3 Arquitetura, stack, API, segurança<br/>4 Planejamento · 5 Infra<br/>IA, só se o produto usa IA"]:::skill
  G --> H[("specs/discovery/<br/>VISAO · REQUISITOS · FLUXOS<br/>MODELO-DADOS · ARQUITETURA<br/>API · RBAC · BACKLOG · INFRA")]:::artifact
  G --> H2[("specs/decisions/ADR-*<br/>sdd.config.yaml · CLAUDE.md<br/>specs/_entrada/slug-brief.md")]:::artifact
  H --> I("Fechamento: permissões da stack,<br/>packs, perfil MCP, LSP, sandbox"):::human
  H2 --> I
  I --> J["sdd config validate<br/>sdd doctor --fast"]:::cli
  J --> K{"Config válida e<br/>doctor sem NOT_READY?"}:::decision
  K -- não --> K1{{"Corrija os TODO<br/>das listas críticas<br/>forbidden_patterns<br/>human_gates · blocked_topics"}}:::gate
  K1 --> J
  K -- sim --> L(["/gerar-skills<br/>recomendado"]):::skill
  L --> M("Revise o brief em<br/>specs/_entrada/"):::human
  M --> N(["/gerar-projeto"]):::skill
  N --> O{"Brief completo e sem<br/>tópico bloqueado?"}:::decision
  O -- não --> O1("Responde a UMA pergunta<br/>com todos os gaps"):::human
  O1 --> N
  O -- sim --> P["Specs, planos e tarefas<br/>sdd spec new · sdd tasks sync"]:::cli
  P --> Q[["Implementação em ondas<br/>pelos agentes, ver seção 6"]]:::agent
  Q --> R{{"Guardião aprova cada spec"}}:::gate
  R --> S(["/sdd-status"]):::skill
  S -.-> T(["/radar-ferramentas<br/>opcional"]):::skill
  S -.-> U(["/nova-spec<br/>próximos incrementos"]):::skill

  classDef skill fill:#dbeafe,stroke:#2563eb,stroke-width:2px,color:#0f172a
  classDef cli fill:#dcfce7,stroke:#16a34a,color:#0f172a
  classDef agent fill:#ccfbf1,stroke:#0d9488,color:#0f172a
  classDef human fill:#fef3c7,stroke:#d97706,color:#0f172a
  classDef decision fill:#f1f5f9,stroke:#475569,color:#0f172a
  classDef artifact fill:#ede9fe,stroke:#7c3aed,color:#0f172a
  classDef gate fill:#fee2e2,stroke:#dc2626,stroke-width:2px,color:#0f172a
```

**Passo a passo**

| # | Onde | O que fazer | Resultado |
|---|------|-------------|-----------|
| 1 | terminal | `node <kit>/scripts/sdd.mjs init --mode plugin --root .` (ou `--mode copy`) | `.sdd/engine.json`, `.claude/settings.json` |
| 2 | Claude Code | `/sdd-init` → confirme a raiz e a classificação **novo** | `DISCOVERY_STARTED` no estado |
| 3 | Claude Code | responda os blocos do discovery; o que não souber fica `<TODO>` | nada é inventado |
| 4 | automático | geração de `specs/discovery/`, ADRs, `sdd.config.yaml`, `CLAUDE.md` e brief | documentação técnica completa |
| 5 | Claude Code | confirme permissões, packs (`arch`, `ds`, `uiux`, `ai`), perfil MCP e sandbox | `DISCOVERY_COMPLETED` |
| 6 | terminal | `sdd config validate` e `sdd doctor --fast` | `READY` ou `READY_WITH_WARNINGS` |
| 7 | Claude Code | `/gerar-skills` — skills do seu domínio (você aprova a lista) | `.claude/skills/<slug>/` |
| 8 | Claude Code | revise `specs/_entrada/<slug>-brief.md` e rode `/gerar-projeto` | specs implementadas, uma a uma |
| 9 | Claude Code | `/sdd-status` para conferir; depois `/nova-spec` para cada incremento | painel com progresso real |

> Se a entrevista for interrompida, rode `/sdd-init` de novo: ele retoma do primeiro bloco cujos
> artefatos ainda não existem ou têm `<TODO>` essencial.

---

## 5. Fluxo para projeto existente (brownfield)

Ponto de partida: um repositório que já roda. O `/sdd-init` faz **engenharia reversa**: lê o código
(somente leitura), reconstrói a documentação com proveniência por fato, pergunta só o que o código
não revela e registra as divergências.

```mermaid
%%{init: {"flowchart": {"wrappingWidth": 400}}}%%
flowchart TD
  A("Raiz do repositório<br/>cd repo e claude"):::human --> V2{"Já usa o<br/>kit v2?"}:::decision
  V2 -- sim --> MG["sdd upgrade · sdd config migrate<br/>sdd state import-ledger"]:::cli
  V2 -- não --> B["sdd init --mode plugin<br/>ou --mode copy"]:::cli
  MG --> C
  B --> C(["/sdd-init"]):::skill
  C --> D("Confirma a raiz"):::human
  D --> E["sdd project classify<br/>código, deps, testes, CI, git"]:::cli
  E --> F("Confirma: projeto EXISTENTE"):::human
  F --> G1["1 · Inventário somente leitura<br/>stack, comandos reais, estrutura"]:::skill
  G1 --> G2["2 · Extração por domínio<br/>produto, dados, arquitetura, API,<br/>RBAC, backlog, infra"]:::skill
  G2 --> G3["3 · Padrões proibidos e gates<br/>dívida atual vira expected"]:::skill
  G3 --> G4["4 · Divergências<br/>OBSERVED × INTENDED × RUNTIME"]:::skill
  G4 --> H[("specs/discovery/ com proveniência<br/>ADRs retroativos<br/>AUDITORIA-DIVERGENCIAS.md<br/>sdd.config.yaml · CLAUDE.md")]:::artifact
  H --> I["sdd config validate<br/>sdd doctor --fast e --project"]:::cli
  I --> T{"Suíte de testes<br/>real está verde?"}:::decision
  T -- não --> T1{{"Pare: reporte e corrija a base<br/>antes de o kit assumir"}}:::gate
  T1 --> I
  T -- sim --> SD{"Há SECURITY_DRIFT<br/>pendente?"}:::decision
  SD -- sim --> SD1("Decida antes de mexer<br/>naquela área"):::human
  SD1 --> K
  SD -- não --> K(["/gerar-skills"]):::skill
  K --> L(["/sdd-status"]):::skill
  L --> M(["/nova-spec slug título"]):::skill
  M --> N(["/implementar-spec SPEC-ID"]):::skill
  N --> O{{"Guardião aprova"}}:::gate
  O -. próximo incremento .-> M
  L -. brief de módulo grande .-> GP(["/gerar-projeto"]):::skill

  classDef skill fill:#dbeafe,stroke:#2563eb,stroke-width:2px,color:#0f172a
  classDef cli fill:#dcfce7,stroke:#16a34a,color:#0f172a
  classDef agent fill:#ccfbf1,stroke:#0d9488,color:#0f172a
  classDef human fill:#fef3c7,stroke:#d97706,color:#0f172a
  classDef decision fill:#f1f5f9,stroke:#475569,color:#0f172a
  classDef artifact fill:#ede9fe,stroke:#7c3aed,color:#0f172a
  classDef gate fill:#fee2e2,stroke:#dc2626,stroke-width:2px,color:#0f172a
```

**OBSERVED × INTENDED × RUNTIME** — o código é evidência do que **existe**, não prova do que
**deveria** existir. Cada divergência em `specs/discovery/AUDITORIA-DIVERGENCIAS.md` tem as três
visões e uma classificação:

| Visão | Pergunta | Evidência |
|-------|----------|-----------|
| **OBSERVED** | o que o código faz? | `arquivo:linha` |
| **INTENDED** | o que deveria fazer? | doc, ADR, resposta sua |
| **RUNTIME** | o que roda de fato? | log, ambiente, ou "não verificada" |

Classificações: `DOC_DRIFT` · `SPEC_DRIFT` · `SECURITY_DRIFT` · `RUNTIME_DRIFT` · `CONFIG_DRIFT` ·
`UNKNOWN`. Nunca vale "código prevalece" para drift crítico; `SECURITY_DRIFT` pendente exige decisão
humana antes de implementar sobre aquela área.

**Dívida conhecida:** padrão proibido que já aparece no código entra na config com
`expected: <contagem atual>`. A dívida não bloqueia a adoção, mas `sdd check forbidden` impede que
ela cresça.

**No dia a dia de um projeto existente**, o caminho típico é incremental: `/nova-spec` →
`/implementar-spec`. O `/gerar-projeto` fica para quando entra um brief de módulo inteiro.

---

## 6. Ciclo de implementação de uma spec

É o que `/implementar-spec <SPEC-ID>` faz (e o que o `/gerar-projeto` repete para cada spec). Cada
tarefa do grafo é uma etapa da pipeline, executada pelo agente da etapa, no modelo que a CLI escolhe
pelo papel.

### 6.1 Loop de tarefas (em ondas)

```mermaid
%%{init: {"flowchart": {"wrappingWidth": 400}}}%%
flowchart TD
  S(["/implementar-spec SPEC-ID"]):::skill --> SY["sdd tasks sync<br/>se a spec ainda não está no estado"]:::cli
  SY --> W["sdd tasks wave --json<br/>ou sdd tasks ready"]:::cli
  W --> Q{"Restam tarefas<br/>de implementação?"}:::decision
  Q -- sim --> MR["sdd models resolve<br/>--task SPEC/T-NNN"]:::cli
  MR --> TS["sdd event TASK_STARTED<br/>--agent --model --effort --wave"]:::cli
  TS --> AG[["@agente-* da etapa<br/>um por tarefa<br/>em paralelo na onda"]]:::agent
  AG --> TT["commands.test da config<br/>TEST_PASSED ou TEST_FAILED"]:::cli
  TT --> V{"Suíte verde?"}:::decision
  V -- sim --> TC["sdd event TASK_COMPLETED<br/>de cada tarefa da onda"]:::cli
  TC -- próxima onda --> W
  V -- não --> FX[["Correção em série<br/>uma tarefa por vez"]]:::agent
  FX -- roda a suíte de novo --> TT
  FX -. impedimento .-> TB{{"TASK_BLOCKED --reason<br/>para e reporta"}}:::gate
  Q -- não --> NX(["Fechamento da spec<br/>ver 6.2"]):::skill

  classDef skill fill:#dbeafe,stroke:#2563eb,stroke-width:2px,color:#0f172a
  classDef cli fill:#dcfce7,stroke:#16a34a,color:#0f172a
  classDef agent fill:#ccfbf1,stroke:#0d9488,color:#0f172a
  classDef decision fill:#f1f5f9,stroke:#475569,color:#0f172a
  classDef artifact fill:#ede9fe,stroke:#7c3aed,color:#0f172a
  classDef gate fill:#fee2e2,stroke:#dc2626,stroke-width:2px,color:#0f172a
```

### 6.2 Fechamento da spec (guardião)

```mermaid
%%{init: {"flowchart": {"wrappingWidth": 400}}}%%
flowchart TD
  CF["sdd check forbidden<br/>contagens no esperado"]:::cli --> GS["sdd event GUARDIAN_STARTED"]:::cli
  GS --> GD[["@agente-spec-guardian<br/>somente leitura<br/>modelo mais alto"]]:::agent
  GD --> GV{"Cada CA tem evidência<br/>de código e de teste?"}:::decision
  GV -- não --> GR["GUARDIAN_REJECTED --reason<br/>a nova tentativa sobe de nível"]:::cli
  GR --> BK(["volta ao loop de tarefas<br/>6.1"]):::skill
  GV -- sim --> GA{{"GUARDIAN_APPROVED<br/>--evidence relatório"}}:::gate
  GA --> SI["sdd event SPEC_IMPLEMENTED<br/>sdd tasks sync · sdd state ledger"]:::cli
  SI --> END[("status: implementada<br/>libera as specs dependentes")]:::artifact

  classDef skill fill:#dbeafe,stroke:#2563eb,stroke-width:2px,color:#0f172a
  classDef cli fill:#dcfce7,stroke:#16a34a,color:#0f172a
  classDef agent fill:#ccfbf1,stroke:#0d9488,color:#0f172a
  classDef decision fill:#f1f5f9,stroke:#475569,color:#0f172a
  classDef artifact fill:#ede9fe,stroke:#7c3aed,color:#0f172a
  classDef gate fill:#fee2e2,stroke:#dc2626,stroke-width:2px,color:#0f172a
```

Regras que a CLI impõe (não dá para contornar):

- **Ondas** (`sdd tasks wave`): cada agente aparece no máximo uma vez por onda, guardião sempre sozinho, specs dependentes só
  depois de implementadas, limite em `agents.parallel.max`. Com `max: 1` o fluxo vira uma tarefa
  por vez.
- **Suíte única por onda:** os agentes não rodam a suíte completa nem registram eventos; quem fecha
  a onda é a sessão principal.
- **`TASK_STARTED` é recusado** se alguma dependência não estiver concluída.
- **`SPEC_IMPLEMENTED` é recusado** sem `GUARDIAN_APPROVED`, com tarefa aberta, teste falhando ou
  gate bloqueado.
- Para rodar **uma** tarefa isolada: `/implementar-tarefa SPEC/T-NNN` (mesmo ciclo, sem o fechamento
  da spec).

---

## 7. Ciclo de vida da spec no estado

O status de cada spec é derivado de `.sdd/events.jsonl` (append-only, versionado). Cada seta é um
evento gravado com `sdd event <TIPO>`; transições fora deste mapa são recusadas pela CLI.

```mermaid
stateDiagram-v2
  [*] --> draft: SPEC_CREATED
  draft --> planned: PLAN_CREATED
  planned --> in_progress: TASK_STARTED
  in_progress --> in_review: GUARDIAN_STARTED
  in_review --> in_progress: GUARDIAN_REJECTED
  in_review --> approved: GUARDIAN_APPROVED
  approved --> implemented: SPEC_IMPLEMENTED
  approved --> in_progress: SPEC_UPDATED ou TASK_REOPENED
  implemented --> in_progress: SPEC_UPDATED ou TASK_REOPENED
  implemented --> archived: SPEC_ARCHIVED
  archived --> [*]
```

| Status no estado | Quer dizer |
|------------------|------------|
| `draft` | spec criada, sem plano |
| `planned` | plano e tarefas gerados |
| `in_progress` | alguma tarefa começou (ou a aprovação foi invalidada por mudança na spec) |
| `in_review` | guardião revisando |
| `approved` | guardião aprovou com evidência |
| `implemented` | fechada: testes verdes, tarefas concluídas, sem gate bloqueado |
| `archived` | fora do fluxo |

O `status:` do frontmatter da spec (`rascunho` · `aprovada` · `implementada` · `arquivada`) é a
visão para leitura humana; no fechamento ele passa a `implementada`. A fonte da verdade é o estado.

> Nunca edite `.sdd/events.jsonl` à mão (o hook bloqueia). `sdd state verify` confere a integridade;
> `sdd state rebuild` reconstrói o estado derivado.

---

## 8. Pipelines e agentes

Cada spec segue **uma pipeline** declarada no `sdd.config.yaml` (escolhida em
`sdd spec new --pipeline <nome>`). Cada etapa vira uma tarefa com um agente. O motor não assume
nenhuma pipeline fixa: o exemplo abaixo é o do `sdd.config.example.yaml`; há outros em
[`docs/examples/pipelines/`](examples/pipelines/) (API, CLI, frontend).

```mermaid
%%{init: {"flowchart": {"wrappingWidth": 400}}}%%
flowchart LR
  subgraph BE["pipeline backend"]
    direction TB
    b1[["contrato-api<br/>arquiteto-contratos"]]:::agent --> b2[["migrations<br/>backend"]]:::agent --> b3[["repositórios<br/>backend"]]:::agent --> b4[["serviços<br/>backend"]]:::agent --> b5[["handlers + RBAC<br/>backend"]]:::agent --> b6[["integração<br/>qa-testes"]]:::agent --> b7{{"conformidade<br/>spec-guardian"}}:::gate
  end
  subgraph FE["pipeline frontend"]
    direction TB
    f1[["contratos<br/>arquiteto-contratos"]]:::agent --> f2[["mocks<br/>mock-data"]]:::agent --> f3[["store<br/>frontend"]]:::agent --> f4[["ui + rotas + menu<br/>frontend"]]:::agent --> f5[["testes<br/>qa-testes"]]:::agent --> f6[["e2e<br/>e2e"]]:::agent --> f7{{"guardião<br/>spec-guardian"}}:::gate
  end
  subgraph DL["pipeline delivery"]
    direction TB
    d1{{"arquitetura<br/>arquiteto-guardian"}}:::gate --> d2[["ci-cd<br/>devops"]]:::agent
  end
  BE -. API antes da UI que a consome .-> FE
  FE ~~~ DL

  classDef agent fill:#ccfbf1,stroke:#0d9488,color:#0f172a
  classDef gate fill:#fee2e2,stroke:#dc2626,stroke-width:2px,color:#0f172a
```

| Agente | Papel | Escreve código? |
|--------|-------|-----------------|
| `@agente-arquiteto-contratos` | tipos e contratos compartilhados (fonte da verdade) | sim |
| `@agente-mock-data` | dados mockados realistas e isolados | sim |
| `@agente-frontend` | store, telas, rotas e menu | sim |
| `@agente-backend` | serviços, repositórios, persistência, endpoints | sim |
| `@agente-qa-testes` | testes unit/componente/integração por CA | sim |
| `@agente-e2e` | testes e2e de navegador pelos fluxos reais | sim |
| `@agente-devops` | CI/CD e empacotamento a partir do `INFRA.md` | sim |
| `@agente-acessibilidade` | teclado, leitor de tela, ARIA, contraste | sim |
| `@agente-gerador-skills` | skills sob medida do domínio (`/gerar-skills`) | sim |
| `@agente-spec-guardian` | código × spec: cada CA com evidência | **não** (somente leitura) |
| `@agente-arquiteto-guardian` | código × ADRs e limites entre camadas | **não** (somente leitura) |
| `@agente-revisor-ux` | clareza e visibilidade dos gates humanos | **não** (somente leitura) |

O modelo de cada agente vem do papel (`sdd models list`): guardiões e contratos no nível mais alto,
implementação no padrão, dados mockados no leve. Overrides em `agents.models` da config.

---

## 9. Retomar uma sessão interrompida

```mermaid
%%{init: {"flowchart": {"wrappingWidth": 400}}}%%
flowchart TD
  A("Sessão caiu ou<br/>você voltou no dia seguinte"):::human --> B["sdd state resume"]:::cli
  B --> C{"O que ele mostra?"}:::decision
  C -- tarefa em andamento --> D(["/implementar-tarefa SPEC/T-NNN"]):::skill
  C -- tarefa bloqueada --> E("Resolva o motivo e<br/>reabra a tarefa"):::human
  C -- teste falhando --> F["commands.test da config<br/>corrija antes de avançar"]:::cli
  C -- spec em andamento --> G(["/implementar-spec SPEC-ID"]):::skill
  C -- nada aberto --> H(["/sdd-status<br/>próximas tarefas prontas"]):::skill
  B -. divergência de checkbox .-> I["sdd tasks sync"]:::cli
  B -. suspeita de edição manual .-> J["sdd state verify"]:::cli

  classDef skill fill:#dbeafe,stroke:#2563eb,stroke-width:2px,color:#0f172a
  classDef cli fill:#dcfce7,stroke:#16a34a,color:#0f172a
  classDef human fill:#fef3c7,stroke:#d97706,color:#0f172a
  classDef decision fill:#f1f5f9,stroke:#475569,color:#0f172a
```

---

## 10. Comandos mais usados

### 10.1 Skills (no Claude Code)

| Skill | Quando usar | Argumento |
|-------|-------------|-----------|
| `/sdd-init` | uma vez por projeto, para adotar o kit | `[novo\|existente]` (sugestão; sempre confirma) |
| `/sdd-status` | "como está o projeto?", "o que falta?", "por onde retomo?" | — |
| `/sdd-dashboard` | acompanhar ao vivo: abre o `sdd dashboard` numa janela de terminal | `[--demo] [--tab <tela>]` |
| `/gerar-projeto` | transformar um brief de `specs/_entrada/` em specs e código | — |
| `/nova-spec` | especificar um incremento ou funcionalidade avulsa | `<slug> [título]` |
| `/implementar-spec` | entregar uma spec de ponta a ponta até o guardião | `<SPEC-ID>` |
| `/implementar-tarefa` | fazer uma única tarefa do grafo | `<T-NNN \| SPEC/T-NNN>` |
| `/gerar-skills` | depois do discovery, ou quando entra domínio/integração novos | — |
| `/validar-e2e` | rodar os e2e da config, com filtro opcional | `[filtro]` |
| `/radar-ferramentas` | pedir sugestões de ferramentas para o projeto (só sugere) | `[foco]` |
| `/sdd-export-context` | gerar um pacote local e sanitizado do código | `[finalidade] [--include glob]` |

### 10.2 CLI do dia a dia (top 15)

| Comando | Para quê |
|---------|----------|
| `sdd status` | resumo: saúde, progresso, tarefas, agentes, gate atual, entrega (`--watch` atualiza ao vivo) |
| `sdd dashboard` | painel interativo no terminal (`--demo` mostra com dados sintéticos) |
| `sdd state resume` | por onde retomar: tarefas abertas, bloqueadas, prontas, testes falhando |
| `sdd doctor --fast` | saúde rápida de config, specs, grafo, estado e agentes |
| `sdd doctor --full` | tudo, pronto para CI: `READY`, `READY_WITH_WARNINGS` ou `NOT_READY` (exit 1) |
| `sdd config validate` | valida `sdd.config.yaml` contra o schema |
| `sdd config render` | regenera a visão legível `sdd.config.md` |
| `sdd tasks ready` | tarefas prontas para começar (dependências concluídas) |
| `sdd tasks wave` | próxima onda paralela planejada pela CLI |
| `sdd tasks list` · `sdd tasks graph` | todas as tarefas por spec · o grafo (DAG) |
| `sdd tasks sync` | registra specs/tarefas no estado e reescreve os checkboxes |
| `sdd spec new --slug s --title t` | cria spec + plano + tarefas (normalmente via `/nova-spec`) |
| `sdd check forbidden` | roda os padrões proibidos da config (grep de ausência) |
| `sdd models list` | modelo e esforço de cada agente/etapa |
| `sdd policy check --command "<cmd>"` | explica por que um comando foi bloqueado ou pede confirmação |

### 10.3 "Quero… → rode…"

| Quero… | Rode |
|--------|------|
| começar a usar o kit num projeto | `sdd init --mode plugin` e depois `/sdd-init` |
| ver o andamento | `/sdd-status` ou `sdd status` |
| acompanhar ao vivo enquanto os agentes trabalham | `/sdd-dashboard` (pelo chat) ou `sdd dashboard` (no terminal) |
| criar uma funcionalidade nova | `/nova-spec <slug> "<título>"` → `/implementar-spec <SPEC-ID>` |
| gerar o projeto inteiro a partir de um brief | coloque o `.md` em `specs/_entrada/` → `/gerar-projeto` |
| fazer só uma tarefa | `/implementar-tarefa SPEC/T-NNN` |
| saber o que dá para fazer agora | `sdd tasks ready` |
| retomar depois de uma queda | `sdd state resume` |
| validar antes de abrir PR / no CI | `sdd doctor --full` |
| rodar os e2e | `/validar-e2e [filtro]` |
| registrar uma decisão de arquitetura | `sdd template show adr` → `specs/decisions/ADR-NNN-<slug>.md` |
| ativar um pack opcional | `sdd pack list` → `sdd pack activate <arch\|ds\|uiux\|ai>` |
| sugestões de ferramentas | `/radar-ferramentas [foco]` |
| usar o kit no Codex, OpenCode ou Cline | `sdd adapters build <cliente> --install` (modo cópia) |
| atualizar o motor (modo cópia) | `node <kit-novo>/scripts/sdd.mjs upgrade --root .` |

### 10.4 Quando algo dá errado

| Sintoma | Comando que explica | O que fazer |
|---------|---------------------|-------------|
| comando bloqueado pelo hook | `sdd policy check --command "<cmd>"` | siga a regra; não remova hooks nem `deny` |
| `evento recusado` na CLI | `sdd state show` · `sdd tasks ready` | a mensagem diz o que falta (dependência, guardião, teste) |
| `doctor` com `NOT_READY` | `sdd doctor --full --verbose` | cada item traz o motivo e como corrigir |
| config não valida | `sdd config validate` | troque `<TODO>` por valores reais ou `[]` nas listas críticas |
| checkboxes diferentes do estado | `sdd tasks sync` | o estado é a fonte; os checkboxes são reescritos |
| suspeita de estado adulterado | `sdd state verify` · `sdd state repair` | nunca edite `.sdd/events.jsonl` à mão |
| grafo de tarefas inválido | `sdd tasks graph` | ciclo, dependência órfã ou agente inexistente param o fluxo |

---

## 11. Guardrails: o que o kit bloqueia

```mermaid
%%{init: {"flowchart": {"wrappingWidth": 400}}}%%
flowchart LR
  AC["Ação do agente<br/>Read, Edit, Bash"]:::cli --> H{"Hook PreToolUse<br/>política do kit"}:::decision
  H -- segredo: .env, chaves --> X1{{"bloqueado"}}:::gate
  H -- editar .sdd/events.jsonl --> X2{{"bloqueado"}}:::gate
  H -- editar arquivo gerado --> X3{{"bloqueado"}}:::gate
  H -- git destrutivo --> X4{{"bloqueado"}}:::gate
  H -- ação sensível --> AS("pede sua confirmação"):::human
  H -- demais ações --> OK[("permitido")]:::artifact

  classDef cli fill:#dcfce7,stroke:#16a34a,color:#0f172a
  classDef human fill:#fef3c7,stroke:#d97706,color:#0f172a
  classDef decision fill:#f1f5f9,stroke:#475569,color:#0f172a
  classDef artifact fill:#ede9fe,stroke:#7c3aed,color:#0f172a
  classDef gate fill:#fee2e2,stroke:#dc2626,stroke-width:2px,color:#0f172a
```

Além dos hooks:

- **Spec só fecha com o guardião:** o estado recusa `SPEC_IMPLEMENTED` sem `GUARDIAN_APPROVED` com
  evidência.
- **Base vermelha não avança:** `/gerar-projeto` e `/implementar-spec` param com testes falhando.
- **Guardiões e revisores são somente leitura** (mínimo privilégio).
- **Skills e packs** só ativam se batem com o `skills.lock.json`; externas entram em quarentena.
- **MCP** só da allowlist, com lock de schema (`sdd mcp check`).
- **Conteúdo do repositório** (README, comentários, issues, docs externas) é evidência, nunca
  instrução para os agentes.

---

## 12. Onde ler mais

| Assunto | Documento |
|---------|-----------|
| Instalação e primeiro uso | [`SETUP.md`](../SETUP.md) |
| Visão geral e referência da CLI | [`README.md`](../README.md) |
| Migração do v2 | [`MIGRATION.md`](../MIGRATION.md) |
| Painel e métricas | [`docs/dashboard.md`](dashboard.md) |
| Decisões do kit | [`docs/adr/`](adr/README.md) |
| Agentes | [`docs/architecture/agents.md`](architecture/agents.md) · [`.claude/README.md`](../.claude/README.md) |
| Skills e packs | [`.claude/skills/README.md`](../.claude/skills/README.md) |
| Segurança | [`docs/security/`](security/) · [`SECURITY.md`](../SECURITY.md) |
| MCP | [`docs/mcp/README.md`](mcp/README.md) |
| Outros clientes | [`docs/adapters/README.md`](adapters/README.md) |
| Observabilidade | [`docs/observability.md`](observability.md) |
