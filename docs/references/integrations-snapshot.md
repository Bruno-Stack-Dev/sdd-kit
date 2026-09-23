# Snapshot de integrações externas (verificado em 2026-09-23)

> Registro datado do que foi conferido na documentação/registries antes de integrar cada ferramenta
> (regra do plano v3: "leia README, confira licença, release e runtime; não copie comandos
> cegamente"). **Reverifique antes de atualizar uma versão fixada.** Nada aqui é dependência do
> core: todas são integrações opcionais, degradáveis para `NOT_RUN`.

## Claude Code (docs oficiais: code.claude.com/docs)

- **Plugin (`.claude-plugin/plugin.json`)**: só `name` é obrigatório. `commands` e `agents` com
  caminho próprio **substituem** os diretórios padrão; `skills` **soma** ao padrão; `hooks`,
  `mcpServers`, `lspServers` **mesclam**. Caminhos começam com `./`. `version` controla a detecção
  de update.
- **Marketplace (`.claude-plugin/marketplace.json`)**: `name`, `owner`, `plugins[]`; `source` pode
  ser subdiretório relativo do mesmo repo. Instalação: `/plugin marketplace add owner/repo` e
  `/plugin install <plugin>@<marketplace>`.
- **Variáveis**: `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}`, `${CLAUDE_PROJECT_DIR}` expandem
  em hooks e configs MCP. Expansão dentro do Markdown de skills **não é documentada** — por isso o
  kit informa o caminho do motor ao modelo via `SessionStart` (`additionalContext`).
- **Hooks**: `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`,
  `PostToolUseFailure`, `PermissionRequest`, `Stop`, `SubagentStart`, `SubagentStop`, entre outros.
  `PreToolUse` recebe `tool_name`, `tool_input`, `cwd`, `session_id`, `permission_mode` e, quando a
  chamada vem de subagente, `agent_id`/`agent_type`. Saída: `hookSpecificOutput.permissionDecision`
  (`allow`/`deny`/`ask`) + `permissionDecisionReason`; exit 2 bloqueia; outros códigos ≠ 0 não
  bloqueiam. Hooks de plugin **e** de settings rodam ambos. No Windows, hooks usam Git Bash por padrão.
- **Skills (Claude Code)**: aceitam `disable-model-invocation`, `user-invocable`, `allowed-tools`,
  `argument-hint`, `model`, `context: fork`, `agent`, `paths`, `when_to_use`; limite de 1.536 chars
  para `description` + `when_to_use`; `$ARGUMENTS` no corpo.
- **Subagentes**: `tools`, `disallowedTools`, `model`, `permissionMode`
  (`default|acceptEdits|auto|dontAsk|bypassPermissions|plan`), `skills`, `memory`
  (`user|project|local`), `mcpServers`, `hooks`, `maxTurns`, `isolation: worktree`. Existe a
  ferramenta `LSP`.
- **Sandbox**: `sandbox.enabled`, `failIfUnavailable`, `autoAllowBashIfSandboxed`,
  `excludedCommands`, `filesystem.{allowWrite,denyRead,denyWrite}`, `network.{allowedDomains,
  deniedDomains}`. Suportado em macOS, Linux (bubblewrap) e WSL2; **não** em Windows nativo.
- **LSP oficial** (`/plugin install <x>@claude-plugins-official`): `typescript-lsp`
  (`typescript-language-server`), `pyright-lsp` (`pyright-langserver`), `gopls-lsp` (`gopls`),
  `rust-analyzer-lsp`, `csharp-lsp` (`csharp-ls`), `jdtls-lsp`, `clangd-lsp`, `kotlin-lsp`,
  `lua-lsp`, `php-lsp` (`intelephense`), `swift-lsp`.

## Agent Skills (agentskills.io/specification)

- Campos permitidos: `name`, `description` (obrigatórios); `license`, `compatibility` (≤500),
  `metadata` (mapa string→string), `allowed-tools` (experimental). O validador de referência
  (`skills-ref`, Apache-2.0, "demonstration purposes only") **rejeita campos desconhecidos**.
- `name`: 1–64, `[a-z0-9-]`, sem hífen no início/fim, sem `--`, igual ao diretório.
- `description`: 1–1024. SKILL.md recomendado < 500 linhas.
- Evals (anthropics/skills `skill-creator`): `evals/evals.json` =
  `{ skill_name, evals: [{ id, prompt, expected_output, files?, expectations? }] }`.

## Ferramentas opcionais

| Ferramenta | Pacote / versão | Licença | Invocação relevante | Ressalvas |
|------------|-----------------|---------|---------------------|-----------|
| Cisco Skill Scanner | PyPI `cisco-ai-skill-scanner` 2.1.0 | Apache-2.0 | `skill-scanner scan-all <dir> -r --format json` | analisadores padrão offline; LLM/VirusTotal/AIDefense são opt-in com chave; "sem achados não garante segurança" |
| Snyk Agent Scan | PyPI `snyk-agent-scan` 0.6.4 | Apache-2.0 | `uvx snyk-agent-scan@0.6.4 scan <path> --json` | **inicia servidores MCP stdio**, envia configs/skills à API da Snyk, exige `SNYK_TOKEN`; schema JSON muda entre versões |
| Promptfoo | npm `promptfoo` 0.123.1 | MIT | `npx promptfoo@0.123.1 eval -c <cfg> --no-cache -o results.json` | provider `anthropic:claude-agent-sdk` exige `@anthropic-ai/claude-agent-sdk` + `ANTHROPIC_API_KEY`; telemetria ligada por padrão (`PROMPTFOO_DISABLE_TELEMETRY=1`) |
| Context7 MCP | npm `@upstash/context7-mcp` 4.1.1 | MIT | `npx -y @upstash/context7-mcp@4.1.1` | API key opcional (`CONTEXT7_API_KEY`); consulta serviço externo |
| Playwright MCP | npm `@playwright/mcp` 0.0.82 | Apache-2.0 | `npx @playwright/mcp@0.0.82 --headless --isolated` | `--allowed-origins` **não é fronteira de segurança**; trace via `--caps=devtools` |
| MCP Inspector | npm `@modelcontextprotocol/inspector` 2.7.0 | MIT | `npx --yes @modelcontextprotocol/inspector@2.7.0 --cli <cmd> --method tools/list --format json` | exige Node ≥ 22.19; executa o servidor inspecionado |
| Repomix | npm `repomix` 1.18.1 | MIT | `npx repomix@1.18.1 -o out.md --style markdown` | respeita `.gitignore`; Secretlint ligado por padrão |
| ContextForge | PyPI `mcp-contextforge-gateway` 1.0.10 | Apache-2.0 | `mcpgateway` (porta 4444) / Docker / Helm | gateway com banco (SQLite/Postgres/Redis): custo operacional real |

## Outros clientes (adapters)

- **Codex CLI**: skills em `.agents/skills/` (repo) e `~/.agents/skills`; instruções em `AGENTS.md`
  (limite padrão 32 KiB).
- **OpenCode**: lê `.opencode/skills`, `.agents/skills` **e `.claude/skills` nativamente**; regras em
  `AGENTS.md` (fallback `CLAUDE.md`); agentes em `.opencode/agents/`.
- **Cline**: regras em `.clinerules/`; skills em `.cline/skills/`, `.clinerules/skills/` e
  `.claude/skills/`; detecta `AGENTS.md`.

## GitHub Actions (SHAs fixados)

| Action | Tag | SHA |
|--------|-----|-----|
| actions/checkout | v4.4.0 | `11d5960a326750d5838078e36cf38b85af677262` |
| actions/setup-node | v4.4.0 | `49933ea5288caeca8642d1e84afbd3f7d6820020` |
| actions/setup-python | v5.6.0 | `a26af69be951a213d495a4c3e4e4022e16d87065` |

As majors v5–v7 já existem; o CI fixa as linhas que o kit já usava (v4/v5) por SHA, para não misturar
atualização de major com a migração v3. Atualizar é uma mudança separada.
