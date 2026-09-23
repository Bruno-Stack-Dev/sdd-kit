# Regressão completa — SDD Kit 3.0.0

Gerado por `node tests/regression/full-regression.mjs --report docs/reports/regression-3.0.0.md` numa cópia limpa (clone local do commit `fa77376`), sem rede.
Node v24.15.0 · win32 · 2026-09-23

**Resultado: PASS** — 18 PASS · 0 FAIL · 0 NOT_RUN

| Etapa | Resultado | Detalhe |
|-------|-----------|---------|
| cópia limpa (git clone local do HEAD) | PASS | HEAD fa77376, árvore limpa |
| lint (sdd-lint) | PASS | sdd-lint: 102 item(ns) verificado(s) · 0 erro(s) · 0 aviso(s) |
| doctor --full (0 falhas) | PASS | READY_WITH_WARNINGS · 25 ok, 3 avisos, 2 não executadas |
| testes node:test (suíte completa no clone) | PASS | 354 passaram, 0 falharam |
| schemas usam só keywords suportadas | PASS | schemas usam só keywords suportadas pelo validador |
| skills e packs íntegros (skills.lock.json) | PASS | ✓ skills e packs íntegros conforme skills.lock.json |
| segurança (doctor --security) | PASS | 7 checagens, 0 falhas |
| evals determinísticas contra o baseline | PASS | evals determinísticas: 42/42 (100%) · baseline 3.0.0: 0 regressão(ões) · 0 melhoria(s) · 0 caso(s) novo(s) |
| testes Python dos packs (pytest) | PASS | 77 passed, 34 subtests passed in 1.55s |
| greenfield: init (cópia) → spec new → tarefas → guardião rejeita → nova revisão → aprova → spec implementada | PASS | LOJ-100: rejeição bloqueou o fechamento e a aprovação direta; nova revisão com evidência fechou; estado e ledger coerentes |
| interrupção + retomada: log truncado recusa gravação, repair recupera, resume aponta a tarefa | PASS | LOJ-100/T-001 retomada; cauda truncada movida para backup |
| brownfield: classificação com evidência e doctor do projeto | PASS | classificado como brownfield; doctor --project sem falhas |
| MCP indisponível: pin sem consentimento é NOT_RUN; perfil aplicado passa no check | PASS | nenhum servidor executado sem consentimento; .mcp.json só da allowlist |
| integrações opcionais ausentes viram NOT_RUN (modelo, agent scan, Repomix, scanner externo, OTLP) | PASS | modelo, agent scan e Repomix NOT_RUN; scanner externo NOT_RUN quando ausente; OTLP indisponível relatado sem quebrar |
| migração v2 → v3: config .md legada → YAML válido → visão gerada | PASS | YAML canônico, .md regenerado como visão, LEDGER v2 importado |
| core sem Phoenix/ContextForge/frameworks de IA: nenhum import externo em scripts/ | PASS | package.json sem dependências; só módulos node: e relativos |
| nenhum segredo nem arquivo sensível versionado | PASS | nenhum arquivo sensível versionado (.env, chaves, credenciais); nenhum segredo aparente em 658 arquivo(s) versionados |
| adapters e export de contexto no clone (sem escrever fora de .sdd/) | PASS | 9 skills exportadas; export com 599 arquivos e 59 exclusões; árvore continua limpa |

`NOT_RUN` = a ferramenta opcional não estava disponível no ambiente; não conta como aprovação.
