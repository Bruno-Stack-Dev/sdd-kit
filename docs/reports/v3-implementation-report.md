# Relatório de implementação — SDD Kit v3.0.0

Branch `feat/sdd-kit-v3` · 2026-09-23 · commits locais, **sem push**.

## 1. Executive summary

O SDD Kit passou de um conjunto de prompts em Markdown com um linter (v2) para um *control plane*
de engenharia com agentes: config executável com schema, estado por eventos com gate do guardião,
doctor com saída para CI, política e hooks determinísticos, plugin do Claude Code, workflows como
Agent Skills, supply chain de skills com lockfile, agentes de mínimo privilégio, MCP governado,
evals determinísticas, trace local compatível com OpenTelemetry, auditoria brownfield
OBSERVED/INTENDED/RUNTIME, pipelines guiadas pela config, packs como plugins, pack `ai`, adapters
para outros clientes, export de contexto sanitizado e CI endurecido.

Premissas preservadas: **motor genérico + config por projeto**, **specs como fonte da verdade**,
**zero dependências no core** (Node ≥ 20) e compatibilidade com projetos v2 (config `.md` e LEDGER
legados são lidos e migráveis).

Resultado: 354 testes `node:test` verdes, 42/42 evals determinísticas sem regressão, `doctor --full`
em `READY_WITH_WARNINGS` com 0 falhas, e **regressão completa numa cópia limpa com 18/18 PASS**
([`regression-3.0.0.md`](regression-3.0.0.md)). A própria regressão em cópia limpa encontrou dois
defeitos reais que só apareciam fora da máquina de desenvolvimento (configs de fixtures ignoradas
pelo `.gitignore`; artefato local no hash do lock) — corrigidos antes do fechamento.

## 2. Baseline (v2)

Detalhado em [`docs/architecture/v2-baseline.md`](../architecture/v2-baseline.md): 379 arquivos
versionados (≈315 de packs vendorizados), 12 agentes, 8 comandos, 14 templates, 3 motores em
Markdown, **1 script executável** (`sdd-lint.mjs`), 4 testes próprios, 77 testes pytest de
terceiros, 1 workflow de CI, nenhuma dependência de runtime. Config e LEDGER escritos à mão; IDs
escolhidos pelo modelo; gate do guardião em prosa.

## 3. Arquitetura

```
             Claude Code (ou Codex/OpenCode/Cline via adapters)
                 │ skills (workflows)        │ hooks (PreToolUse/PostToolUse/...)
                 ▼                           ▼
   ┌──────────── CLI determinística  scripts/sdd.mjs  (zero dependências) ───────────┐
   │ config (YAML+schema) · spec/tasks (DAG) · event/state (events.jsonl) · doctor   │
   │ policy · skills/pack (lock) · mcp (allowlist/perfis/lock) · eval · trace · ai   │
   │ adapters · export-context · init/upgrade                                        │
   └──────────────────────────────────────────────────────────────────────────────────┘
        │                    │                     │                       │
   sdd.config.yaml     .sdd/events.jsonl     skills.lock.json        mcp/*.json, policies/
   (canônica)          (autoridade do estado) (proveniência)         (governança)
        ▼                    ▼
   sdd.config.md       state.json, LEDGER (derivados, AUTO-GENERATED)
```

Julgamento (discovery, arquitetura, revisão) fica em skills e agentes; tudo o que precisa acontecer
sempre (IDs, transições, gate do guardião, bloqueios de segurança, integridade) é código testado.

## 4. Fases concluídas

