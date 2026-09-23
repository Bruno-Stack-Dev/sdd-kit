---
sdd-config-version: 1.0.0
projeto: <Nome do projeto>
atualizado-em: AAAA-MM-DD
---

# sdd.config — Configuração do projeto para o SDD Kit

> **Este é o único arquivo que o motor (`specs/_gerador/GERADOR.md`) e os agentes
> (`.claude/agents/*`) leem para saber o que é específico DESTE projeto.** O motor é
> genérico; tudo que muda de um projeto para outro mora aqui. Para começar, copie este
> arquivo para a **raiz do projeto** como `sdd.config.md` e preencha (ou rode `/sdd-init`).
>
> ⚠️ **As seções 7 (Padrões proibidos) e 8 (Gates) são a rede de segurança do kit.** O
> `sdd-lint.mjs` **falha** se elas ficarem só com placeholders (`<TODO>`, `<ex.: ...>`).
> Preencha com valores reais ou, se não se aplicam, escreva explicitamente `nenhum`.

---

## 1. Identidade

- **Nome:** <ex.: Educational AI Hub>
- **Tipo:** <ex.: SaaS B2B web · CLI · API · biblioteca>
- **Domínio em uma frase:** <o que o produto faz>
- **Estágio:** <ex.: frontend mockado · MVP · produção>

---

## 2. Stack e comandos

| Item | Valor neste projeto |
|------|---------------------|
| Linguagem/framework principal | <ex.: Vue 3 + TypeScript> |
| Biblioteca de UI | <ex.: Lyceo Design System via `@/ui`> · ou `n/a` |
| Estado | <ex.: Pinia> |
| Gerenciador de pacotes | <ex.: npm> |
| **Comando de testes (unit/componente)** | <ex.: `cd apps/web-frontend && npx vitest run`> |
| **Comando de testes e2e** | <ex.: `cd apps/web-frontend && npx playwright test`> · ou `n/a` |
| **Comando de typecheck/lint** | <ex.: `npm run typecheck`> · ou `n/a` |

> O motor roda exatamente estes comandos no Passo 6 (validação). Mantenha-os corretos.

---

## 3. Estrutura de pastas (paths)

Onde cada coisa é escrita. O motor e os agentes resolvem caminhos a partir daqui.

| Artefato | Caminho neste projeto |
|----------|------------------------|
| Specs | `specs/` (fixo no kit) |
| Contratos/tipos compartilhados | <ex.: `packages/types-contracts/`> |
| Módulo de domínio | <ex.: `apps/web-frontend/src/modules/<modulo>/`> |
| Mocks | <ex.: `<modulo>/mocks/*.mock.ts`> |
| Stores | <ex.: `<modulo>/stores/*.ts`> |
| Views/telas | <ex.: `<modulo>/views/*.vue`> |
| Rotas | <ex.: `<modulo>/routes/index.ts`> |
| **Registro de navegação (menu)** | <ex.: `src/layouts/AppShell.vue`> · ou `n/a` |
| Testes (colocação) | <ex.: `<modulo>/__tests__/`> |
| Testes e2e | <ex.: `apps/web-frontend/e2e/`> |

### 3-B. Paths de backend (se houver servidor)

> Preencha só se o projeto tem backend real. Deixe `n/a` num projeto mock-first.

| Artefato | Caminho neste projeto |
|----------|------------------------|
| Raiz do backend | <ex.: `apps/api/` · `services/`> · ou `n/a` |
| Handlers/controllers (borda) | <ex.: `apps/api/src/routes/`> |
| Serviços (regra de negócio) | <ex.: `apps/api/src/services/`> |
| Repositórios (acesso a dados) | <ex.: `apps/api/src/repositories/`> |
| Migrations | <ex.: `apps/api/migrations/`> |
| Contrato de API (OpenAPI) | <ex.: `specs/apis/openapi.yaml`> · ou `n/a` |
| Testes de integração | <ex.: `apps/api/tests/integration/`> |

---

## 4. Numeração de specs

- **Prefixo:** <ex.: `SPEC-2026-`> · espelhado em `PLAN-` / `TASKS-`.
- **Incremento por submódulo:** <ex.: `+10`>
- **Bloco inicial:** auto — o motor varre `specs/**` e usa o próximo bloco de centena livre.

---

## 5. Camadas de implementação (pipeline)

A ordem que o motor segue no Passo 5, **uma camada por vez até o verde**. Cada camada aponta
o agente responsável. Ajuste para a stack do projeto (um projeto Go/CLI terá camadas diferentes).

