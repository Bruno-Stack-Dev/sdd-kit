---
adr-id: ADR-0017
titulo: Adapters geram skills no padrão aberto e AGENTS.md; garantias do Claude Code não são simuladas
status: aceito
data: 2026-09-23
---

# ADR-0017: Adapters para Codex, OpenCode, Cline e clientes genéricos

## Contexto
Times usam mais de um cliente de agente. Specs, config, estado por eventos e CLI já são agnósticos;
as skills do kit, porém, usam extensões do Claude Code (`disable-model-invocation`,
`argument-hint`, `${CLAUDE_SKILL_DIR}`, `$ARGUMENTS`, subagentes `@agente-*`) e os guardrails
dependem de hooks e permissões do Claude Code.

## Decisão
- `sdd adapters build <codex|opencode|cline|generic>` exporta as skills ativas (e, com `--packs`,
  as de packs do motor) com frontmatter **só de campos da spec Agent Skills**, registrando os campos
  removidos em `metadata.sdd-claude-only`; troca a CLI por `node scripts/sdd.mjs`; converte
  `disable-model-invocation` em instrução explícita; leva os arquivos de apoio (`_*`).
- Instruções do projeto num bloco delimitado de `AGENTS.md` (ou `.clinerules/sdd-kit.md`),
  regenerado a cada build e preservando o resto do arquivo; conteúdo derivado da config (regras,
  padrões proibidos, gates, comandos) — nada hardcoded de domínio.
- Padrão: gera em `.sdd/adapters/<alvo>/` para revisão; `--install` escreve nos caminhos nativos e
  recusa sobrescrever skill que não veio de um adapter anterior (manifesto `.sdd-adapter.json`).
- O manifesto guarda o hash da origem; `sdd adapters status` e o doctor avisam adapter
  desatualizado.
- Exige modo cópia (a CLI precisa estar no projeto). Modo plugin é recusado com mensagem.
- **Não simulamos garantias**: a documentação explicita que hooks, allow/deny, subagentes com
  ferramentas restritas e sandbox não viajam; o que permanece determinístico é a CLI (IDs, estado,
  gate do guardião, doctor, evals).

## Alternativas consideradas
- **Manter só `.claude/skills/`** (OpenCode e Cline leem nativamente) — insuficiente: Codex não lê,
  e a CLI por `${CLAUDE_SKILL_DIR}` não resolve fora do Claude Code.
- **Reescrever as skills sem extensões do Claude** — perderia `disable-model-invocation` e
  `argument-hint` no cliente principal.
- **Gerar hooks equivalentes por cliente** — cada cliente tem modelo próprio e instável; sem
  verificação atual e testes por cliente, seria garantia falsa.

## Consequências
- Skills portáveis sem bifurcar a fonte; o build é determinístico e testado por alvo.
- OpenCode/Cline podem ver skills em dobro (`.claude/skills` + adapter); documentado com opções.
- Caminhos dos clientes vêm do snapshot datado; mudanças nos clientes exigem atualizar `TARGETS`.
