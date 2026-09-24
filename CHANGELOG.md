# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/); versões seguem
[SemVer](https://semver.org/lang/pt-BR/). O "porquê" de cada mudança estrutural está nos ADRs em
[`docs/adr/`](docs/adr/README.md).

**Superfície pública versionada (SemVer):** comandos e flags da CLI (`scripts/sdd.mjs`), saída
`--json` do doctor e dos comandos que a oferecem, schemas (`schemas/*.json`: config v3, eventos v1,
skills.lock v1), formato do `events.jsonl`, nomes dos workflows/skills núcleo e dos agentes, e o
formato de `sdd.config.yaml`. Mudança incompatível nesses pontos = versão major.

## [Não lançado]

### Adicionado
- **Painel local** (ADR-0022): `sdd status [--json|--verbose|--watch] [--session S]` e
  `sdd dashboard` (TUI em tempo real, somente leitura, sem dependência nova) consomem o mesmo
  snapshot, derivado de `.sdd/events.jsonl`, `.sdd/trace/`, specs, config, agentes e política —
  nada é estimado pelo modelo. Métricas com fonte: progresso ponderado por dimensão (pesos em
  `dashboard.progress`), requisitos verificados pelo guardião, saúde do projeto e de cada agente
  por regras e limiares (`dashboard.health`), autonomia por invocação, gates por spec
  (SPEC → CODE → TEST → GATES → GUARDIAN → DELIVERY) e prontidão de entrega. Rastreabilidade
  "WHY?" só por vínculo explícito (o resto é `UNKNOWN`). Telas: Overview, Agents (objetivo atual,
  ferramentas, permissões derivadas da política, linha do tempo), Tasks (grafo), Specs, Quality,
  Security, Events (stream com filtro/busca/pausa) e Runtime (sessão, ferramentas, MCP, LSP).
  `--once` imprime um quadro; `--demo` usa um projeto sintético isolado (`DEMO DATA`).
- `sdd sessions [--json]`; `sdd doctor --dashboard` (também em `--project`/`--full`).
- Contrato `schemas/status.schema.json` (`schemaVersion 1`) para `sdd status --json`.
- `sdd event TEST_*` aceita `--suite --passed --failed --skipped --total --coverage` (gravados em
  `meta`; lidos pelo painel).
- Config: bloco opcional `dashboard` (pesos, limiares, janela de eventos) no schema e na visão
  `sdd.config.md`; tarefas aceitam `pesos:` no frontmatter do arquivo de tarefas.
- Evals determinísticas da categoria `observability` (status sem métricas inventadas, segredo como
  achado crítico, demo marcada); teste de desempenho `tests/perf/dashboard.perf.mjs` com relatório
  em `docs/reports/dashboard-performance.md`.
- **Trace de invocações** (ADR-0023): o PreToolUse grava `tool.called` (com `tool.use_id`) para
  chamadas permitidas; o PostToolUse grava `tool.use_id` e `duration_ms` quando o cliente informa.
  Matchers passam a incluir `Glob|Skill|Agent|Task|mcp__.*` (PreToolUse) e `LSP|mcp__.*`
  (PostToolUse), com atributos `mcp.server`, `mcp.tool` e `lsp.operation`.
- **Sanitizer central** (`scripts/lib/sanitize.mjs`) para eventos, trace, painel, log de
  diagnóstico e export OTLP: padrões de segredo + campos com nome de credencial; novos padrões
  `bearer-token` e `basic-auth` (só o valor é redigido).
- **Execução em ondas** (ADR-0021): `sdd tasks wave [--spec S] [--max N]` planeja as tarefas que
  rodam ao mesmo tempo — specs de `depende-de` implementadas, um agente por onda, guardião sozinho,
  limite `agents.parallel.max` (padrão 3; 1 = sequencial) — cada uma com o modelo do seu papel.
  `event TASK_STARTED --wave <id>` marca a onda; o estado recusa duas tarefas do mesmo agente numa
  onda; o `SubagentStop` deixa o fechamento da onda com o orquestrador. `/gerar-projeto` delega a
  onda numa única mensagem e fecha com suíte única.
- **Modelo por papel do agente** (ADR-0020): `policies/model-routing.json` define papel → nível
  (haiku/sonnet/opus + esforço) e piso; sinais do contexto (reprovação no guardião, reabertura, spec
  grande ou crítica) sobem um nível; perfis `quality|balanced|economy`.
- `sdd models list|resolve`; `tasks ready|show` mostram o modelo de cada tarefa (`routing` no
  `--json`); `event --model/--effort` grava o modelo usado no `TASK_STARTED` (estado:
  `tasks.<id>.model|effort`) e `TASK_REOPENED` passa a contar `reopened`.
- Config: `model`/`effort` opcionais por etapa de pipeline e `agents.models` (`profile`,
  `overrides`, `roles`); `config validate` avisa escolha explícita abaixo do piso do papel.
- Agentes do kit ganham `model`/`effort` no frontmatter (perfil balanced); o doctor verifica
  valores válidos e divergência com a política. `/implementar-spec`, `/implementar-tarefa` e
  `/gerar-projeto` passam o modelo resolvido ao delegar.

### Alterado
- `/sdd-status` usa `sdd status --json` como fonte da saúde, do progresso e da entrega (sem
  estimativa própria).
- `redact()` compila os padrões uma vez (antes, a cada chamada) — trace, export de contexto e
  painel ficam mais rápidos.
- `tasks ready --json`: `parallel_safe` passa a ser a próxima onda (regras acima); antes era uma
  tarefa por spec × agente, sem limite nem exclusividade do guardião.

### Corrigido
- Hook `PreToolUse`: a decisão `deny`/`ask` da política é emitida **antes** do trace, e o resumo do
  `tool_input` passou para dentro do bloco fail-open — antes, uma falha ao carregar o trace ou um
  `tool_input` nulo fazia o hook lançar e o bloqueio se perdia (erro "ignorado" no stderr). O
  `PostToolUse` também isola o trace da validação de specs.
- `sdd trace export --otlp`: duração fracionária ou `ts` inválido não quebram mais a conversão.
- Hook `paths.generated`: o marcador `AUTO-GENERATED` só torna um arquivo "gerado" quando abre uma
  linha de comentário no início dele (`<!--`, `#`, `//`...). Antes, qualquer ocorrência nos
  primeiros 2 KB bastava — o próprio renderizador (`scripts/lib/config-md.mjs`, que guarda o
  marcador numa constante) e `policies/sdd-policy.json` ficavam impossíveis de editar.
- Visão `sdd.config.md`: colunas Modelo/Esforço na tabela da pipeline quando alguma etapa os fixa
  (preservadas no round-trip md → yaml).
- `sdd scan agents`: erro de execução do scanner sem achados (ex.: cota diária da versão pública do
  Agent-Scan, autenticação) passa a ser `NOT_RUN` com o motivo, não `FAIL`; `FAIL` fica para achados
  reais. O doctor mostra o motivo.
- `sdd scan agents`: o agent-scan 0.6.4 em modo `--ci` exige `--dangerously-run-mcp-servers`; o kit
  passa a pedir uma segunda confirmação (`--run-mcp-servers`), separada do `--consent` do envio à Snyk,
  e o workflow manual a usa (runner descartável). Sem ela, `NOT_RUN`.
- `sdd scan agents`: na falha, imprime um diagnóstico com segredos redigidos — resumo do JSON do
  stdout (erros e achados) e as últimas linhas úteis do stderr, sem o ruído de instalação do `uvx`.
  Num runner descartável do CI o relatório em `.sdd/reports/` se perdia e só restava o exit code.

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