| Ordem | Camada | Agente | Saída esperada |
|-------|--------|--------|----------------|
| 1 | Contratos/tipos | `@agente-arquiteto-contratos` | tipos em `<contratos>`; literais p/ gates; `Patch` omite imutáveis |
| 2 | Dados mockados | `@agente-mock-data` | ≥5 itens cobrindo todos os estados; sem relógio real |
| 3 | Estado/store + invariantes | `@agente-frontend` | gate na store, escopo em todo getter/escrita, estados terminais |
| 4 | UI + rotas + menu | `@agente-frontend` | telas + rota + **entrada no menu** (se houver) |
| 5 | Testes unit/componente | `@agente-qa-testes` | 1 teste por CA + 1 invariante por regra crítica |
| 6 | Testes e2e | `@agente-e2e` | fluxo navegável real (se houver UI) |
| 7 | Guardião | `@agente-spec-guardian` | cada CA testado + greps de ausência = 0 |

### 5-B. Camadas de backend (quando há servidor)

Pipeline paralelo que o motor usa quando a spec toca o servidor (estágio da seção 1 inclui
backend). Pode rodar antes das camadas de UI (contrato → backend → mock que consome a API real)
ou em paralelo. Ajuste à stack (Node/Python/Go).

| Ordem | Camada | Agente | Saída esperada |
|-------|--------|--------|----------------|
| B1 | Contrato de API | `@agente-arquiteto-contratos` | OpenAPI/tipos; erros padronizados; contrato = fonte da verdade |
| B2 | Migrations + schema | `@agente-backend` | migrations reversíveis; invariantes como constraints |
| B3 | Repositórios | `@agente-backend` | acesso a dados isolado; escopo multi-tenant aplicado |
| B4 | Serviços (regra de negócio) | `@agente-backend` | invariantes e transações no serviço; caminhos de falha mapeados |
| B5 | Handlers + RBAC + validação | `@agente-backend` | endpoints da API.md; auth/RBAC/rate-limit no servidor |
| B6 | Testes de integração | `@agente-qa-testes` | 1 teste por endpoint (feliz + falhas + permissão) |
| B7 | Conformidade de contrato | `@agente-spec-guardian` | respostas batem com OpenAPI; RBAC negado testado |

### 5-C. Camadas de infraestrutura/entrega (quando aplicável)

| Ordem | Camada | Agente | Saída esperada |
|-------|--------|--------|----------------|
| I1 | Fidelidade à arquitetura | `@agente-arquiteto-guardian` | código respeita os ADRs; sem dependência proibida entre camadas |
| I2 | CI/CD + empacotamento | `@agente-devops` | pipeline (build→test→deploy) e artefatos conforme INFRA.md |

---

## 6. Regras inegociáveis (deste projeto)

> O guardião recusa entregas que violem qualquer item. Edite livremente por projeto.

1. **Spec-driven.** Todo trabalho deriva de uma spec em `specs/`. Sem spec → `/nova-spec` antes.
2. <ex.: **UI só via `@/ui`**; nunca outra lib de componentes.>
3. <ex.: **Mock-first** — sem banco, sem relógio real (`Date.now()`); datas mockadas fixas.>
4. <ex.: **Gate de controle humano** — ver seção 8.>
5. <ex.: **Contrato é a fonte da verdade** — backends se conformam aos tipos, não o contrário.>
6. <ex.: **Toda tela navegável está no menu** — rota sem entrada de menu é bug de entrega.>
7. <ex.: **1 teste por CA + 1 invariante por regra crítica** (provar ausência do caminho proibido).>

---

## 7. Padrões proibidos (grep de ausência)

O `@agente-spec-guardian` roda **cada linha** abaixo e o resultado tem que ser **0**. Adicionar
uma proibição nova = adicionar uma linha aqui (não editar o motor).

| Padrão (regex) | Escopo (path) | Esperado |
|----------------|----------------|----------|
| `<ex.: primeicons\|<i class="pi">>` | `<ex.: apps/web-frontend/src>` | 0 |
| `<ex.: habilitada.*true>` | `<ex.: src/modules/monitoramento/>` | 0 |
| `<ex.: Date\.now\(\)>` | `<ex.: src/modules/>` | 0 |

---

## 8. Gates de controle humano

Onde uma sugestão (de IA ou automática) **nunca** vira decisão sem confirmação humana explícita.
Para cada gate: estado `readonly` na store + um único setter validado + invariante de ausência.

| Decisão | Entidade | Setter único permitido | Invariante |
|---------|----------|------------------------|------------|
| <ex.: situação final do aluno> | <ex.: ConselhoClasse> | <ex.: `registrarDecisao()`> | nenhum setter alternativo existe |

> Se não houver gates de IA sobre pessoas, escreva `nenhum` e remova a regra correspondente da seção 6.

---

## 9. Tópicos bloqueados (pare e avise)

Assuntos que o motor **não** implementa sem autorização humana explícita — se o brief pedir, pare.

- <ex.: biometria, reconhecimento facial, detecção de comportamento/armas (ADR-2026-005)>
- <ex.: nenhum>

---

## 10. Defaults para o brief

Quando o brief omitir um campo **opcional**, o motor assume o default abaixo e registra em
"Decisões assumidas" na spec gerada.

