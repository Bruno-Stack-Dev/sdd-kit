---
adr-id: ADR-0005
titulo: Guardrails críticos por hooks + política única em dados + sandbox opcional
status: aceito
data: 2026-09-23
---

# ADR-0005: Hooks + política única + sandbox

## Contexto
No v2, segurança era allowlist genérica mais frases nos agentes ("não leia segredos", "não dê push",
"auditor não reescreve código"). A allowlist permitia `node`, `python`, `npx`, `sed` irrestritos; a
denylist de `curl`/`wget` dava falsa sensação de bloqueio de rede; `rm -fr` contornava `rm -rf`.

## Decisão
1. **Uma política, em dados**: `policies/sdd-policy.json`. A config do projeto só endurece.
2. **Um script de hooks** (`scripts/hooks/sdd-hook.mjs`) para `PreToolUse`, `PostToolUse`,
   `SessionStart`, `SubagentStop`, `Stop`, `SessionEnd`. `PreToolUse` responde só `deny`/`ask`; nunca
   concede permissão.
3. **Análise de shell por segmento** (`scripts/lib/shell.mjs`) em vez de regex sobre a linha inteira,
   com recursão em `$(...)`, `bash -c`, `eval`, `<(...)` e tratamento de heredoc.
4. **Auditores somente leitura por `agent_type`** — defesa em profundidade junto às `tools` dos
   agentes (Fase 8).
5. **Fail-closed seletivo**: erro interno + comando destrutivo → `deny`; o resto é fail-open.
6. **Sandbox opcional e explícito** (`sdd security sandbox --enable`), porque não roda no Windows
   nativo e mudaria o comportamento de projetos existentes sem aviso.
7. Allowlist do `settings.json` sem `npx:*`/`pnpm:*`/`yarn:*`/`sed:*` irrestritos; deny de `.env`,
   chaves e edição direta do log de estado.

## Alternativas
- **Só permissões do Claude Code** — não entendem aninhamento (`bash -c`), heredoc, nem o conceito de
  auditor, arquivo gerado ou marcador de produção.
- **Sandbox ligado por padrão** — quebraria usuários de Windows nativo e fluxos com rede; fica como
  recomendação com comando dedicado e aviso do doctor.
- **Regras espalhadas em cada agente** — cinco cópias divergentes; rejeitada.

## Consequências
- Mais confirmações para instalar pacote novo e para ferramentas de rede (intencional).
- Falso positivo é corrigido na política com teste, não desligando o hook.
- Hooks dependem de Node no PATH (já exigido pelo kit). Em modo plugin, o mesmo script é chamado via
  `${CLAUDE_PLUGIN_ROOT}` (Fase 5); o doctor detecta a instalação dupla.