| Fase | Entrega | Commit |
|------|---------|--------|
| 0 | baseline, plano de migração, testes de caracterização | `3729195` |
| 1 | `sdd.config.yaml` + schema + parser YAML + migração do `.md` | `c42d6a9` |
| 2 | estado por eventos, grafo de tarefas, retomada | `1390a9a` |
| 3 | `sdd doctor` (6 modos, JSON) | `23f14f8` |
| 4 | política única, hooks determinísticos, sandbox documentado | `3bc48c2` |
| 5 | plugin + marketplace, `init`/`upgrade` (plugin e cópia) | `ff40b16` |
| 6 | comandos → Agent Skills, aliases de compatibilidade | `3eded27` |
| 7 | supply chain de skills (lock, scanner, quarentena) | `8c02550` |
| 8 | agentes de mínimo privilégio, contratos | `6b88cad` |
| 9 | detecção de LSP/code intelligence | `997a1e8` |
| 10 | MCP: allowlist, perfis, drift, pin | `9b9ca25` |
| 11 | Snyk Agent Scan opcional com consentimento | `686f098` |
| 12 | evals determinísticas + Promptfoo | `32a4d1e` |
| 13 | trace local + export OTLP | `a259333` |
| 14 | brownfield OBSERVED/INTENDED/RUNTIME | `ad3275e` |
| 15 | pipelines e templates guiados pela config | `057d69c` |
| 16 | packs como plugins | `fb9bcab` |
| 17 | pack `sdd-ai` + `ai detect` | `683252f` |
| 18 | adapters Codex/OpenCode/Cline/genérico (+ correção do lock no Windows) | `4cdc5d1` |
| 19 | `sdd export-context` + Repomix opcional | `2627475` |
| 20 | perfil enterprise ContextForge, `MIGRATION.md`, teste de links | `0e918e1` |
| 21 | CI com SHAs fixados, evals/agent scan manuais | `0b4645b` |
| 22 | release 3.0.0: CHANGELOG, SECURITY, CONTRIBUTING, README/SETUP | `d17c0ea` |
| 23 | regressão completa em cópia limpa + correções achadas | `cd7dc05`, `fa77376`, `53c112a` |
| 24 | este relatório | — |

## 5. Arquivos adicionados, alterados e removidos

Contra a `main`: **338 arquivos** (+22.523 / −1.504 linhas) — **280 adicionados, 57 alterados,
0 removidos, 1 movido** (`scripts/tests/sdd-lint.test.mjs` → `tests/unit/lint/`).

- **Adicionados (principais):** `scripts/sdd.mjs`, `scripts/lib/` (31 módulos + `doctor/`),
  `scripts/commands/` (16), `scripts/hooks/sdd-hook.mjs`, `schemas/` (3), `policies/sdd-policy.json`,
  `.claude-plugin/`, `hooks/hooks.json`, `mcp/` (allowlist, 7 perfis, lock), 9 skills núcleo com
  evals, pack `ai` (8 skills + templates + referências), manifestos de plugin dos 4 packs,
  `skills.lock.json`, `evals/`, `tests/` (unit, integration, characterization, regression, 8
  fixtures), `docs/` (19 ADRs, segurança, MCP, adapters, observabilidade, arquitetura, exemplos),
  `.github/workflows/{evals,agent-scan}.yml`, `.github/dependabot.yml`, `CHANGELOG.md`,
  `SECURITY.md`, `CONTRIBUTING.md`, `MIGRATION.md`, `THIRD_PARTY.md`.
- **Alterados:** os 12 agentes (ferramentas e contratos), os 8 comandos (viraram aliases),
  `settings.json` e exemplos, frontmatter das 14 skills `arch-*` (YAML inválido), atribuições dos
  packs, templates de plano/tarefas/auditoria, motores `specs/_gerador/*` (viraram stubs),
  `sdd-lint.mjs` (fina sobre `lib/lint.mjs`), `ci.yml`, `.gitignore`, `README.md`, `SETUP.md`.
- **Removidos:** nenhum. Caminhos antigos viraram stubs ou aliases.

## 6. ADRs

0001 registrar decisões · 0002 parser YAML de subconjunto · 0003 config YAML canônica · 0004 estado
por eventos · 0005 hooks e política determinística · 0006 plugin e modo cópia · 0007 workflows como
Agent Skills · 0008 supply chain de skills · 0009 agentes de mínimo privilégio · 0010 governança de
MCP · 0011 evals determinísticas e com modelo · 0012 observabilidade local OTel · 0013 brownfield
OBSERVED/INTENDED/RUNTIME · 0014 pipelines dinâmicas · 0015 packs como plugins · 0016 pack `ai` por
critérios · 0017 adapters cross-client · 0018 export de contexto sanitizado · 0019 CI sem segredos
no PR. Índice: [`docs/adr/README.md`](../adr/README.md).