| Campo opcional | Default deste projeto |
|----------------|------------------------|
| Multi-tenant/escopo | <ex.: escopo por `unidadeId` em todo getter/escrita> · ou `n/a` |
| Dados sensíveis/LGPD | <ex.: nome de menores é sensível; sem PII extra> |
| Não-objetivos | <ex.: sem backend/banco (mock-first)> |
| Restrições técnicas | <ex.: stack da seção 2> |

---

## 11. Portões de engenharia (opcionais)

Checagens de saúde de engenharia que o `sdd-lint.mjs` executa **se ativadas** aqui. Deixe em
branco/`false` num projeto simples; ative conforme o projeto amadurece. São o que separa
"passou nos testes" de "pronto para produção".

| Portão | Ativar? | Como / limite |
|--------|---------|---------------|
| Cobertura mínima de testes | <ex.: `false`> | <ex.: comando que emite cobertura + limite, ex. 80%> |
| Auditoria de dependências | <ex.: `false`> | <ex.: `npm audit --audit-level=high` · `pip-audit` · `govulncheck`> |
| Lint de segurança | <ex.: `false`> | <ex.: `semgrep --config auto` · regra do projeto> |
| Migrations reversíveis | <ex.: `false`> | <ex.: toda migration tem `down`; comando que testa up+down> |
| Conformidade de contrato (API) | <ex.: `false`> | <ex.: validar respostas contra `specs/apis/openapi.yaml`> |

> Estes portões são **avisos** por padrão (não bloqueiam), a menos que você os marque como
> bloqueantes. O `@agente-devops` espelha os ativos no pipeline de CI.

---

## 12. Design System (opcional)

Calibra as **skills do pack Design System Ops** (`_packs/ds/`). Preencha só se o projeto
tem/mantém um design system. A **ativação** do pack é mecânica: o `/sdd-init` **copia**
`_packs/ds/` para `.claude/skills/` quando há DS (veja `.claude/skills/README.md`) — não existe
mais o flag `ativo:`. Sem DS, o pack fica inativo em `_packs/` e esta seção pode ficar vazia.
Substitui o `.ds-ops-config.yml` do plugin original: as skills DS leem **esta seção**.

### 12.1 Identidade do DS
| Item | Valor |
|------|-------|
| Nome do design system | <ex.: Apex> · ou `n/a` |
| Nº aproximado de componentes | <ex.: 24> (< 5 ativa modo "sistema pequeno") |
| Framework | <ex.: react · vue · svelte · web-components> |
| Estilização | <ex.: css-vars · scss · tailwind · emotion> |
| Suporta temas (multi-theme)? | <ex.: true · false> |
| Raiz dos tokens | <ex.: `packages/tokens/`> · ou `n/a` |
| Raiz dos componentes do DS | <ex.: `packages/ui/src/`> · ou `n/a` |

### 12.2 Calibração de severidade (findings das auditorias)
> Valores: `critical` · `high` · `medium` · `low`. Defaults sensatos entre parênteses.

| Violação | Severidade |
|----------|------------|
| Cor hardcoded (`hardcoded_color`) | <high — `critical` se houver temas> |
| Espaçamento hardcoded (`hardcoded_spacing`) | <medium> |
| Tipografia hardcoded (`hardcoded_typography`) | <medium> |
| Referência de tier errada (`wrong_tier_reference`) | <high> |
| Estado de interação faltando (`missing_interaction_state`) | <high> |
| ARIA faltando (`missing_aria`) | <critical> |
| Violação de nomenclatura (`naming_violation`) | <medium> |
| Vazamento de tier (`tier_leakage`) | <high> |

### 12.3 Portões de release do DS (agente component-to-release)
| Portão | Bloqueia release? |
|--------|-------------------|
| Tier errado (`wrong_tier`) | <true> |
| Cor hardcoded | <true quando há temas> |
| Teclado (acessibilidade) | <true> |
| Contraste | <true — `false` só em transição de marca com prazo> |
| Divergência crítica design↔código | <true> |

### 12.4 Integrações (opcional — auto-pull de dados)
> Só o que o projeto usa. Segredos vêm de variável de ambiente, nunca aqui.

| Fonte | Ativa? | Referência |
|-------|--------|-----------|
| Figma | <false> | <file_key; PAT em env `FIGMA_ACCESS_TOKEN`> |
| Storybook | <false> | <URL publicada ou dir `storybook-static`> |
| Style Dictionary | <false> | <path do config; versão 3/4> |
| GitHub | <false> | <`org/repo`; token em env> |
| npm | <false> | <nome do pacote; registry> |
| Chromatic | <false> | <app id; token em env> |
| Documentação (zeroheight/supernova) | <false> | <plataforma; URL; api key em env> |

### 12.5 Relatórios recorrentes
| Item | Valor |
|------|-------|
| Diretório de saída | <ex.: `.ds-ops-reports/`> |
| Padrão de nome | <ex.: `{skill}-{date}`> |
| Modo de comparação | <ex.: full · summary> |
| Quantos manter | <ex.: 8> |
| Limite de doc obsoleta (dias) | <ex.: 90> |
