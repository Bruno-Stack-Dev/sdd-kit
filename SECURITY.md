# Política de segurança

## Versões suportadas

| Versão | Suporte |
|--------|---------|
| 3.x | correções de segurança |
| 2.x | sem suporte — migre com [`MIGRATION.md`](MIGRATION.md) |

## Como reportar uma vulnerabilidade

Use o **reporte privado de vulnerabilidades do GitHub** neste repositório (aba *Security* →
*Report a vulnerability*). **Não abra issue pública** para vulnerabilidades.

Inclua: versão (`node scripts/sdd.mjs version`), sistema operacional, passos para reproduzir e o
impacto esperado. Não inclua segredos reais nem código proprietário no relatório.

Resposta inicial em até 5 dias úteis. Correções saem em versão patch com entrada no
[`CHANGELOG.md`](CHANGELOG.md); o crédito ao autor do reporte é dado se ele quiser.

## Escopo

**Dentro:** CLI e bibliotecas (`scripts/`), hooks (`scripts/hooks/`, `hooks/hooks.json`), política
(`policies/`), schemas, instalação/upgrade, skills núcleo, pack `ai`, agentes e workflows de CI.

**Fora (reporte ao projeto de origem):** conteúdo vendorizado dos packs `arch`, `ds` e `uiux`
(ver [`THIRD_PARTY.md`](THIRD_PARTY.md)), ferramentas opcionais (Promptfoo, Repomix, scanners,
servidores MCP, ContextForge) e o próprio Claude Code.

## O que o kit garante — e o que não garante

O modelo de ameaças completo está em [`docs/security/threat-model.md`](docs/security/threat-model.md).

- Os hooks são **controle determinístico sobre as chamadas de ferramenta do Claude Code**: bloqueiam
  padrões conhecidos (leitura de segredos, edição do log de eventos e de arquivos gerados, git
  destrutivo, `curl | sh`). Não são sandbox: um comando ofuscado fora dos padrões pode passar. Para
  isolamento de sistema de arquivos e rede, use o sandbox (`sdd security sandbox --enable`,
  macOS/Linux/WSL2) — ver [`docs/security/sandbox.md`](docs/security/sandbox.md).
- Em outros clientes (adapters), hooks e permissões **não** viajam; os guardrails viram instrução.
- A detecção de segredos (doctor, trace, export de contexto) é heurística.
- Ferramentas externas só rodam com consentimento explícito; sem elas o resultado é `NOT_RUN`.
- O kit não tem telemetria. O trace fica em `.sdd/trace/` (não versionado) e só é exportado para um
  endpoint OTLP que você configurar.

## Boas práticas para quem usa o kit

- Nunca remova entradas de `deny` nem os hooks do `.claude/settings.json`.
- Mantenha segredos em variáveis de ambiente; o `.env` não deve ser versionado (o doctor verifica).
- Rode `sdd doctor --security` no CI e `sdd skills verify` antes de ativar packs.
- Skills e servidores MCP de terceiros: ingestão em quarentena (`sdd skills add`) e allowlist
  (`mcp/policies/allowlist.yaml`); scanners só em ambiente isolado.
