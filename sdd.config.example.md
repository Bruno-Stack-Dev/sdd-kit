---
sdd-config-version: 3
projeto: <ex.: Educational AI Hub>
atualizado-em: <ex.: 2026-09-23>
gerado-de: sdd.config.example.yaml
---

<!-- AUTO-GENERATED — DO NOT EDIT DIRECTLY. Fonte canônica: sdd.config.example.yaml. Regenerar: node scripts/sdd.mjs config render -->

# sdd.config — Configuração do projeto para o SDD Kit

> **Visão gerada.** A fonte da verdade é `sdd.config.example.yaml` (validada por
> `schemas/sdd-config.schema.json`). Edite o YAML e rode `node scripts/sdd.mjs config render`.
> Agentes podem ler esta visão; as seções mantêm a numeração do formato v2.

## 1. Identidade

- **Nome:** <ex.: Educational AI Hub>
- **Tipo:** <ex.: SaaS B2B web · CLI · API · biblioteca>
- **Domínio em uma frase:** <ex.: o que o produto faz, em uma frase>
- **Estágio:** <ex.: mock-first · MVP · produção>

## 2. Stack e comandos

| Item | Valor neste projeto |
|---|---|
| Linguagem/framework principal | <ex.: Vue 3 + TypeScript> |
| Biblioteca de UI | <ex.: Lyceo Design System via `@/ui`> |
| Estado | <ex.: Pinia> |
| Gerenciador de pacotes | <ex.: npm> |
| **Comando de testes (unit/componente)** | <ex.: cd apps/web-frontend && npx vitest run> |
| **Comando de testes e2e** | <ex.: cd apps/web-frontend && npx playwright test> |
| **Comando de typecheck/lint** | <ex.: npm run typecheck> |

> O motor roda exatamente estes comandos na validação. `n/a` = não se aplica.

## 3. Estrutura de pastas (paths)

