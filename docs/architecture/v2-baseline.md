# Baseline técnico — SDD Kit v2.0.0 (estado antes da v3)

> Documento de **caracterização** (Fase 0 do plano v3). Descreve o kit **como ele é** no commit
> `2c196f5` (branch `main`, 2026-09-23), sem propor mudança. O plano de mudança está em
> [`../migration/v2-to-v3-plan.md`](../migration/v2-to-v3-plan.md). A suíte de caracterização que
> protege este comportamento está em `tests/characterization/`.

## 1. Números do baseline

| Item | Valor |
|------|-------|
| Arquivos versionados | 379 (dos quais ~315 são packs vendorizados) |
| Agentes (`.claude/agents/`) | 12 |
| Comandos (`.claude/commands/`) | 8 |
| Templates (`specs/_templates/`) | 14 |
| Motores em Markdown (`specs/_gerador/`) | 3 (`GERADOR`, `DISCOVERY`, `AUDITORIA`) + `LEDGER.example` |
| Packs vendorizados (inativos em `.claude/skills/_packs/`) | 3 — `arch` (14 skills, 82 KB), `ds` (44 skills, 984 KB), `uiux` (7 skills, 8,8 MB) |
| Código executável próprio | 1 script: `scripts/sdd-lint.mjs` (357 linhas, zero dependências) |
| Testes próprios | 4 (`node:test`) |
| Testes de terceiros | 77 `pytest` (+34 subtests) nos scripts do pack `uiux` |
| `sdd-lint` no próprio kit | 85 itens verificados · 0 erros · 0 avisos |
| Dependências npm/pip de runtime | nenhuma (Node e Python só como runtimes) |
| CI | 1 workflow (`ci.yml`): lint + testes node; pytest dos packs |

Runtimes observados na máquina de referência: Node 24.15, Python 3.11, Git 2.54. O CI usa Node 22 e
Python 3.12.

## 2. Árvore relevante

```text
sdd-kit/
├── README.md · SETUP.md · LICENSE (MIT, próprio) · .gitignore
├── sdd.config.example.md          ← modelo da config do projeto (Markdown, 12 seções)
├── specs/
│   ├── _gerador/                  ← "motor" em prosa: GERADOR, DISCOVERY, AUDITORIA, LEDGER.example
│   ├── _templates/                ← 14 templates (spec, plano, tarefas, ADR, 9 de discovery, divergências)
│   ├── _entrada/                  ← brief do usuário (+ EXEMPLO-brief.md)
│   └── features|plans|tasks|decisions|architecture|apis|archive|discovery/  (vazios, .gitkeep)
├── .claude/
│   ├── agents/                    ← 12 subagentes (frontmatter só name/description)
│   ├── commands/                  ← 8 slash commands (frontmatter description/argument-hint)
│   ├── skills/                    ← README, _template-skill.md, _packs/{arch,ds,uiux}
│   ├── settings.json              ← allowlist/denylist genérica
│   └── settings.example.{python,go}.json
├── scripts/sdd-lint.mjs · scripts/tests/sdd-lint.test.mjs
└── .github/workflows/ci.yml
```

## 3. Modelo de distribuição

**Cópia.** O usuário copia `specs/`, `.claude/`, `scripts/` e `sdd.config.example.md` para a raiz
do projeto-alvo. Não existe versão detectável do motor no projeto consumidor (o `GERADOR.md` tem
`versao: 2.0.0` no frontmatter e a config `sdd-config-version: 1.0.0`, mas nada compara os dois).
Atualizar o motor = copiar de novo, à mão, em cada projeto.

## 4. Fluxos

### 4.1 Greenfield (`/sdd-init` → projeto novo)
1. Passo A: confirma `pwd` e a âncora (`specs/_gerador/`, `.claude/`, `scripts/sdd-lint.mjs`).
2. Passo B: classifica novo × existente por heurística (o LLM olha manifestos, `src/`, lockfiles) e
   confirma com o usuário.
3. `DISCOVERY.md`: entrevista em 5 blocos (produto → dados → arquitetura/stack → planejamento →
   infra); opcionalmente cadeia de skills `arch-*` (exige ativar o pack por cópia manual).
