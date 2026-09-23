# Componentes de terceiros

O material **próprio** do SDD Kit (motor, CLI, agentes, skills núcleo, templates, políticas, schemas,
docs) é MIT — ver [`LICENSE`](LICENSE). Os componentes abaixo mantêm as licenças e a atribuição de
origem. A fonte de verdade de proveniência e integridade é o [`skills.lock.json`](skills.lock.json)
(`sdd skills info <nome>`; `sdd skills verify`).

O **core não tem dependências de runtime** (npm/pip): só Node.js ≥ 20. As integrações da tabela
"Ferramentas opcionais" nunca são instaladas pelo kit; quando usadas, rodam via `npx`/`uvx` com versão
fixada e o ausente vira `NOT_RUN`.

## Packs de skills vendorizados (inativos por padrão)

| Pack | Origem | Versão | Licença | Atribuição | Observações |
|------|--------|--------|---------|------------|-------------|
| `arch` (14 skills + `_arch-templates/`) | software-architecture-skills — *software-architecture-pack* (URL não registrada na vendorização) | v0.1.0 | MIT | [`_packs/arch/_arch-templates/ATTRIBUTION.md`](.claude/skills/_packs/arch/_arch-templates/ATTRIBUTION.md) | adaptado para `specs/decisions/` e o guardião de arquitetura; v3 corrigiu o YAML das descrições |
| `ds` (44 skills + `_knowledge-notes/`) | [murphytrueman/design-system-ops](https://github.com/murphytrueman/design-system-ops) | commit não registrado | MIT | [`_packs/ds/_knowledge-notes/ATTRIBUTION.md`](.claude/skills/_packs/ds/_knowledge-notes/ATTRIBUTION.md) | config lida de `design_system` (sdd.config) |
| `uiux` (7 skills) | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | v2.11.0 | MIT **e** Apache-2.0 **e** OFL-1.1 | [`_packs/uiux/uiux-ui-ux-pro-max/ATTRIBUTION-SDD-KIT.md`](.claude/skills/_packs/uiux/uiux-ui-ux-pro-max/ATTRIBUTION-SDD-KIT.md) | ver pendências abaixo |

### Pendências registradas (não resolvidas pelo kit)

- **Licença divergente:** `uiux-ui-styling/SKILL.md` declara `license: MIT`, mas a pasta traz
  `LICENSE.txt` **Apache-2.0**. Até a origem esclarecer, trate essa skill como Apache-2.0 (exige
  preservar o aviso de licença e registrar modificações).
- **Fontes:** `uiux-ui-styling/canvas-fonts/` tem 28 arquivos de licença **SIL OFL 1.1** (uma por
  família). Redistribuição permitida com a licença junto; não vender as fontes isoladamente.
- **Risco (supply chain):** `uiux-design/scripts/{cip,icon,logo}/generate.py` carregam variáveis de
  `.env` (pasta da skill e `~/.claude/`) e chamam a API Gemini do Google. O `skills.lock.json` marca o
  pack com risco `high`. Os hooks do SDD não enxergam o que um script Python lê em runtime — só o
  sandbox contém isso.
- **Commits de origem** de `arch` e `ds` não foram registrados na vendorização v2 (`ref: null` no lock).

## Ferramentas opcionais (nunca dependências do core)

Versões e ressalvas verificadas em [`docs/references/integrations-snapshot.md`](docs/references/integrations-snapshot.md).

| Ferramenta | Uso no kit | Licença |
|------------|-----------|---------|
| Cisco AI Defense skill-scanner | `sdd skills scan --external` | Apache-2.0 |
| Snyk Agent Scan | scan de MCP/skills em sandbox, com consentimento | Apache-2.0 |
| Promptfoo | evals comportamentais (workflow manual/noturno) | MIT |
| `@anthropic-ai/claude-agent-sdk` | provider do Promptfoo nas evals com modelo — instalado só no job de evals | proprietária (termos da Anthropic) |
| Context7 MCP | perfil MCP `minimal` | MIT |
| Playwright MCP | perfil MCP `e2e` | Apache-2.0 |
| MCP Inspector | captura de schema de ferramentas para o lock de MCP | MIT |
| Repomix | `sdd export-context --repomix` | MIT |
| Arize Phoenix | backend opcional de traces (`sdd trace export --otlp`) | Elastic License 2.0 (verificado) |
| IBM ContextForge | perfil MCP `enterprise` (gateway) | Apache-2.0 |

## GitHub Actions (CI do kit)

`actions/checkout`, `actions/setup-node`, `actions/setup-python` — MIT, fixadas por SHA no workflow.
