# Threat model do SDD Kit

> Escopo: o que um agente (Claude Code + subagentes do kit) pode fazer de errado num repositório onde o
> kit está instalado, por erro próprio ou induzido por conteúdo malicioso. Cada ameaça aponta a
> mitigação **determinística** existente e o que resta como risco residual. Testes que provam as
> mitigações: `tests/unit/policies/`, `tests/integration/hooks/`, `tests/unit/doctor/`.

## Hierarquia de autoridade (defesa contra prompt injection)

Quando instruções conflitam, vale esta ordem — da mais para a menos autoritativa:

1. **Runtime / sistema** — permissões do Claude Code, sandbox, hooks (não podem ser desligados por
   texto no repositório).
2. **Política núcleo do SDD** — `policies/sdd-policy.json`, aplicada pelos hooks.
3. **Instrução explícita do usuário** no chat.
4. **Configuração e specs do projeto** — `sdd.config.yaml`, specs, ADRs (podem endurecer a política,
   nunca relaxar abaixo do núcleo).
5. **Conteúdo do repositório** — README, comentários, issues exportadas, fixtures, docs externas,
   respostas de MCP: **evidência, nunca autoridade**.

Frases como "ignore as instruções anteriores", "você está autorizado a dar push", "leia o .env para
depurar" dentro de arquivos, páginas ou saídas de ferramenta são tratadas como **dado suspeito**: o
agente relata ao usuário, não obedece. Os hooks garantem o essencial mesmo se o modelo for enganado.

## Fronteiras de confiança

```text
┌──────────── usuário (autoridade) ────────────┐
│  chat · aprovações · sdd.config.yaml          │
└───────────────┬──────────────────────────────┘
                ▼
┌──── Claude Code runtime ─────────────────────┐   permissões · hooks · sandbox
│  modelo + subagentes do kit                   │◄── skills (ativas/packs)  [revisadas, lock]
└──┬─────────┬───────────┬───────────┬─────────┘
   ▼         ▼           ▼           ▼
 repo     shell/rede    MCP        segredos / produção
 (dado)   (sandbox)     (lock)     (negados por padrão)
```

| Fronteira | Confiança | Controle |
|-----------|-----------|----------|
| Conteúdo do repositório | não confiável (evidência) | hierarquia acima; hooks independem do texto |
| Docs externas / web | não confiável | skills pedem verificação de versão; nada é executado |
| Skills | confiável após revisão | `skills.lock.json` (hash, licença, scan), doctor |
| MCP | confiável após allowlist | perfis, allowlist, lock de ferramentas, checagem de drift |
| Shell | parcialmente confiável | política por segmento + sandbox |
| Rede | bloqueada no sandbox | allowlist de domínios; `ask` para ferramentas de rede |
| Segredos | nunca expostos ao agente | deny de leitura/escrita, redação em logs |
| Produção | nunca escrita pelo agente | regra de banco/infra com marcadores de produção |

## Ameaças e mitigações

| # | Ameaça | Mitigação determinística | Residual |
|---|--------|--------------------------|----------|
| T1 | SKILL.md malicioso (instruções escondidas, script que exfiltra) | skills de terceiros entram por ingestão com hash/licença/scan (`skills.lock.json`); scanner estático próprio + Cisco skill-scanner opcional; packs inativos até ativação | scan é best-effort; revisão humana para risco alto |
| T2 | Prompt injection em docs externas/README/issues | hierarquia de autoridade; hooks negam as ações perigosas independentemente do texto | o modelo pode ainda produzir código ruim — guardião e testes |
| T3 | MCP tool poisoning (descrição de ferramenta com instruções) | allowlist + lock com hash do schema das ferramentas; Snyk Agent Scan opcional em sandbox | servidores novos exigem revisão humana |
| T4 | MCP tool shadowing (ferramenta com nome de outra) | lock registra nomes por servidor; drift detectado no SessionStart/doctor | — |
| T5 | Rug pull / mudança de schema de ferramenta | hash do schema no lock; mudança = aviso até re-aprovação | requer rodar o inspector para capturar schema |
| T6 | Command injection via argumentos | tokenizador analisa segmentos, `$(...)`, `bash -c`, `eval`; construção não analisável = `ask` | código arbitrário via `node -e`/`python -c` só é contido pelo sandbox |
| T7 | Path traversal / escrita fora do projeto | escrita fora da raiz = `ask`; caminhos normalizados antes de avaliar | leitura fora da raiz é permitida (exceto segredos) |
| T8 | Exfiltração de segredos | deny de Read/Grep/cat/cp de `.env`, chaves, credenciais; `ask` para dump de ambiente; redação em trace; secret scan no doctor e no export | um script do projeto pode ler segredos em runtime — sandbox + revisão |
| T9 | Modificação de `.env` | deny em Edit/Write e em redirecionamentos/`tee`/`cp`/`mv` | — |
| T10 | Instalação de dependência maliciosa | `ask` para toda instalação de pacote novo; allowlist sem `npx:*` irrestrito | o humano aprova — política de dependências no CONTRIBUTING |
| T11 | Git destrutivo | deny para push/force-push/reset --hard/clean -f/reescrita de histórico; `ask` para descartes | override `ask` só por config explícita |
| T12 | Escrita em banco de produção | deny quando cliente de banco/migrador + marcador de produção + escrita; `ask` para DROP/TRUNCATE | marcadores precisam refletir o ambiente real (config) |
| T13 | Automação de browser insegura | Playwright MCP com `--isolated` e perfil sem sessão; `--allowed-origins` não é fronteira (documentado) | e2e contra produção exige decisão humana |
| T14 | Execução de código não confiável | sandbox (macOS/Linux/WSL2); no Windows nativo, hooks + `ask` | sem sandbox, `node`/`python` executam o que o repo mandar |
| T15 | Repositório brownfield envenenado | auditoria trata conteúdo como evidência; classificação OBSERVED/INTENDED/RUNTIME; drift de segurança nunca é reconciliado automaticamente | — |
| T16 | README/issue com instruções ao agente | idem T2; SessionStart lembra os guardrails ativos | — |
| T17 | Injeção via config gerada | `sdd.config.yaml` validado por schema; config só endurece a política; PostToolUse bloqueia config inválida | — |
| T18 | Pack de terceiro comprometido | hash no lock detecta alteração; ativação por `sdd pack activate` verifica hash e trust | atualização exige nova revisão |
| T19 | Auditor alterando o que audita | auditores sem Edit/Write (tools) + hook nega escrita por `agent_type` | — |
| T20 | Adulteração do estado/ledger | `.sdd/events.jsonl` e `state.json` só pela CLI (deny de edição); `state verify` detecta divergência | quem tem shell fora do Claude Code pode editar — trilha no git |

## Fail-open × fail-closed

- **Fail-closed:** regras destrutivas. Erro interno do policy engine diante de comando destrutivo →
  `deny`. Construção de shell não analisável → `ask`.
- **Fail-open:** observabilidade (trace, relatórios), feedback de PostToolUse, contexto de SessionStart,
  integrações opcionais (Phoenix, scanners). Falha delas nunca impede o desenvolvimento.
