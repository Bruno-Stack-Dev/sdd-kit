---
adr-id: ADR-0010
titulo: MCP só por allowlist com versão fixada, perfis por projeto e lock de schema de ferramentas
status: aceito
data: 2026-09-23
---

# ADR-0010: Governança de MCP

## Contexto
Sem governança, qualquer `.mcp.json` trazido por um PR, template ou pelo próprio agente vira
ferramenta disponível — com risco de tool poisoning, shadowing e mudança silenciosa de schema.

## Decisão
1. `mcp/policies/allowlist.yaml` é a única fonte de servidores que o kit escreve: pacote, versão fixa,
   comando exato, licença, rede e saída de dados.
2. Perfis (`mcp/profiles/*.json`) escolhem servidores da allowlist; `sdd mcp apply` reescreve o
   `.mcp.json` e trava `enabledMcpjsonServers` + `enableAllProjectMcpServers: false` no settings —
   controle nativo do Claude Code.
3. `sdd mcp check` (doctor e SessionStart) acusa servidor fora da allowlist, `@latest`, drift de
   comando/args/env (hash canônico) e auto-habilitação global. Não executa nada.
4. Lock de ferramentas: `sdd mcp pin` captura nomes e hash do schema via MCP Inspector **só com
   `--consent`** (executa o servidor); sem consentimento é `NOT_RUN`. Pin posterior diferente = drift,
   com as ferramentas novas/removidas/alteradas.
5. Context7 (docs versionadas) e Playwright (e2e com evidência) são os servidores recomendados;
   ContextForge só no perfil enterprise.

## Consequências
- Adicionar MCP exige editar a allowlist do motor (ou do fork do time) — atrito intencional.
- Os schemas vêm `null` no lock até alguém capturá-los com consentimento; o doctor avisa.
