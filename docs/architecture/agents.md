# Agentes do SDD Kit (v3)

Doze subagentes com escopo estreito. Cada definição em `.claude/agents/<nome>.md` traz: função,
quando é usado, protocolo de raciocínio, regras, **ferramentas e limites**, **contrato de saída**,
**contrato de falha** e **fontes de verdade**. Os testes em `tests/integration/agents/` e o doctor
garantem essa forma; os casos comportamentais ficam em `evals/agents/agents.json`.

| Agente | Função | Ferramentas | Escreve? |
|--------|--------|-------------|----------|
| `agente-arquiteto-contratos` | tipos/contratos e OpenAPI | Read, Grep, Glob, LSP, Edit, Write, Bash, Skill | sim |
| `agente-frontend` | store, telas, rotas, menu | Read, Grep, Glob, LSP, Edit, Write, Bash, Skill | sim |
| `agente-backend` | serviços, repositórios, endpoints, migrations | Read, Grep, Glob, LSP, Edit, Write, Bash, Skill | sim |
| `agente-mock-data` | dados mockados determinísticos | Read, Grep, Glob, Edit, Write, Bash | sim |
| `agente-qa-testes` | testes por CA + negativos | Read, Grep, Glob, LSP, Edit, Write, Bash, Skill | sim |
| `agente-e2e` | e2e pelo menu, evidência por CA | Read, Grep, Glob, Edit, Write, Bash, Skill | sim |
| `agente-devops` | CI/CD e empacotamento | Read, Grep, Glob, Edit, Write, Bash | sim |
| `agente-gerador-skills` | skills do projeto a partir do discovery | Read, Grep, Glob, Edit, Write, Bash | sim |
| `agente-acessibilidade` | teclado, ARIA, contraste | Read, Grep, Glob, LSP, Edit, Write, Bash | sim |
| `agente-spec-guardian` | evidência por CA + padrões proibidos | Read, Grep, Glob, LSP, Bash · **nega** Write/Edit/MultiEdit/NotebookEdit | **não** |
| `agente-arquiteto-guardian` | fidelidade aos ADRs | Read, Grep, Glob, LSP, Bash · **nega** Write/Edit/MultiEdit/NotebookEdit | **não** |
| `agente-revisor-ux` | clareza e visibilidade dos gates | Read, Grep, Glob, LSP · **nega** escrita e Bash | **não** |

## Princípios

- **Mínimo privilégio.** Nenhum agente tem WebFetch/WebSearch nem pode criar subagentes;
  documentação atual de bibliotecas vem do MCP Context7 sob governança (perfil `minimal`).
- **Auditor não altera o que audita.** Três camadas: sem ferramentas de escrita (`tools`), escrita
  negada (`disallowedTools`) e hook que nega escrita por `agent_type` (exceto relatórios em
  `.sdd/reports/`).
- **LSP antes de varredura.** Com o plugin de code intelligence ativo, definição/referências/
  diagnósticos vêm do `LSP`; Grep fica para texto livre (ver `docs/architecture/code-intelligence.md`).
- **Eventos pelo orquestrador.** Agentes devolvem resultado e evidência; quem grava
  `TASK_*`/`GUARDIAN_*` é o workflow (skill), e o `SubagentStop` impede o agente de sair com tarefa
  própria `in_progress`.

## Skills pré-carregadas

Nenhuma por padrão: os packs ficam inativos e pré-carregar skill inexistente é erro. Um projeto pode
acrescentar `skills: [<skill-do-projeto>]` a um agente quando a skill for sempre relevante para ele
(ex.: a skill de domínio de pagamentos no `agente-backend`); o doctor valida que ela existe.

## Memória por agente

Avaliada e **desligada por padrão**. `memory: project` persiste heurísticas em
`.claude/agent-memory/<agente>/`, mas memória compete com a fonte de verdade: uma lembrança antiga
pode contradizer a spec atual. Regra, quando um projeto habilitar:

```text
Spec / Config / ADR  >  memória do agente
```

Use só para heurísticas operacionais (ex.: "neste repo os testes de integração exigem `docker compose
up db`"), nunca para regras de negócio. O bloco "Fontes de verdade" de cada agente reforça a ordem.

## `permissionMode`

Não definido (herda o da sessão). `bypassPermissions` é recusado pelo doctor em agentes do kit;
`plan` não serve aos guardiões porque eles precisam rodar testes.
