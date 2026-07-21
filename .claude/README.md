# .claude — Agentes e automação (SDD Kit)

Define como o Claude Code trabalha no projeto: os **subagentes** (`agents/`) e os **comandos**
(`commands/`). Tudo é **genérico** e lê o que é específico do projeto de `sdd.config.md` (raiz).

## Agentes disponíveis

Cada tarefa em `specs/tasks/` é atribuída a um `@agente-*`. O escopo estreito mantém o
trabalho auditável e dentro das regras da config.

| Agente | Função | Lê da config |
|--------|--------|--------------|
| `agente-arquiteto-contratos` | Tipos/contratos compartilhados + OpenAPI | paths (3), contrato API (3-B) |
| `agente-frontend` | Implementa estado + UI + rotas + menu | stack, paths, gates (2,3,8) |
| `agente-mock-data` | Dados mockados realistas | paths (seção 3) |
| `agente-backend` | Backend de produção: serviços, repos, persistência, endpoints | stack, paths-B, camadas-B (2,3-B,5-B) |
| `agente-qa-testes` | Testes unit/componente/integração | comandos de teste (seção 2) |
| `agente-e2e` | Testes e2e de navegador | comando e2e (seção 2) |
| `agente-revisor-ux` | Clareza/UX (ex.: visibilidade do gate) | regras (seção 6) |
| `agente-acessibilidade` | Teclado, leitor de tela, ARIA | — |
| `agente-spec-guardian` | Valida código contra spec + greps de ausência | regras, proibidos, gates (6,7,8) |
| `agente-arquiteto-guardian` | Valida fidelidade aos ADRs e limites entre camadas | ADRs + arquitetura (5-C) |
| `agente-devops` | CI/CD, empacotamento e entrega | INFRA.md + comandos (2), plataforma da config |
| `agente-gerador-skills` | Gera skills sob medida a partir do discovery | discovery + regras/gates (6,8) |

> Cada agente traz, além das regras, um **protocolo de raciocínio** ("Como este agente
> raciocina") — a ordem em que carrega contexto, como se autoverifica e quando parar e escalar.
>
> Crie um agente novo só se uma especialidade não existir. Nunca hardcode tecnologia ou regra
> de projeto num agente — isso pertence ao `sdd.config.md`.

## Comandos

`/sdd-init` (bootstrap) · `/sdd-status` (dashboard) · `/gerar-projeto` (motor) · `/nova-spec`
· `/implementar-spec` · `/implementar-tarefa` · `/validar-e2e` · `/gerar-skills` (skills sob medida).

## Skills (`skills/`)

Documentos de perícia reutilizável, **gerados sob medida** para o projeto pelo
`@agente-gerador-skills` a partir do `specs/discovery/`. O kit não traz skills de domínio prontas
(seria perder portabilidade) — ele traz o gerador. Ver `skills/README.md`.

## Como o orquestrador divide o trabalho
1. Pega uma tarefa `T-XXX` em `specs/tasks/`.
2. Identifica o `@agente-*` responsável (e a camada da config seção 5).
3. Invoca o agente com o contexto da spec + a `sdd.config.md`.
4. O `agente-spec-guardian` valida contra a spec e os padrões proibidos antes de concluir.
