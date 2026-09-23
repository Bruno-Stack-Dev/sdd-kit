# SETUP — Instalação e primeiro uso do SDD Kit

Guia rápido para sair do zero até rodar o `/sdd-init`. Se você já usa o Claude Code no terminal
ou na IDE, pule direto para o **Passo 2**.

---

## Pré-requisitos

- **Claude Code** instalado e autenticado. É a ferramenta que interpreta os slash commands
  (`/sdd-init` etc.) deste kit. Guia oficial de instalação e requisitos (Node.js, sistemas
  suportados): https://docs.claude.com/en/docs/claude-code/overview
  - Pacote npm: https://www.npmjs.com/package/@anthropic-ai/claude-code
  - Confirme que funciona rodando `claude --version` no terminal, dentro de qualquer pasta.
- **Node.js 20+** — a CLI do kit (`scripts/sdd.mjs`) roda só com a biblioteca padrão do Node, sem
  `npm install`. Confira com `node --version`.
- **Git** (recomendado, não obrigatório) — para versionar `specs/` junto do código.

> Não precisa de banco, Docker ou qualquer serviço para **começar**. O discovery de projeto
> novo roda só com o kit e o Claude Code.

---

## Passo 1 — Ter um projeto (ou uma pasta vazia)

Você pode usar o kit em dois pontos de partida:

- **Projeto novo:** crie uma pasta vazia (`mkdir meu-projeto`). Nada mais é necessário.
- **Projeto existente:** use a raiz do repositório que já roda.

Em ambos, **abrir o Claude Code nessa pasta** é o que importa (`cd meu-projeto && claude`).

---

## Passo 2 — Instalar o kit no projeto (plugin ou cópia)

Há dois modos. Os dois usam os mesmos agentes, skills, hooks e CLI; muda **onde o motor mora**.

### Modo plugin (recomendado para projetos novos)

O motor fica no plugin do Claude Code; o projeto guarda só o que é dele (`sdd.config.yaml`,
`specs/`, `.sdd/`, `CLAUDE.md`, `.claude/settings.json`). Atualizar o motor = atualizar o plugin.

```bash
# 1) com um clone do kit em qualquer lugar, prepare o projeto:
node caminho/para/sdd-kit/scripts/sdd.mjs init --mode plugin --root .
```

```
# 2) no Claude Code, dentro do projeto:
/plugin marketplace add Bruno-Stack-Dev/sdd-kit
/plugin install sdd-kit@sdd-kit
```

O `init` já grava no `.claude/settings.json` do projeto a referência ao marketplace e ao plugin
(`extraKnownMarketplaces` + `enabledPlugins`), então o resto do time recebe o plugin ao abrir o
projeto. No modo plugin, os workflows aparecem com o prefixo do plugin (ex.: `/sdd-kit:sdd-init`) e
o comando exato da CLI é informado no início de cada sessão.

### Modo cópia (compatível com o v2)

O motor é copiado para o projeto — como no v2, mas sem cópia manual:

```bash
node caminho/para/sdd-kit/scripts/sdd.mjs init --mode copy --root .
```

Para atualizar depois (com backup de tudo que for sobrescrito em `.sdd/backup/`):

```bash
node caminho/para/sdd-kit-novo/scripts/sdd.mjs upgrade --root .
```

> **Projeto já instalado com o kit v2?** Rode o `upgrade` acima e depois
> `node scripts/sdd.mjs config migrate` e `node scripts/sdd.mjs state import-ledger <LEDGER>`.
> Passo a passo em `MIGRATION.md`.

Confira a instalação:

```bash
node scripts/sdd.mjs version        # modo cópia (no modo plugin, use o caminho do plugin)
```

---

## Passo 3 — Rodar o `/sdd-init`

No Claude Code, dentro da pasta do projeto:

```
/sdd-init
```

Ele vai, nesta ordem:
1. **Confirmar o diretório** (mostra `pwd`, checa a âncora do kit e pergunta se é a raiz certa).
2. **Detectar** se o projeto é **novo** ou **já em produção**, com evidência, e confirmar com você.
3. **Rotear:**
   - **Novo** → entrevista de **discovery em blocos** (produto → dados → arquitetura/stack →
     planejamento → infra, e o bloco de IA se o produto usar IA) e, ao fim, gera
     `specs/discovery/`, ADRs, `sdd.config.yaml` (+ a visão `sdd.config.md`), `CLAUDE.md` e um brief
     em `specs/_entrada/`.
   - **Existente** → **engenharia reversa** do código: reconstrói a documentação com proveniência
     por fato, pergunta só o que o código não revela e registra divergências separando o que existe
     (OBSERVED), o que deveria existir (INTENDED) e o que roda de fato (RUNTIME).
4. **Fechar**: comandos permitidos no `settings.json`, packs opcionais, perfil MCP, LSP e sandbox —
   sempre com a sua confirmação.

### Sem usar o slash command?

O `/sdd-init` é uma skill: o roteiro está em `.claude/skills/sdd-init/SKILL.md` e nas referências
ao lado. Se o comando não aparecer, peça no chat:

> "Leia `.claude/skills/sdd-init/SKILL.md` e siga-o."