## 7. Dependências

- **Runtime do core:** nenhuma (`package.json` sem `dependencies`; o doctor e um teste impedem).
- **Opcionais, versão exata, com consentimento quando executam código de terceiros ou enviam
  dados:** Promptfoo 0.123.1, Repomix 1.18.1, Snyk Agent Scan 0.6.4, Cisco Skill Scanner 2.1.0,
  Context7 MCP 4.1.1, Playwright MCP 0.0.82, MCP Inspector 2.7.0, ContextForge 1.0.10 (documentado,
  nunca instalado pelo kit).
- **Só no CI:** pytest 9.1.1; no job de evals, `@anthropic-ai/claude-agent-sdk` 0.3.280; no job de
  agent scan, uv 0.12.18. Actions fixadas por SHA (checkout v4.4.0, setup-node v4.4.0,
  setup-python v5.6.0).
- **Frameworks de IA:** nenhum instalado (PydanticAI, LangGraph, ADK, Agno, Cognee, Graphiti,
  RAGFlow, Letta, Mem0, XGrammar, BAML, DSPy, vLLM, SGLang, llama.cpp, E2B, NeMo, Garak, Phoenix,
  ContextForge aparecem só como candidatos a avaliar no pack `ai` ou como opcionais documentados).
- Versões e datas de consulta: [`integrations-snapshot.md`](../references/integrations-snapshot.md).

## 8. Segurança

- `PreToolUse` nega leitura de segredos, edição de `.sdd/events.jsonl` e de arquivos gerados, git
  destrutivo e `curl | sh`; pede confirmação para ações sensíveis; fail-closed só para o destrutivo.
  Os hooks estavam ativos nesta própria sessão de trabalho e bloquearam um `curl | python` — o
  bloqueio foi respeitado, não contornado.
- Agentes auditores somente leitura; `settings.json` com `deny` para segredos.
- Supply chain: lock com hash/licença/confiança, scanner estático (unicode invisível, `curl|sh`,
  exec dinâmico, segredos, injeção de prompt), quarentena para skills externas.
- MCP só da allowlist, credenciais por variável de ambiente, pin de schema.
- Segredos: doctor varre arquivos versionados (0 achados em 658 arquivos); export de contexto exclui
  e relata sem mostrar valores; trace redige.
- Sem telemetria. Nenhum push, publicação ou envio de código a serviço externo foi feito.
- Modelo de ameaças: [`docs/security/threat-model.md`](../security/threat-model.md); política de
  reporte: [`SECURITY.md`](../../SECURITY.md).

## 9. Evals

42 casos determinísticos em 13 categorias (discovery, classificação brownfield, decomposição de
tarefas, seleção de agente, ativação de skill, conformidade de spec, recall do guardião, rejeição de
ação proibida, cobertura de CA, órfãos, drift, política de segurança, retomada): **42/42**, baseline
3.0.0 sem regressões. Suíte com modelo: 59 testes gerados das evals de skills (núcleo e pack `ai`) e
agentes para o Promptfoo — **NOT_RUN** aqui (sem `ANTHROPIC_API_KEY`); roda no workflow noturno.

## 10. Testes

- **354** testes `node:test` (unit, integration, characterization), verdes três vezes seguidas no
  Windows e dentro do clone limpo.
- 77 testes pytest (+34 subtests) do pack `uiux`.
- Regressão ponta a ponta em cópia limpa (18 etapas): lint, doctor, suíte, schemas, lock,
  segurança, evals, pytest, greenfield com guardião rejeitando e aprovando, interrupção e retomada,
  brownfield, MCP indisponível, integrações ausentes → NOT_RUN, migração v2→v3, core sem frameworks,
  nenhum segredo versionado, adapters e export sem sujar a árvore.

## 11. Compatibilidade

