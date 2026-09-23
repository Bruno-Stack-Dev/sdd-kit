# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/); versões seguem
[SemVer](https://semver.org/lang/pt-BR/). O "porquê" de cada mudança estrutural está nos ADRs em
[`docs/adr/`](docs/adr/README.md).

**Superfície pública versionada (SemVer):** comandos e flags da CLI (`scripts/sdd.mjs`), saída
`--json` do doctor e dos comandos que a oferecem, schemas (`schemas/*.json`: config v3, eventos v1,
skills.lock v1), formato do `events.jsonl`, nomes dos workflows/skills núcleo e dos agentes, e o
formato de `sdd.config.yaml`. Mudança incompatível nesses pontos = versão major.

## [3.0.0] — 2026-09-23

Evolução do kit para um *control plane* governado e testável. Guia de migração:
[`MIGRATION.md`](MIGRATION.md).

### Adicionado
- **Config executável**: `sdd.config.yaml` canônico com JSON Schema, parser YAML de subconjunto
  sem dependências, `config validate|migrate|render|show`; `sdd.config.md` passa a ser visão gerada
  (ADR-0002, ADR-0003).
- **Estado por eventos**: `.sdd/events.jsonl` append-only com lock, idempotência por chave e
  validação de transição; `state.json` e LEDGER derivados; grafo de tarefas com IDs globais
  `<spec>/T-NNN`; `state resume|verify|rebuild|repair|import-ledger`; `tasks sync|ready|graph`;
  `spec next-id|new` (ADR-0004).
- **`sdd doctor`** com modos fast/project/security/skills/mcp/full, saída JSON, `NOT_RUN` explícito
  e modo "repositório do motor".
- **Política e hooks determinísticos**: `policies/sdd-policy.json`, tokenizador de shell, hooks
  `PreToolUse`/`PostToolUse`/`SessionStart`/`SubagentStart`/`SubagentStop`/`Stop`/`SessionEnd`;
  `policy check`; sandbox opcional (ADR-0005).
- **Plugin do Claude Code** e marketplace; `sdd init --mode plugin|copy`, `sdd upgrade` com backup,
  `sdd version` (ADR-0006).
- **Workflows como Agent Skills** com evals, `disable-model-invocation` nos que têm efeito colateral
  e frontmatter válido para parsers YAML estritos (ADR-0007).
- **Supply chain de skills**: `skills.lock.json` (hash, licença, confiança, scan), scanner estático,
  ingestão em quarentena, ativação de packs verificada; `THIRD_PARTY.md` (ADR-0008).
- **Agentes de mínimo privilégio** com contratos de saída; auditores somente leitura (ADR-0009).
- **Code intelligence**: `lsp detect` com recomendação do plugin LSP oficial.
- **MCP governado**: allowlist, perfis (minimal, frontend, e2e, backend, database, enterprise, none),
  lock e pin de schema das ferramentas, checagem de drift (ADR-0010); perfil enterprise com
  ContextForge documentado.
- **Scanners opcionais**: Snyk Agent Scan com consentimento; Cisco Skill Scanner quando instalado.
- **Evals**: 42 casos determinísticos com fixtures e baseline; suíte com modelo via Promptfoo +
  Claude Agent SDK fora do caminho crítico (ADR-0011).
- **Observabilidade**: trace local JSONL compatível com OpenTelemetry, redação de segredos,
  `trace show|export --otlp` fail-open (ADR-0012).
- **Brownfield** com OBSERVED × INTENDED × RUNTIME, proveniência por fato e classificação de drift
  (ADR-0013); `project classify`.
- **Pipelines dinâmicas** guiadas pela config; templates sem camadas de stack fixas (ADR-0014).
- **Packs como plugins** (`sdd-architecture`, `sdd-design-system`, `sdd-uiux`) (ADR-0015).
- **Pack `ai`** (`sdd-ai`): discovery de IA, avaliação por critérios com documentação atual e ADR,
  templates `AI-*` sob demanda; `ai detect` (ADR-0016).
- **Adapters** para Codex, OpenCode, Cline e clientes genéricos (`adapters build|status`) (ADR-0017).
- **`sdd export-context`**: pacote local sanitizado; Repomix opcional com consentimento; skill
  `sdd-export-context` (ADR-0018).
- **CI** com Actions fixadas por SHA, permissões mínimas, testes em Linux/Windows, runtime Node 20;
  workflows manuais/noturnos para evals com modelo e agent scan (ADR-0019).
- `SECURITY.md`, `CONTRIBUTING.md`, `MIGRATION.md`, ADRs 0001–0019.

### Alterado
- Motores `GERADOR`, `DISCOVERY` e `AUDITORIA` movidos para `references/` das skills; os caminhos
  antigos em `specs/_gerador/` viraram stubs.
- `settings.json` com allowlist mais estreita e `deny` para segredos; hooks registrados.
- Spec só fecha com evento `GUARDIAN_APPROVED` com evidência.
- Descrições de skills vendorizadas corrigidas para YAML válido.
- Testes movidos para `tests/` (unit, integration, characterization, fixtures).

### Obsoleto
- `.claude/commands/*.md`: aliases de compatibilidade; remoção prevista na 4.0.0.
- `sdd.config.md` escrito à mão: ainda lido (com aviso), substituído por `sdd.config.yaml`.
- LEDGER escrito à mão: importável por `state import-ledger`; passa a ser gerado.

### Corrigido
- Lock do log de eventos no Windows: exclusão pendente (`EPERM`/`EACCES`) tratada como disputa.
- `.gitignore` ignorava `sdd.config.yaml` em qualquer nível e escondia as configs das fixtures de
  teste; padrões agora ancorados na raiz (achado pela regressão em cópia limpa).
- Hash de skills/packs ignora artefatos locais (`.coverage`, `.DS_Store`), para o lock bater num
  clone limpo.

### Segurança
- Leitura de `.env`/chaves, edição do log de eventos e de arquivos gerados e git destrutivo
  bloqueados por hook; ações sensíveis pedem confirmação.
- Nenhuma telemetria: trace só local; exportação OTLP só quando configurada.

## [2.0.0]

Versão anterior: motor genérico em Markdown, config em `sdd.config.md`, LEDGER manual, comandos em
`.claude/commands/`, packs `arch`, `ds` e `uiux` vendorizados. Baseline documentado em
[`docs/architecture/v2-baseline.md`](docs/architecture/v2-baseline.md).