---

## Passo 4 — Validar

```bash
node scripts/sdd.mjs config validate   # sdd.config.yaml contra o schema (+ checagens semânticas)
node scripts/sdd.mjs doctor --fast     # saúde rápida: config, specs, grafo de tarefas, estado, agentes
node scripts/sdd.mjs doctor --full     # tudo: + ADRs, padrões proibidos, segurança, skills, MCP
node scripts/sdd-lint.mjs              # fast path legado: specs/discovery + config + .claude/
```

> Após o `/sdd-init`, a validação falha se `forbidden_patterns` (padrões proibidos) ou
> `human_gates` (gates) ficarem com placeholders (`<TODO>`/`<ex.: ...>`). Resolva com valores reais
> ou use `[]` quando não se aplicam.

> O doctor devolve `READY`, `READY_WITH_WARNINGS` ou `NOT_READY` (exit 1). Integrações opcionais
> ausentes (scanners, Promptfoo, LSP) aparecem como `NOT_RUN` — não bloqueiam.

> O linter agora cobre também o diretório **`.claude/`**: cada skill (`name` igual ao diretório,
> `description` presente com 40–1024 chars e `references:` existentes), cada agente (`name` igual
> ao arquivo e `description` presente) e cada comando (`description` no frontmatter). Além disso,
> qualquer caminho `.claude/skills/<algo>` citado em arquivos `.md`/`.py`/`.cjs`/`.mjs`/`.json`
> que não exista no disco é reportado como erro — pega links internos que ficaram para trás.

O repositório do kit também tem a própria suíte de testes (zero-dep, `node:test`, Node ≥ 22). Ela
fica em `tests/` e **não** é copiada para os projetos:

```bash
node --test "tests/**/*.test.mjs"
```

Depois disso: `/sdd-status` para ver o painel, `/gerar-projeto` para o pipeline (projeto novo),
ou `/nova-spec` para um incremento. Referência de comandos e agentes: `README.md` e `.claude/README.md`.

---

## Passo 5 — Opcionais (quando fizer sentido)

| Recurso | Comando | Documentação |
|---------|---------|--------------|
| Packs (`arch`, `ds`, `uiux`, `ai`) | `sdd pack list` · `sdd pack activate <pack>` | [`.claude/skills/README.md`](.claude/skills/README.md) |
| MCP por perfil | `sdd mcp profiles` · `sdd mcp apply <perfil>` | [`docs/mcp/README.md`](docs/mcp/README.md) |
| Sandbox (macOS/Linux/WSL2) | `sdd security sandbox --enable` | [`docs/security/sandbox.md`](docs/security/sandbox.md) |
| Code intelligence | `sdd lsp detect` | [`docs/architecture/code-intelligence.md`](docs/architecture/code-intelligence.md) |
| Trace e OTLP | `sdd trace show` · `sdd trace export --otlp <url>` | [`docs/observability.md`](docs/observability.md) |
| Pacote de contexto | `/sdd-export-context` ou `sdd export-context --dry-run` | [ADR-0018](docs/adr/ADR-0018-export-context-sanitizado.md) |

---

## Outros clientes (Codex, OpenCode, Cline)

Com o kit em modo cópia, exporte skills e instruções para o cliente do time:

```bash
node scripts/sdd.mjs adapters build codex --install   # ou opencode | cline | generic
```

As skills saem no padrão aberto Agent Skills (sem campos exclusivos do Claude Code) e o
`AGENTS.md` (ou `.clinerules/`) recebe as regras da config. Hooks e permissões do Claude Code **não**
viajam: nesses clientes os guardrails viram instrução, e a CLI continua determinística. Detalhes e
limites em [`docs/adapters/README.md`](docs/adapters/README.md).

---

## Solução de problemas

| Sintoma | Causa provável | O que fazer |
|---------|----------------|-------------|
| `/sdd-init` não aparece | Plugin não instalado (modo plugin) ou `.claude/skills/` ausente (modo cópia) | Confira o Passo 2; reabra o Claude Code na pasta. No modo plugin o nome é `/sdd-kit:sdd-init` |
| "kit aninhado" no Passo A | Copiou a pasta `sdd-kit` inteira | Use `sdd init --mode copy --root <projeto>` em vez de copiar à mão |
| `node: command not found` | Node.js não instalado | Instale Node 20+ |
| `claude: command not found` | Claude Code não instalado/no PATH | Ver https://docs.claude.com/en/docs/claude-code/overview |
| Comandos pedem confirmação a cada passo | Allowlist não aplicado | Confirme o `.claude/settings.json`; o `/sdd-init` adiciona os comandos reais do projeto |
| Um comando foi bloqueado pelo hook | Política do kit (segredo, git destrutivo, log de eventos...) | `sdd policy check --command "<cmd>"` explica a regra; não remova hooks nem `deny` |
| `evento recusado` na CLI | Transição inválida (ex.: fechar spec sem guardião) | Leia a mensagem; `sdd state show` e `sdd tasks ready` mostram o que falta |
| `doctor` com `NOT_READY` | Falha real em config, specs, estado ou segurança | `sdd doctor --full --verbose` lista cada item e como corrigir |
