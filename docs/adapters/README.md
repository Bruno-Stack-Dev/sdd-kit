# Adapters para outros clientes

O SDD Kit é feito para o Claude Code, mas specs, config, estado e CLI são agnósticos de cliente.
`sdd adapters build` leva as **skills** e as **instruções do projeto** para clientes que seguem o
padrão aberto [Agent Skills](https://agentskills.io/specification) e/ou `AGENTS.md`.

> Caminhos de cada cliente conferidos na documentação oficial em 2026-09-23 — ver
> [`docs/references/integrations-snapshot.md`](../references/integrations-snapshot.md). Clientes
> mudam; confira de novo antes de depender de um caminho.

## Uso

```bash
node scripts/sdd.mjs adapters build codex            # revisão: gera em .sdd/adapters/codex/ (não versionado)
node scripts/sdd.mjs adapters build codex --install  # escreve nos caminhos do cliente no projeto
node scripts/sdd.mjs adapters build cline --install --packs ai   # inclui skills de um pack do motor
node scripts/sdd.mjs adapters status                 # adapters instalados e se estão em dia
```

Requer o kit em **modo cópia** (`sdd init --mode copy`): os outros clientes não carregam o plugin do
Claude Code, então a CLI precisa estar em `scripts/sdd.mjs` no projeto.

| Alvo | Skills | Instruções | Observação |
|------|--------|------------|------------|
| `codex` | `.agents/skills/` | `AGENTS.md` | o adapter avisa se o `AGENTS.md` passar de 32 KiB (limite padrão do Codex) |
| `opencode` | `.opencode/skills/` | `AGENTS.md` | o OpenCode também lê `.claude/skills/` — ver "Duplicidade" |
| `cline` | `.cline/skills/` | `.clinerules/sdd-kit.md` | o Cline também lê `.claude/skills/` — ver "Duplicidade" |
| `generic` | `skills/` | `AGENTS.md` | para qualquer cliente com Agent Skills; copie para onde ele procura |

## O que a conversão faz

1. **Frontmatter só com campos da spec** (`name`, `description`, `license`, `compatibility`,
   `metadata`, `allowed-tools`). Os campos exclusivos do Claude Code (`disable-model-invocation`,
   `argument-hint`, `model`, `context`, `hooks`…) saem e ficam listados em
   `metadata.sdd-claude-only`. Valores entre aspas duplas (válidos para parsers YAML estritos).
2. **`disable-model-invocation: true` vira instrução** no topo do corpo: "execução só a pedido
   explícito do usuário". Não há garantia de cliente — é o limite honesto da portabilidade.
3. **CLI**: `node "${CLAUDE_SKILL_DIR}/../../../scripts/sdd.mjs"` vira `node scripts/sdd.mjs`
   (relativo à raiz do projeto). `$ARGUMENTS` vira `ARGUMENTOS`, com nota explicando.
4. **Papéis `@agente-*`**: sem subagentes do Claude Code, a skill ganha nota para seguir o arquivo
   `.claude/agents/<agente>.md` como checklist; o bloco de instruções lista os papéis.
5. **Apoio** (`_template-skill.md`, `_arch-templates/`, `_ai-templates/`, `_ai-references/`) viaja
   junto, para os links relativos continuarem válidos.
6. **Manifesto** `.sdd-adapter.json` na pasta de skills do cliente registra origem, hash e campos
   removidos. O `sdd doctor` (modos `skills`/`full`) avisa quando a skill de origem mudou e o adapter
   ficou desatualizado.

## Instruções do projeto (AGENTS.md / .clinerules)

O bloco entre `<!-- SDD-KIT:BEGIN ... -->` e `<!-- SDD-KIT:END -->` é regenerado a cada build; o que
estiver fora dele é preservado. Contém: regras de trabalho do SDD, comandos de teste, regras
inegociáveis, padrões proibidos e gates humanos **da config do projeto**, guardrails, lista de
skills e de papéis.

## O que NÃO viaja (limites de garantia)

| No Claude Code | Nos outros clientes |
|----------------|---------------------|
| Hooks `PreToolUse` bloqueiam segredo, estado, arquivos gerados e git destrutivo | **só instrução** no `AGENTS.md`; confira com `sdd policy check --command "<cmd>"` |
| `PostToolUse` valida config/specs após cada edição | rode `sdd doctor --fast` antes de concluir |
| allow/deny do `settings.json` | configure as permissões do próprio cliente |
| Subagentes com ferramentas restritas (auditores somente leitura) | papéis viram checklists; sem isolamento de ferramentas |
| Sandbox do Claude Code | use o isolamento do próprio cliente, se houver |

O que continua **determinístico** em qualquer cliente é a CLI: IDs, estado por eventos, gate do
guardião (o estado recusa `SPEC_IMPLEMENTED` sem `GUARDIAN_APPROVED`), doctor e evals.

## Duplicidade (OpenCode e Cline)

OpenCode e Cline também leem `.claude/skills/` nativamente. Com o adapter instalado, a mesma skill
pode aparecer duas vezes — e a cópia de `.claude/skills/` traz a CLI por `${CLAUDE_SKILL_DIR}`, que
só o Claude Code resolve. Opções: (a) se o time usa **só** esse cliente, instale o adapter e
desconsidere as de `.claude/skills/`; (b) se o time usa Claude Code **e** o outro cliente, verifique
na documentação atual do cliente se há como desabilitar a leitura de `.claude/skills/`
(**NÃO VERIFICADO** por este kit) ou aceite a duplicidade sabendo qual cópia é a portável.