| Artefato | Caminho neste projeto |
|---|---|
| Specs | `specs/` |
| Contratos/tipos compartilhados | <ex.: packages/types-contracts/> |
| Módulo de domínio | <ex.: apps/web-frontend/src/modules/<modulo>/> |
| Mocks | <ex.: <modulo>/mocks/*.mock.ts> |
| Stores | <ex.: <modulo>/stores/*.ts> |
| Views/telas | <ex.: <modulo>/views/*.vue> |
| Rotas | <ex.: <modulo>/routes/index.ts> |
| Registro de navegação (menu) | <ex.: src/layouts/AppShell.vue> |
| Testes (colocação) | <ex.: <modulo>/__tests__/> |
| Testes e2e | <ex.: apps/web-frontend/e2e/> |

### 3-B. Paths de backend

| Artefato | Caminho neste projeto |
|---|---|
| Raiz do backend | <ex.: apps/api/> |
| Handlers/controllers (borda) | <ex.: apps/api/src/routes/> |
| Serviços (regra de negócio) | <ex.: apps/api/src/services/> |
| Repositórios (acesso a dados) | <ex.: apps/api/src/repositories/> |
| Migrations | <ex.: apps/api/migrations/> |
| Contrato de API (OpenAPI) | <ex.: specs/apis/openapi.yaml> |
| Testes de integração | <ex.: apps/api/tests/integration/> |

## 4. Numeração de specs

- **Prefixo:** <ex.: SPEC-2026-> · espelhado em `PLAN-` / `TASKS-`.
- **Incremento por submódulo:** `+10`
- **Bloco inicial:** auto — próximo bloco de centena livre (`sdd spec new`)

## 5. Camadas de implementação (pipelines)

A ordem que o motor segue, uma etapa por vez até o verde. `sdd spec new` gera as tarefas a partir destas etapas.

### Pipeline `frontend`

| Ordem | ID | Camada | Agente | Saída esperada | Quando | Guardião |
|---|---|---|---|---|---|---|
| 1 | `contratos` | Contratos/tipos | `@agente-arquiteto-contratos` | tipos no path de contratos; literais p/ gates; Patch omite imutáveis | n/a | não |
| 2 | `mocks` | Dados mockados | `@agente-mock-data` | ≥5 itens cobrindo todos os estados; sem relógio real | n/a | não |
| 3 | `store` | Estado/store + invariantes | `@agente-frontend` | gate na store, escopo em todo getter/escrita, estados terminais | n/a | não |
| 4 | `ui` | UI + rotas + menu | `@agente-frontend` | telas + rota + entrada no menu | se houver UI | não |
| 5 | `testes` | Testes unit/componente | `@agente-qa-testes` | 1 teste por CA + 1 invariante por regra crítica | n/a | não |
| 6 | `e2e` | Testes e2e | `@agente-e2e` | fluxo navegável real, entrando pelo menu | se houver UI navegável | não |
| 7 | `guardiao` | Guardião | `@agente-spec-guardian` | cada CA com evidência + padrões proibidos = esperado | n/a | sim |

### Pipeline `backend`

| Ordem | ID | Camada | Agente | Saída esperada | Quando | Guardião |
|---|---|---|---|---|---|---|
| 1 | `contrato-api` | Contrato de API | `@agente-arquiteto-contratos` | OpenAPI/tipos; erros padronizados | n/a | não |
| 2 | `migrations` | Migrations + schema | `@agente-backend` | migrations reversíveis; invariantes como constraints | n/a | não |
| 3 | `repositorios` | Repositórios | `@agente-backend` | acesso a dados isolado; escopo multi-tenant aplicado | n/a | não |
| 4 | `servicos` | Serviços (regra de negócio) | `@agente-backend` | invariantes e transações no serviço | n/a | não |
| 5 | `handlers` | Handlers + RBAC + validação | `@agente-backend` | endpoints da API.md; auth/RBAC/rate-limit no servidor | n/a | não |
| 6 | `integracao` | Testes de integração | `@agente-qa-testes` | 1 teste por endpoint (feliz + falhas + permissão) | n/a | não |
| 7 | `conformidade` | Conformidade de contrato | `@agente-spec-guardian` | respostas batem com OpenAPI; RBAC negado testado | n/a | sim |

### Pipeline `delivery`

| Ordem | ID | Camada | Agente | Saída esperada | Quando | Guardião |
|---|---|---|---|---|---|---|
| 1 | `arquitetura` | Fidelidade à arquitetura | `@agente-arquiteto-guardian` | código respeita os ADRs; sem dependência proibida entre camadas | n/a | sim |
| 2 | `ci-cd` | CI/CD + empacotamento | `@agente-devops` | pipeline (build→test→deploy) conforme INFRA.md | n/a | não |

## 6. Regras inegociáveis (deste projeto)

> O guardião recusa entregas que violem qualquer item.

1. **Spec-driven.** Todo trabalho deriva de uma spec em `specs/`. Sem spec → `/nova-spec` antes.
2. <ex.: **UI só via `@/ui`**; nunca outra lib de componentes.>
3. <ex.: **Mock-first** — sem banco, sem relógio real (`Date.now()`); datas mockadas fixas.>
4. <ex.: **Contrato é a fonte da verdade** — backends se conformam aos tipos.>
5. <ex.: **Toda tela navegável está no menu** — rota sem menu é bug de entrega.>
6. <ex.: **1 teste por CA + 1 invariante por regra crítica** (provar ausência).>

## 7. Padrões proibidos (grep de ausência)

Executados por `node scripts/sdd.mjs check forbidden`; o resultado de cada linha tem de ser o esperado.

| Padrão (regex) | Escopo (path) | Esperado | Motivo |
|---|---|---|---|
| <ex.: primeicons\|<i class="pi">> | <ex.: apps/web-frontend/src> | 0 | <ex.: lib de ícones concorrente do design system> |
| <ex.: Date\.now\(\)> | <ex.: src/modules/> | 0 | n/a |

## 8. Gates de controle humano

| Decisão | Entidade | Setter único permitido | Invariante |
|---|---|---|---|
| <ex.: situação final do aluno> | <ex.: ConselhoClasse> | <ex.: registrarDecisao()> | nenhum setter alternativo existe |

## 9. Tópicos bloqueados (pare e avise)

- <ex.: biometria, reconhecimento facial, detecção de comportamento/armas>

## 10. Defaults para o brief

| Campo opcional | Default deste projeto |
|---|---|
| Multi-tenant/escopo | <ex.: escopo por `unidadeId` em todo getter/escrita> |
| Dados sensíveis/LGPD | <ex.: nome de menores é sensível; sem PII extra> |
| Não-objetivos | <ex.: sem backend/banco (mock-first)> |
| Restrições técnicas | <ex.: stack da seção 2> |

## 11. Portões de engenharia

| Portão | Ativar? | Bloqueia? | Comando | Limite |
|---|---|---|---|---|
| Cobertura mínima de testes | false | false | <ex.: npx vitest run --coverage> | 80 |
| Auditoria de dependências | false | false | <ex.: npm audit --audit-level=high> |  |
| Lint de segurança | false | false | <ex.: semgrep --config auto> |  |
| Migrations reversíveis | false | false | <ex.: comando que testa up+down> |  |
| Conformidade de contrato (API) | false | false | <ex.: validar respostas contra specs/apis/openapi.yaml> |  |

## 12. Design System

n/a — sem design system (ative o pack `ds` e preencha `design_system` se houver).

## 13. Extensões v3

Blocos sem representação em tabela na visão v2 (segurança, integrações, agentes, IA, legado).

```yaml
security:
  protected_paths: []
  production:
    db_write: deny
    markers: []
  destructive_git: deny
  network:
    mode: sandbox
    allowed_domains: []
agents:
  disabled: []
  models:
    profile: balanced
    overrides: {}
    roles: {}
integrations:
  mcp_profile: minimal
  packs: []
  lsp:
    enabled: false
```
