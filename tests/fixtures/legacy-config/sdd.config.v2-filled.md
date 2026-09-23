---
sdd-config-version: 1.0.0
projeto: Biblioteca Escolar
atualizado-em: 2026-08-01
---

# sdd.config — Configuração do projeto para o SDD Kit

> Fixture: config v2 preenchida, como um projeto real instalado com o kit 2.0.0.

---

## 1. Identidade

- **Nome:** Biblioteca Escolar
- **Tipo:** SaaS web
- **Domínio em uma frase:** gerencia acervo e empréstimos de livros de uma escola
- **Estágio:** frontend mockado

---

## 2. Stack e comandos

| Item | Valor neste projeto |
|------|---------------------|
| Linguagem/framework principal | Vue 3 + TypeScript |
| Biblioteca de UI | `n/a` |
| Estado | Pinia |
| Gerenciador de pacotes | npm |
| **Comando de testes (unit/componente)** | `npx vitest run` |
| **Comando de testes e2e** | n/a |
| **Comando de typecheck/lint** | `npm run typecheck` |

---

## 3. Estrutura de pastas (paths)

| Artefato | Caminho neste projeto |
|----------|------------------------|
| Specs | `specs/` (fixo no kit) |
| Contratos/tipos compartilhados | `src/types/` |
| Módulo de domínio | `src/modules/<modulo>/` |
| Mocks | `<modulo>/mocks/*.mock.ts` |
| Stores | `<modulo>/stores/*.ts` |
| Views/telas | `<modulo>/views/*.vue` |
| Rotas | `<modulo>/routes/index.ts` |
| **Registro de navegação (menu)** | `src/layouts/AppShell.vue` |
| Testes (colocação) | `<modulo>/__tests__/` |
| Testes e2e | n/a |

---

## 4. Numeração de specs

- **Prefixo:** `BIB-` · espelhado em `PLAN-` / `TASKS-`.
- **Incremento por submódulo:** `+10`
- **Bloco inicial:** auto — o motor varre `specs/**` e usa o próximo bloco de centena livre.

---

## 5. Camadas de implementação (pipeline)

| Ordem | Camada | Agente | Saída esperada |
|-------|--------|--------|----------------|
| 1 | Contratos/tipos | `@agente-arquiteto-contratos` | tipos em `src/types/` |
| 2 | Dados mockados | `@agente-mock-data` | ≥5 itens cobrindo todos os estados |
| 3 | Estado/store + invariantes | `@agente-frontend` | gate na store |
| 4 | UI + rotas + menu | `@agente-frontend` | telas + rota + **entrada no menu** |
| 5 | Testes unit/componente | `@agente-qa-testes` | 1 teste por CA |
| 6 | Guardião | `@agente-spec-guardian` | cada CA testado + greps de ausência = 0 |

---

## 6. Regras inegociáveis (deste projeto)

1. **Spec-driven.** Todo trabalho deriva de uma spec em `specs/`. Sem spec → `/nova-spec` antes.
2. **Mock-first** — sem banco, sem relógio real (`Date.now()`); datas mockadas fixas.
3. **Toda tela navegável está no menu** — rota sem entrada de menu é bug de entrega.

---

## 7. Padrões proibidos (grep de ausência)

| Padrão (regex) | Escopo (path) | Esperado |
|----------------|----------------|----------|
| `primeicons\|<i class="pi">` | `src/` | 0 |

---

## 8. Gates de controle humano

nenhum — não há sugestão de IA decidindo sobre pessoas neste projeto.

---

## 9. Tópicos bloqueados (pare e avise)

- nenhum

---

## 10. Defaults para o brief

| Campo opcional | Default deste projeto |
|----------------|------------------------|
| Multi-tenant/escopo | `n/a` |
| Dados sensíveis/LGPD | nome de alunos é sensível |
| Não-objetivos | sem backend/banco (mock-first) |
| Restrições técnicas | stack da seção 2 |

---

## 11. Portões de engenharia (opcionais)

| Portão | Ativar? | Como / limite |
|--------|---------|---------------|
| Cobertura mínima de testes | `true` | `npx vitest run --coverage` |
| Auditoria de dependências | `false` | `npm audit --audit-level=high` |

---

## 13. Observações do time

Seção livre criada pelo time: revisão quinzenal das specs com a coordenação pedagógica.
