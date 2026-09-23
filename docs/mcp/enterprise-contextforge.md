# Perfil `enterprise` — gateway MCP com ContextForge

> Opcional. O core do SDD Kit **não** depende do ContextForge, não o instala e funciona igual sem
> ele. Fatos sobre o produto conferidos na documentação oficial em 2026-09-23 (versão 1.0.10 —
> ver [`docs/references/integrations-snapshot.md`](../references/integrations-snapshot.md)).
> Confira de novo antes de adotar: gateways MCP evoluem rápido.

## O que é

O [ContextForge](https://github.com/IBM/mcp-context-forge) (IBM, Apache-2.0; pacote PyPI
`mcp-contextforge-gateway`, comando `mcpgateway`, porta padrão 4444) é um **gateway e registry**:
federa vários servidores MCP (e agentes A2A) atrás de **um endpoint**, com autenticação
(JWT/OAuth/SSO), RBAC, políticas, auditoria, catálogo, UI de administração, OpenTelemetry e plugins.
Roda local (SQLite) para experimentar ou em Docker/Helm com Postgres e Redis em produção.

No kit, o perfil `enterprise` (`mcp/profiles/enterprise.json`) liga **só** o servidor
`contextforge` da allowlist, apontando para `${CONTEXTFORGE_URL}` com
`Authorization: Bearer ${CONTEXTFORGE_TOKEN}` — variáveis de ambiente, nunca valores no repositório.

## Quando NÃO usar

Na maioria dos projetos, o gateway é custo sem retorno. Não use se:

- **Poucos MCPs** (os perfis `minimal`, `frontend`, `e2e`, `backend` cobrem com 1–3 servidores).
  Allowlist + pin + lock do kit já dão governança suficiente.
- **Um time só, um repositório**: o `.mcp.json` versionado com a allowlist do kit é auditável no
  próprio PR.
- **Ninguém para operar**: é um serviço com banco, atualizações, segredos, backup e monitoração. Sem
  dono, vira ponto único de falha e de vazamento.
- **Motivo é "parecer enterprise"**: se não há requisito de auditoria central, SSO ou política
  corporativa, não há o que o gateway resolver.
- **Dados não podem passar por mais um salto**: todo tráfego MCP atravessa o gateway; se a política
  de dados não admite isso, a arquitetura é outra.

## Quando o custo se justifica

Considere quando **vários** destes forem verdade:

- Muitos servidores MCP (dezenas) usados por vários times/repositórios, com duplicação de
  configuração e credenciais espalhadas.
- Exigência de **auditoria central** (quem chamou qual ferramenta, quando, com qual resultado) e de
  revogação central de acesso.
- **SSO/RBAC** corporativo obrigatório para ferramentas que tocam sistemas internos.
- Necessidade de **política em um ponto** (bloquear ferramenta, limitar taxa, filtrar
  argumentos) em vez de replicar em cada cliente.
- Federação com agentes A2A de outras áreas.
- Existe time de plataforma para operar o gateway como produto interno (SLO, backup, patches).

Registre a decisão em ADR do projeto com esses drivers e o custo operacional estimado.

## Como ligar (quando decidido)

1. A plataforma provê o gateway (não é o SDD Kit que sobe o serviço). Teste local, se quiser:
   siga a documentação oficial atual do ContextForge — o kit não instala nem executa o `mcpgateway`.
2. Defina as variáveis no ambiente do desenvolvedor/CI (nunca no repositório):
   `CONTEXTFORGE_URL` e `CONTEXTFORGE_TOKEN` (token de escopo mínimo, com expiração).
3. Aplique o perfil e revise o diff do `.mcp.json`:

   ```bash
   node scripts/sdd.mjs mcp profiles
   node scripts/sdd.mjs mcp apply enterprise
   node scripts/sdd.mjs doctor --mcp
   ```

4. Com o gateway no ar, fixe o schema das ferramentas expostas (`sdd mcp pin contextforge`) para que
   mudanças no catálogo apareçam como diff revisável no `mcp/mcp.lock.json`.

## Riscos e controles

| Risco | Controle |
|-------|----------|
| Gateway comprometido expõe todas as ferramentas federadas | RBAC por time; token de escopo mínimo; rede restrita; patches em dia |
| Catálogo muda sem revisão (novas ferramentas, descrições alteradas) | `sdd mcp pin` + doctor apontando divergência do lock |
| Token vaza | variável de ambiente, expiração curta, revogação central; hooks do kit bloqueiam leitura de `.env` |
| Dados sensíveis trafegam pelo gateway | classificação de dados antes de federar servidores; logs do gateway com redação |
| Scanner/inspeção executando servidores não confiáveis | só em ambiente isolado e com consentimento (ver [`docs/security/agent-scan.md`](../security/agent-scan.md)) |

## Sem o gateway, o que o kit já garante

Allowlist (`mcp/policies/allowlist.yaml`), perfis, lock de schema e pin, `sdd doctor --mcp`,
bloqueio de servidores fora da allowlist e secrets só por variável de ambiente — ver
[`docs/mcp/README.md`](README.md) e ADR-0010.