- `sdd.config.md` v2 lido com aviso; `config migrate` preserva seções não mapeadas em `legacy`.
- LEDGER v2 importável; specs importadas marcadas (guardião sem evidência vira aviso).
- Os 8 comandos continuam com o mesmo nome (skill tem precedência; aliases até a 4.0.0).
- Modo cópia continua suportado, com `upgrade` e backup; modo plugin novo.
- Node 20 como runtime mínimo verificado no CI; testes exigem Node 22.

## 12. MCPs

Allowlist com Context7, Playwright e ContextForge; perfis `minimal`, `frontend`, `e2e`, `backend`,
`database`, `enterprise`, `none`; `mcp apply` gera `.mcp.json` só da allowlist; `mcp check` detecta
drift; `mcp pin` fixa o schema das ferramentas (executa o servidor → só com consentimento, NOT_RUN
sem ele). Perfil enterprise documenta quando **não** usar gateway.

## 13. Plugins

`sdd-kit` (motor: comandos, agentes, skills, hooks) e os packs `sdd-architecture`,
`sdd-design-system`, `sdd-uiux`, `sdd-ai` no marketplace do repositório. Doctor valida manifestos,
versões e ativação em dobro (cópia + plugin).

## 14. Observabilidade

Hooks gravam trace JSONL local (`.sdd/trace/`, não versionado, segredos redigidos) com atributos
compatíveis com OpenTelemetry; `trace show` monta a linha do tempo com os eventos; `trace export
--otlp` envia a um backend (ex.: Phoenix) só quando pedido, e falha sem perder o trace local.

## 15. Pack `ai`

8 skills (`ai-discovery`, `ai-architecture-evaluator`, `ai-model-strategy`, `ai-rag-memory-designer`,
`ai-structured-output-designer`, `ai-evals-designer`, `ai-security-reviewer`,
`ai-observability-governance`), 8 templates `AI-*` gerados só quando necessários e um método comum:
problema antes da tecnologia, comparação com a opção mínima, documentação atual verificada (versão
e data), critérios ponderados, spike com eval quando caro de reverter, ADR com gatilhos de
reavaliação. Sem tabela de recomendação fixa (há teste para isso). `sdd ai detect` sugere o pack e
os artefatos pelas dependências do projeto; o doctor avisa produto com IA sem o pack.

## 16. Pendências reais

- **Não executados (NOT_RUN):** suíte de evals com modelo (sem `ANTHROPIC_API_KEY`), Snyk Agent Scan
  (sem consentimento/`SNYK_TOKEN`), Cisco Skill Scanner (não instalado), `mcp pin` real dos
  servidores, Repomix com consentimento. Nenhum foi dado como aprovado.
- **CI nunca rodou no GitHub:** não houve push. Os passos foram executados localmente (inclusive o
  job de Node 20 simulado) e um teste verifica a higiene dos workflows, mas o primeiro run real
  pode revelar diferenças de ambiente (ex.: macOS não está na matriz).
- **Plugin não testado ao vivo via `/plugin install`**: manifestos, marketplace e hooks validados
  pelo doctor e por testes; a instalação pelo marketplace depende do repositório publicado.
- **Adapters não testados nos clientes reais** (Codex, OpenCode, Cline): caminhos vêm da
  documentação consultada; OpenCode/Cline podem mostrar skills em dobro; nesses clientes os
  guardrails viram instrução (documentado).
- **Packs vendorizados:** `arch` e `ds` sem URL/commit de origem registrados; 51 avisos de campos
  fora da spec Agent Skills nas skills `arch-*`/`ds-*` (upstream); `uiux` com licença divergente
  em uma skill e risco alto (scripts que leem `.env` e chamam API externa) — registrado em
  `THIRD_PARTY.md` e no lock, não resolvido.
- **Sandbox** não verificável no Windows nativo (doctor avisa; WSL2 recomendado).
- `ai detect` é heurístico (lista de pacotes); detecção de segredos é heurística.
- Aliases de `.claude/commands/` a remover na 4.0.0.
- Versão do Claude Agent SDK (0.3.280) conforme o registro npm em 2026-09-23; compatibilidade com o
  provider do Promptfoo não verificada por execução.

