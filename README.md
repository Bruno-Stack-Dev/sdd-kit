# SDD Kit — Spec-Driven Development portátil

Um kit autocontido para rodar **Spec-Driven Development** (brief → specs → código) em
**qualquer projeto**, com geração automática de specs, agentes especializados e comandos do
Claude Code. O motor é **genérico**; tudo que é específico do seu projeto mora num único
arquivo: `sdd.config.md`.

> **Primeira vez?** Comece pelo **`SETUP.md`** — pré-requisitos (Claude Code, Node), como copiar
> o kit para a raiz e como rodar o `/sdd-init`.

```
sdd-kit/
├── README.md                  ← você está aqui
├── SETUP.md                   ← instalação e primeiro uso (comece por aqui)
├── sdd.config.example.md      ← modelo da configuração do projeto
├── specs/                     ← a "fonte da verdade" (specs, planos, tarefas, ADRs)
│   ├── _gerador/GERADOR.md    ← o MOTOR (pipeline brief→specs→código), genérico
│   ├── _gerador/DISCOVERY.md  ← entrevista de projeto NOVO (blocos temáticos), genérico
│   ├── _gerador/AUDITORIA.md  ← engenharia reversa de projeto EXISTENTE (código→docs), genérico
│   ├── _entrada/              ← onde você larga o brief do projeto
│   ├── _templates/            ← templates de spec/plano/tarefas/ADR + discovery (visão, DER, C4, API, RBAC, backlog, infra)
│   ├── discovery/             ← documentação técnica gerada para projetos novos
│   └── features|plans|tasks|decisions|architecture|apis|archive/
├── .claude/
│   ├── commands/              ← /sdd-init /gerar-projeto /gerar-skills /nova-spec ...
│   ├── agents/                ← 12 agentes genéricos com protocolo de raciocínio (leem sdd.config.md)
│   ├── skills/                ← skills: sob medida + ds-* (design system) + arch-* (arquitetura) + uiux-* (UI/UX)
│   └── settings.json          ← allowlist portátil (+ settings.example.python/go.json)
└── scripts/sdd-lint.mjs       ← linter de frontmatter das specs + seções críticas da config
```

## Como instalar num projeto novo (3 passos)

1. **Copie** o conteúdo de `sdd-kit/` para a **raiz** do projeto destino:
   - `specs/`, `.claude/` e `scripts/` vão para a raiz;
   - `sdd.config.example.md` também.
2. **Rode `/sdd-init`** no Claude Code. Ele confirma que está na raiz certa, detecta se o
   projeto é **novo** ou **já em produção** e roteia:
   - **Já em produção:** engenharia reversa do repositório (stack, DER, C4, endpoints, RBAC, infra) → reconstrói toda a documentação em `specs/discovery/` com proveniência por fato, gera ADRs retroativos, um relatório de divergências (código prevalece) e o `sdd.config.md`.
   - **Novo:** entrevista de **discovery em blocos** (produto → dados → arquitetura/stack → planejamento → infra) → gera toda a documentação técnica em `specs/discovery/`, os ADRs, o `sdd.config.md`, o `CLAUDE.md` e um brief pronto em `specs/_entrada/`.
3. Pronto. Para incrementos, coloque um brief em `specs/_entrada/` e rode **`/gerar-projeto`**.

> Sem o `/sdd-init`? Faça manual: copie `sdd.config.example.md` → `sdd.config.md`, preencha,
> e cole o bloco abaixo no `CLAUDE.md`.

## Bloco para colar no `CLAUDE.md` do projeto

```markdown
## Spec-Driven Development (SDD Kit)

Este projeto usa o SDD Kit em `specs/` + `.claude/`. **Antes de qualquer tarefa, leia
`sdd.config.md`** (raiz) — ele declara a stack, os paths, as regras inegociáveis e os
padrões proibidos DESTE projeto. O motor em `specs/_gerador/GERADOR.md` é genérico e lê
essa config; não duplique regras de projeto dentro do motor.

- Todo trabalho deriva de uma spec em `specs/`. Sem spec → `/nova-spec` antes de codar.
- Projeto ou módulo novo: coloque **um** brief `.md` em `specs/_entrada/` e rode `/gerar-projeto`.
- Comandos: `/sdd-init` · `/sdd-status` · `/gerar-projeto` · `/gerar-skills` · `/nova-spec` · `/implementar-spec`
  · `/implementar-tarefa` · `/validar-e2e`
- Cada tarefa em `specs/tasks/` é atribuída a um `@agente-*` (ver `.claude/README.md`).
- Não avance com a suíte de testes vermelha; não marque spec como `implementada` sem o
  `@agente-spec-guardian` aprovar (greps de ausência = 0).
```

## Os comandos

| Comando | O que faz |
|---------|-----------|
| `/sdd-init` | Bootstrap **inteligente**: confirma o diretório, detecta projeto novo × em produção, e roteia. Projeto novo → entrevista de discovery em blocos e gera toda a documentação técnica; existente → **engenharia reversa** do código para reconstruir a documentação + `sdd.config.md`, perguntando só o que o código não revela |
| `/sdd-status` | Dashboard: varre o frontmatter das specs e mostra status, CAs e pendências |
| `/gerar-projeto` | Roda o motor inteiro para o brief em `specs/_entrada/` |
| `/gerar-skills` | Gera skills sob medida do projeto (domínio, integração, banco) a partir do discovery |
| `/nova-spec` | Cria uma spec avulsa a partir do template |
| `/implementar-spec` | Implementa uma spec de ponta a ponta (camadas da config) |
| `/implementar-tarefa` | Implementa uma tarefa `T-XXX` do board |
| `/validar-e2e` | Roda os testes e2e |

## Princípio de design

**Motor genérico, configuração por projeto.** Se você se pegar editando `GERADOR.md` ou um
agente para mencionar uma tecnologia/regra específica do seu produto, pare: esse fato pertence
ao `sdd.config.md`. Assim o mesmo kit serve para um SaaS Vue, uma CLI Go ou uma API Python sem
fork do motor.

Ver também: `specs/README.md` (estrutura das specs) e `.claude/README.md` (agentes).

## Licença

O material **próprio** do kit — o motor em `specs/_gerador/`, os 12 agentes, os 8 comandos, os
14 templates e os scripts em `scripts/` — é licenciado sob **MIT** (ver `LICENSE`).

Os três **packs** de skills vendorizados mantêm as licenças e a atribuição dos seus próprios
arquivos `ATTRIBUTION.md`: `arch-*` (software-architecture-pack), `ds-*` (design-system pack) e
`uiux-*`. A licença MIT acima **não** os cobre — consulte o `ATTRIBUTION.md` de cada pack.