4. Fechamento: gera 9 docs em `specs/discovery/`, ADRs, `sdd.config.md`, `CLAUDE.md`, brief em
   `specs/_entrada/`; ajusta allowlist; decide packs; roda `sdd-lint`.
5. `/gerar-projeto` executa o `GERADOR.md` (Passos 0–7) sem confirmação intermediária.

### 4.2 Brownfield (`/sdd-init` → projeto existente)
`AUDITORIA.md`: inventário somente leitura → extração por domínio com proveniência
`[código]/[inferido]/[usuário]` → padrões proibidos/gates → `AUDITORIA-DIVERGENCIAS.md` com a
regra **"código prevalece"** → mesmos artefatos do greenfield + ADRs retroativos.

### 4.3 Pipeline do motor (`GERADOR.md`)
Passo 0 pré-condições (config existe, lint, testes verdes) → Passo 1 brief (único ponto de parada)
→ Passo 2 decomposição + numeração + `LEDGER-<slug>.md` → Passo 3 SPEC/PLAN/TASKS (+ADR) →
Passo 4 agentes → Passo 5 implementação por camadas da config (seções 5, 5-B, 5-C) → Passo 6
validação (testes, e2e, lint, portões) → Passo 7 fechamento (atualiza `CLAUDE.md`).

## 5. Lifecycle

**Spec** (`specs/features/<PREFIXO>NNN-<slug>.md`, frontmatter): `rascunho → implementada |
aprovada | arquivada`. `cas:` é a contagem de CAs declarada à mão. `depende-de: []` lista specs.
Regra em prosa: só vira `implementada` com aprovação do `@agente-spec-guardian`.

**Plano** (`specs/plans/…`): `plano-id`, `spec-relacionada`, `status`. **Não validado** pelo lint.

**Tarefas** (`specs/tasks/…`): um arquivo por spec (`tarefas-de`, `plano-relacionado`); cada tarefa é
uma linha Markdown:

```text
- [ ] [T-001] descrição (@agente-x) 🔒 T-002, T-003
```

Estados por caractere do checkbox: `[ ]` backlog · `[~]` em progresso · `[!]` bloqueada ·
`[x]` concluída · `[-]` cancelada. **IDs `T-NNN` recomeçam em cada arquivo** (o template começa em
`T-001`), então não são globalmente únicos. Não validado pelo lint.

**ADR** (`specs/decisions/…`): `adr-id`, `status (proposto|aceito|descartado|superado por|obsoleto)`.
Nome do arquivo inconsistente entre documentos (`ADR-NNN-<slug>.md`, `ADR-...md`, `ADR-2026-005`).
Não validado.

**Ledger** (`specs/_gerador/LEDGER-<slug>.md`): tabela Markdown editada pelo LLM com
`pendente|em-andamento|feita`; é o **único** mecanismo de retomada.

## 6. Agentes

| Agente | Papel | Ferramentas declaradas |
|--------|-------|------------------------|
| arquiteto-contratos, frontend, backend, mock-data, qa-testes, e2e, devops, gerador-skills, acessibilidade | escrevem artefatos | nenhuma (herda **todas**) |
| spec-guardian, arquiteto-guardian, revisor-ux | auditam / relatam | nenhuma (herda **todas**, incl. Edit/Write) |

Todos têm protocolo de raciocínio em prosa, "Regras deste agente" e "Regras globais". Nenhum declara
`tools`, `disallowedTools`, `skills`, `permissionMode`, `memory` ou `hooks`, nem contrato de
saída/falha estruturado. Os três auditores dizem "não reescreve código", mas nada técnico impede.

## 7. Comandos e skills

- 8 comandos em `.claude/commands/` (Markdown com procedimento completo; `sdd-init` tem 109 linhas).
- Não há skills próprias do kit além do template; o `@agente-gerador-skills` gera skills de domínio
  no projeto consumidor.
- Packs vendorizados (inativos): `arch` (MIT, software-architecture-pack v0.1.0), `ds` (MIT, Design
  System Ops), `uiux` (MIT declarado, UI/UX Pro Max v2.11.0). Ativação = **cópia manual** de
  `_packs/<pack>/` para `.claude/skills/`, instruída em prosa no `/sdd-init`.
