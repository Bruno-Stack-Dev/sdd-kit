---
description: Bootstrap inteligente: confirma o diretório, detecta projeto novo × em produção e roteia (discovery ou engenharia reversa).
---

# /sdd-init

Bootstrap **inteligente** do SDD Kit. Confirma o diretório, detecta se o projeto é novo ou já
está em produção, e roteia para o fluxo certo. É o único comando que você precisa rodar para
começar — em projeto novo ou existente.

## Passo A — Confirmar o diretório de trabalho

1. Rode `pwd` e liste a raiz (arquivos e pastas de topo).
2. **Verifique a âncora do kit:** confirme que existem, a partir daqui, `specs/_gerador/`,
   `.claude/` e `scripts/sdd-lint.mjs`. Se estiverem um nível abaixo (ex.: `./sdd-kit/`), o kit
   **não** está na raiz do projeto.
3. Mostre ao usuário o diretório detectado e **pergunte se é a raiz do projeto-alvo**:
   - **Sim** → siga para o Passo B.
   - **Não / kit aninhado** → **pare** e instrua: "Cole o conteúdo de `specs/`, `.claude/`,
     `scripts/` e `sdd.config.example.md` na **raiz** do projeto-alvo e rode `/sdd-init` de novo."
     Não tente mover arquivos você mesmo.

## Passo B — Detectar novo × existente

Analise **brevemente** a raiz para classificar (não implemente nada aqui):

- **Sinais de projeto já em produção/rodando:** código de aplicação (`src/`, `app/`, `cmd/`,
  `packages/` com fonte), manifestos com dependências reais (`package.json`, `go.mod`,
  `pyproject.toml`, `pom.xml`), lockfiles, `Dockerfile`/CI, testes existentes, histórico git
  com commits de app.
- **Sinais de projeto novo:** só o kit + talvez um README/manifesto vazio; sem código de app;
  sem lockfile; repositório recém-criado.

Mostre o veredito com a evidência (2–3 itens) e **confirme com o usuário**:
_"Detectei um projeto **[novo | já em andamento]** — confere?"_ Respeite a correção dele.

- Se `sdd.config.md` **já existe** na raiz: avise e pergunte se é para **sobrescrever**. Sem
  confirmação, não sobrescreva — apenas atualize o que faltar.

## Passo C-existente — Projeto já rodando (engenharia reversa)

Objetivo: **usar tudo que o código já contém** para reconstruir a documentação técnica completa,
perguntando ao usuário **apenas** o que o código não revela. **Leia e execute
`specs/_gerador/AUDITORIA.md` por completo.**

O motor de auditoria:
1. **Varre o repositório** (inventário: stack, scripts reais, layout, infra, config).
2. **Extrai por domínio**, espelhando os blocos do discovery, com **o código como fonte primária**
   e proveniência por fato (`[código]`/`[inferido]`/`[usuário]`): entidades e DER dos models,
   endpoints das rotas, RBAC dos middlewares de auth, C4 da topologia, infra do Dockerfile/CI.
3. **Só pergunta o "porquê"** que o código não carrega: problema, personas, quem paga,
   diferencial, fronteira do MVP, roadmap e regras de negócio implícitas.
4. **Divergência código × usuário → o código prevalece**, e a diferença é registrada em
   `specs/discovery/AUDITORIA-DIVERGENCIAS.md` (nunca corrigida em silêncio).

Ao final, gera os mesmos artefatos do fluxo novo em `specs/discovery/` (com proveniência),
**ADRs retroativos** para as decisões arquiteturais encontradas, o relatório de divergências e
dívidas conhecidas, o `sdd.config.md` (com os **comandos de teste reais**) e conecta o `CLAUDE.md`.

> Daqui pra frente é o fluxo normal: brief em `specs/_entrada/` → `/gerar-projeto`, ou `/nova-spec`.

## Passo C-novo — Projeto novo (discovery completo)

Objetivo: construir toda a base do software do zero. **Leia e execute
`specs/_gerador/DISCOVERY.md` por completo** — ele conduz a entrevista **em blocos temáticos**
(Produto/Requisitos → Dados → Arquitetura/Stack/API/Segurança → Planejamento → Infra) e, ao
final, gera:

- `specs/discovery/` — Visão, Requisitos, Fluxos, Modelo de Dados, Arquitetura (C4), API, RBAC,
  Backlog e Infra (templates `template-*` correspondentes);
- **ADRs** para as decisões arquiteturais tomadas (`specs/decisions/`);
- **`sdd.config.md`** preenchido na raiz;
- **`CLAUDE.md`** com o bloco do SDD + seção Discovery;
- um **brief consolidado** em `specs/_entrada/` pronto para o `/gerar-projeto`.

Conduza um bloco por mensagem, pré-preenchendo o que der para inferir. Não trave o usuário em
itens opcionais (use default + `<TODO>`), mas não invente fatos de produto.

## Fechamento (ambos os fluxos)

**Ajuste o allowlist à stack.** O `.claude/settings.json` vem com um piso genérico (Node +
git seguro). A partir dos comandos reais da config (seção 2) e da stack de backend, **adicione
ao `allow`** os binários que o projeto usa que ainda não estão lá — ex.: `Bash(pytest:*)`,
`Bash(poetry:*)` para Python; `Bash(go test:*)`, `Bash(go build:*)` para Go; runner de
migrations do projeto. Use `.claude/settings.example.python.json` e `settings.example.go.json`
como referência. Não remova as entradas de `deny`. Se um comando da config não estiver no
allowlist, o motor não conseguirá validá-lo. As skills `uiux-*` executam um `search.py`, então
`python`/`python3` já vêm no allowlist genérico — confirme que continuam lá.

**Decida sobre os packs vendorizados (`.claude/skills/_packs/`).** Os três packs (`arch`, `ds`,
`uiux`) vêm prontos mas ficam **inativos** por padrão, guardados em `_packs/` (ignorados até
ativação). **Ativar = copiar** `_packs/<pack>/` para `.claude/skills/`; **desativar = apagar** a
cópia (o original em `_packs/` permanece intacto). As pastas de notas do pack (`_knowledge-notes`,
`_arch-templates`) viajam junto na cópia, então as referências internas continuam válidas. Avalie
cada pack com o usuário:

- **`ds` — Design System Ops (44 skills):** ative só se o projeto tem/mantém um design system
  (tokens, biblioteca de componentes, temas). Ao ativar, preencha a **seção 12** da config
  (identidade/severidade/gates). Se não tiver DS, deixe inativo e avise que pode ser ligado depois.
- **`uiux` — UI/UX Pro Max (7 skills):** ative se o projeto tem trabalho de UI/design. Requer
  `python`/`python3` no allowlist (já genérico) para o `search.py`.
- **`arch` — software-architecture (14 skills):** ative se for usar o raciocínio de arquitetura
  (opções, tradeoffs, views). **Atenção:** a cadeia de arquitetura do Bloco 3 do `DISCOVERY.md`
  cita as skills `arch-*` — se for conduzir esse bloco, ative o pack `arch` antes.

Nunca **remova** um pack de `_packs/` — apenas ative/desative a cópia em `.claude/skills/`.

Rode `node scripts/sdd-lint.mjs`, reporte os arquivos criados e os `<TODO>` pendentes, e aponte
o próximo passo: `/sdd-status`, `/gerar-skills`, `/gerar-projeto` (novo) ou `/nova-spec` (incremento).