## 17. Como usar

**Instalar:**

```bash
node <kit>/scripts/sdd.mjs init --mode copy --root <projeto>     # ou --mode plugin + /plugin install sdd-kit@sdd-kit
```

Depois `/sdd-init` no Claude Code.

**Migrar do v2:** `sdd upgrade` → `sdd config migrate` → `sdd state import-ledger <LEDGER>` →
`sdd tasks sync` → `sdd doctor --full` ([`MIGRATION.md`](../../MIGRATION.md)).

**Usar:** brief em `specs/_entrada/` → `/gerar-projeto`; incrementos com `/nova-spec`; execução com
`/implementar-spec` ou `/implementar-tarefa`; painel com `/sdd-status`; retomada com
`sdd state resume`.

**Doctor:** `sdd doctor --fast` no dia a dia; `sdd doctor --full --json` no CI (exit 1 só em
`NOT_READY`).

**Evals:** `sdd eval run` (determinísticas, contra o baseline); `sdd eval run --suite model` com
`ANTHROPIC_API_KEY` (ou o workflow `evals.yml`).

**Adicionar skill:** núcleo/pack conforme [`CONTRIBUTING.md`](../../CONTRIBUTING.md) e depois
`sdd skills lock --update` + `sdd eval export-promptfoo`; skill externa só por
`sdd skills add <dir> --source <url> --license <SPDX>` (quarentena) e `sdd skills review`.

**Adicionar MCP com segurança:** entrada na allowlist com versão, transporte, rede e egress →
perfil → `sdd mcp pin` em ambiente isolado → `sdd doctor --mcp`.

## 18. Resultado final

| Verificação | Resultado |
|-------------|-----------|
| `node:test` | 354/354 |
| pytest (pack uiux) | 77 + 34 subtests |
| Evals determinísticas | 42/42, 0 regressões |
| `sdd-lint` | 102 itens, 0 erros |
| `doctor --full` | READY_WITH_WARNINGS — 0 falhas; avisos: 51 campos fora da spec em skills vendorizadas, scan externo não executado nos 4 packs, sandbox indisponível no Windows; NOT_RUN: Cisco scanner, Snyk Agent Scan |
| Regressão em cópia limpa | 18/18 PASS |
| Segredos versionados | 0 |
| Dependências de runtime do core | 0 |
| Push / publicação | nenhum |

## 19. Árvore final resumida

```
sdd-kit/
├── README.md · SETUP.md · MIGRATION.md · CHANGELOG.md · SECURITY.md · CONTRIBUTING.md · THIRD_PARTY.md · LICENSE
├── package.json (sem dependências) · skills.lock.json · sdd.config.example.{yaml,md}
├── .claude-plugin/{plugin,marketplace}.json · hooks/hooks.json
├── .github/workflows/{ci,evals,agent-scan}.yml · .github/dependabot.yml
├── scripts/
│   ├── sdd.mjs · sdd-lint.mjs · hooks/sdd-hook.mjs
│   ├── commands/ (16)  adapters ai config doctor eval export-context init lsp mcp project scan security skills state tasks trace
│   └── lib/ (31 + doctor/)  yaml schema config events state graph policy shell supply skill-scan mcp evals trace adapters export-context ai-detect ...
├── schemas/ sdd-config · event · skills-lock
├── policies/sdd-policy.json
├── mcp/ policies/allowlist.yaml · profiles/ (7) · mcp.lock.json
├── .claude/
│   ├── agents/ (12) · commands/ (8 aliases) · settings*.json
│   └── skills/ 9 núcleo (+evals) · _template-skill.md · _packs/{arch,ds,uiux,ai}
├── specs/ _templates · _gerador (stubs) · _entrada · discovery · README
├── evals/ deterministic · baseline · promptfoo · agents
├── tests/ unit · integration · characterization · regression · fixtures (8)
└── docs/ adr (19) · architecture · security · mcp · adapters · examples · migration · references · reports · observability.md
```