- Achado de licença: `_packs/uiux/uiux-ui-styling/` declara `license: MIT` no frontmatter, mas traz
  `LICENSE.txt` **Apache-2.0** e 28 fontes com licença **OFL** em `canvas-fonts/`. O `ATTRIBUTION`
  do pack `ds` ainda cita o flag `ativo` que a config diz ter sido removido.

## 8. Gates e guardian

- Gates de controle humano: config seção 8 (tabela), aplicados por agentes em prosa.
- Padrões proibidos: config seção 7 (tabela de regex), executados **à mão** pelo guardian ("rode cada
  grep e cite a contagem").
- Portões de engenharia: config seção 11, só **reportados** como aviso pelo lint.
- O lint impede placeholders nas seções 7/8 (única regra de config realmente determinística).

## 9. Segurança atual

`.claude/settings.json`:
- **allow:** `Read`, `Glob`, `Grep`, `Write`, `Edit`, `Bash(npm run|install|ci:*)`, `Bash(npx:*)`,
  `Bash(pnpm:*)`, `Bash(yarn:*)`, `Bash(node:*)`, `Bash(python:*)`, `Bash(python3:*)`, git
  status/diff/log/add/commit, `mkdir`, `ls`, `cat`, `sed`, `grep`, `find`.
- **deny:** `rm -rf`, `git push`, `git reset --hard`, `sudo`, `curl`, `wget`.

Lacunas: `node`, `python`, `npx`, `pnpm dlx`, `yarn dlx` executam código arbitrário e acessam rede,
então negar `curl`/`wget` **não** bloqueia rede; `sed -i`/`cat >` escrevem em qualquer arquivo sem
passar por `Edit`; `rm -fr`/`rm -r -f` contornam `rm -rf`; não há proteção de leitura/escrita de
`.env`, chaves ou credenciais; não há hooks nem sandbox; regras de "não tocar produção" e "segredos
fora do código" existem só nos prompts dos agentes.

## 10. CI atual

`ci.yml` em `push` **e** `pull_request` (execução dupla em PRs internos), sem bloco `permissions`,
actions referenciadas por tag móvel (`@v4`, `@v5`), dois jobs: `sdd-lint` + `node --test`; `pytest`
dos scripts `uiux`.

## 11. Markdown usado como estado executável

| Arquivo | Papel executável | Quem mantém |
|---------|------------------|-------------|
| `sdd.config.md` | config lida por agentes/motor (tabelas) | LLM/usuário |
| `LEDGER-<slug>.md` | estado e retomada do pipeline | LLM |
| checkboxes em `specs/tasks/*.md` | status de tarefa | LLM |
| frontmatter `status`/`cas` das specs | status de spec, contagem de CAs | LLM (lint valida formato) |
| `AUDITORIA-DIVERGENCIAS.md` | estado de drift | LLM |
| `CLAUDE.md` (Passo 7) | "contagem de testes, tabela de status do módulo" | LLM |

## 12. O que hoje depende de o LLM "lembrar"

1. Rodar o lint e parar se as seções 7/8 tiverem placeholders (Passo 0).
2. Não marcar spec `implementada` sem aprovação do guardian.
3. Manter `cas:` igual ao número de `CA-NN` no corpo (o lint não conta).
4. Calcular o próximo bloco de numeração varrendo `specs/**`.
5. Rodar cada grep de padrão proibido e registrar a contagem.
6. Atualizar o `LEDGER` e os checkboxes ao concluir.
7. Ativar o pack `arch` (cópia) antes de citar skills `arch-*`.
8. Não ler/escrever `.env`, não dar push, não escrever em produção.
9. Ajustar o allowlist à stack no fim do `/sdd-init`.
10. Validar que `depende-de` aponta para specs existentes e sem ciclo.

## 13. Dívidas técnicas detectadas

| # | Dívida | Severidade |
|---|--------|-----------|
| D1 | Config só em Markdown; sem schema; seção 2 (comandos) e 3 (paths) sem validação | alta |
| D2 | Retomada depende de prosa (`LEDGER`) editada livremente | alta |
| D3 | IDs de tarefa não únicos entre specs; `/implementar-tarefa T-001` é ambíguo | alta |
| D4 | Planos, tarefas e ADRs não validados; `depende-de` sem checagem de existência/ciclo | média |
| D5 | Gate "guardian aprova antes de `implementada`" só em prosa | alta |
| D6 | Auditores com Edit/Write; nenhum agente com mínimo privilégio | alta |
| D7 | Allowlist permite execução arbitrária; deny de rede ilusório; sem proteção de segredos | alta |
| D8 | Sem hooks, sem sandbox, sem policy engine | alta |
| D9 | Distribuição por cópia sem versão detectável | média |
| D10 | Ativação de pack manual, sem proveniência/hash; divergência de licença no `uiux-ui-styling` | média |
| D11 | Pipelines/templates assumem frontend (Contratos→Mocks→Store→UI) | média |
| D12 | Brownfield confunde "observado" com "correto"; proveniência com 3 valores | média |
| D13 | Sem governança de MCP, sem evals, sem observabilidade | média |
| D14 | CI com actions não fixadas, sem `permissions`, gatilho duplo | baixa |
| D15 | Comandos longos, sem progressive disclosure nem evals | baixa |
| D16 | Nomes de ADR inconsistentes entre documentos | baixa |

## 14. Riscos de migração

- **Quebrar projetos v2 já instalados** — mitigação: `sdd.config.md` continua legível; migrador
  automático; comandos antigos continuam respondendo pelo mesmo `/nome`.
- **Parser YAML sem dependência** — o kit é copiado sem `npm install`; um parser de subconjunto
  próprio precisa de erros claros para construções fora do subconjunto (ver ADR-0002).
- **Hooks bloqueando trabalho legítimo** — mitigação: política testada caso a caso, `ask` em vez de
  `deny` onde há dúvida, fail-closed só para ações destrutivas.
- **Dupla execução de hooks** quando o projeto tem o modo cópia **e** o plugin — o doctor detecta.
- **Windows** — sandbox nativo do Claude Code não roda em Windows nativo; política precisa degradar
  com aviso explícito.

## 15. Diagnóstico

| Classe | Itens |
|--------|-------|
| **PRESERVAR** | princípio motor genérico + config por projeto; specs como fonte da verdade; fluxo brief→discovery/auditoria→config→specs→planos→tarefas→agentes→código→testes→guardian; protocolos de raciocínio dos agentes; zero-dependência do core; templates; packs e atribuições; `sdd-lint` como fast path; testes `pytest` dos packs |
| **REFATORAR** | `sdd-lint` em biblioteca reutilizável (mesma saída); agentes com mínimo privilégio e contratos de saída/falha; `settings.json` (allowlist mais estreita + deny de segredos); templates de plano/tarefas guiados pelo pipeline da config; auditoria com OBSERVED/INTENDED/RUNTIME |
| **MIGRAR** | config Markdown → `sdd.config.yaml` + schema (Markdown vira visão gerada); `LEDGER.md` → `events.jsonl` + `state.json` (Markdown vira derivado); comandos → Agent Skills (mesmo `/nome`); motores `GERADOR/DISCOVERY/AUDITORIA` → `references/` das skills (com stubs de compatibilidade); testes → `tests/` |
| **ADICIONAR** | CLI `sdd` (doctor, config, state, spec, tasks, policy, mcp, skills, pack, export, adapters); schemas; policy engine + hooks; sandbox documentado; plugin + marketplace; lockfiles de skills e MCP; perfis MCP; evals determinísticas + Promptfoo opcional; trace local; pack `sdd-ai`; adapters; docs de release |
| **DEPRECAR** | edição manual de `LEDGER-*.md`; checkboxes como fonte de status; ativação de pack por cópia manual; comandos em `.claude/commands/` com procedimento completo (viram wrappers finos) |
| **NÃO IMPLEMENTAR NO CORE** | frameworks de agentes/RAG/memória/serving (PydanticAI, LangGraph, ADK, Agno, Mem0, Letta, Cognee, Graphiti, RAGFlow, vLLM, SGLang, llama.cpp, DSPy, BAML, XGrammar, E2B, NeMo, Garak), Phoenix, ContextForge, Serena, Repomix — viram skills de arquitetura, perfis ou integrações opcionais |
