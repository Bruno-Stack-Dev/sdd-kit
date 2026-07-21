---
titulo: GERADOR — Pipeline automático de brief → specs → código
versao: 2.0.0
atualizado-em: 2026-06-23
tipo: orquestrador
tags: [gerador, pipeline, sdd, automacao, portavel]
---

# GERADOR — Pipeline automático de specs (motor genérico)

> **Este é o motor do SDD Kit, apontado pelo `CLAUDE.md`.** Quando o usuário pedir para "ler
> o gerador", "gerar o projeto" ou rodar `/gerar-projeto`, **execute este playbook do início
> ao fim, sem pedir confirmação intermediária** — exceto no único ponto de parada do **Passo 1**.
>
> **Princípio:** este arquivo é genérico. Tudo que é específico do projeto (stack, paths,
> comandos de teste, regras, padrões proibidos, gates) vive em **`sdd.config.md`** na raiz.
> Nunca escreva um fato de projeto aqui — leia-o da config.

## O que este pipeline faz

Transforma **um brief markdown** (em `specs/_entrada/`) num conjunto completo de
**specs + planos + tarefas** e então **implementa o código** seguindo as *camadas de
implementação* declaradas em `sdd.config.md` (seção 5), com testes, validação pelo
`@agente-spec-guardian` e feedback de execução — **sem o usuário criar arquivos à mão**.

---

## Passo 0 — Pré-condições (sempre)

1. **Leia `sdd.config.md`** (raiz). Se não existir, **pare e diga: "rode `/sdd-init` primeiro"**.
   - Rode `node scripts/sdd-lint.mjs`. Se ele acusar placeholders nas seções 7/8 da config,
     **pare e avise**: a rede de segurança (padrões proibidos, gates) precisa estar preenchida
     antes de gerar código sobre ela.
2. Leia o `CLAUDE.md`. As regras inegociáveis (config seção 6) valem para tudo que for gerado.
3. Rode o **comando de testes** (config seção 2) e confirme verde. Se houver vermelho
   pré-existente, **pare e avise** — não gere sobre base quebrada.

---

## Passo 1 — Ler e validar o brief (único ponto de parada)

1. Localize o brief em `specs/_entrada/`: o **único** `.md` que **não** seja `README.md` nem
   comece com `EXEMPLO`.
   - Nenhum → avise: "Coloque um `.md` com o projeto em `specs/_entrada/`" e encerre.
   - Mais de um → liste e pergunte qual usar.
2. Confronte o brief com o **Checklist de informação** (fim deste arquivo).
3. **Se faltar campo OBRIGATÓRIO ou houver ambiguidade:** faça **uma** pergunta objetiva
   listando só os gaps e aguarde. Não adivinhe campos obrigatórios.
4. **Se completo:** prossiga sem interação. Para opcionais ausentes, use o default da
   config (seção 10) e registre em **"Decisões assumidas"** na spec gerada.
5. **Tópicos bloqueados** (config seção 9): se o brief pedir algum, **pare e avise**.

---

## Passo 2 — Decompor em módulo e submódulos

O brief vira **1 módulo** (domínio coeso) com **N submódulos**, onde cada submódulo =
**1 spec implementável**. Otimize por tamanho, complexidade e independência.

**Heurística de quebra** (divida se qualquer uma for verdadeira):
- Mais de ~4 entidades de domínio distintas.
- Mais de ~6 telas/fluxos.
- Mais de uma máquina de estados independente.
- Partes paralelizáveis com donos/dependências diferentes.
- Uma spec estimada em > ~2 dias.

**Numeração** (config seção 4): varra `specs/**` e ache o maior bloco de centena usado; o novo
projeto começa no próximo bloco livre; cada submódulo recebe o incremento da config (ex.: `+10`).
`PLAN-` e `TASKS-` espelham o número da `SPEC-`.

**Ordenação por dependência** (a ordem de execução do Passo 5): contratos antes de telas;
entidades-base antes das que as referenciam. Registre num grafo simples no `PLAN` de cada spec.

Ao fim, produza o **manifesto de execução** `specs/_gerador/LEDGER-<slug-projeto>.md`
(modelo: `LEDGER.example.md`) listando as specs na ordem correta e o estado de cada uma
(`pendente`/`feita`). É o arquivo de retomada.

---

## Passo 3 — Gerar os artefatos de spec

Para cada submódulo, a partir de `specs/_templates/`:

1. `specs/features/<PREFIXO>NNN-<slug>.md` ← `template-spec.md`
   - Frontmatter completo, `status: rascunho`, **`cas:` com a contagem de CAs**.
   - Objetivos, não-objetivos, RF/RNF, modelo de dados, **CAs numerados** (cada CA vira teste),
     riscos, segurança, acessibilidade.
   - Marque **gates de controle humano** e **dados sensíveis** (config seções 8 e 10).
   - Seção "Decisões assumidas" para defaults adotados.
2. `specs/plans/<PREFIXO>NNN-<slug>.md` ← `template-plano.md` (fases, ordem, estratégia de testes).
3. `specs/tasks/<PREFIXO>NNN-<slug>.md` ← `template-tarefas.md`
   - Uma tarefa por **camada de implementação** da config (seção 5), atribuída ao agente de lá.
   - Inclua sempre testes (unit + e2e se houver UI) e a tarefa de `@agente-spec-guardian`.
4. Decisão transversal nova (relaxar regra, nova lib, novo padrão)? Crie um **ADR**
   (`specs/decisions/ADR-...md` ← `template-adr.md`) **antes** de implementar.

---

## Passo 4 — Garantir comandos e agentes

- Os comandos e os `@agente-*` já existem em `.claude/`. **Não os recrie.**
- Crie um agente novo **só** se o brief exigir uma especialidade inexistente; siga o formato
  dos atuais (frontmatter `name`/`description` + "Quando é usado" + "Regras" + "Regras globais",
  sempre delegando o específico ao `sdd.config.md`).

---

## Passo 5 — Implementar (automático, em ordem)

Para **cada spec, na ordem do LEDGER**, execute as **camadas de implementação da config**,
uma a uma, cada uma pelo agente declarado, **até o verde antes da próxima spec**.
Equivale a `/implementar-spec`.

**Escolha o conjunto de camadas conforme o que a spec toca e o estágio (config seção 1):**
- **Frontend** (seção 5) — telas, estado, navegação.
- **Backend** (seção 5-B) — quando a spec toca servidor/persistência e o estágio inclui backend:
  contrato de API → migrations → repositórios → serviços → handlers/RBAC → integração → conformidade.
- **Infra/entrega** (seção 5-C) — quando há mudança de arquitetura (roda o `@agente-arquiteto-guardian`)
  ou de infraestrutura/CI (roda o `@agente-devops`).

Uma spec full-stack combina 5-B (backend, geralmente primeiro: contrato → servidor) e 5
(frontend consumindo a API). Um projeto mock-first usa só a seção 5. Rode as camadas de backend
antes das de UI quando a UI depender da API real; em mock-first, a UI consome mock.

Em cada camada, o agente aplica:
- as **regras inegociáveis** (config seção 6);
- os **gates de controle humano** na store/serviço, não só na UI (config seção 8);
- os **paths** corretos (config seções 3 e 3-B) — incluindo a entrada de **menu/navegação** se o
  projeto tiver uma (rota sem entrada de menu é bug de entrega);
- **invariantes** que provam a ausência do caminho proibido, não só a presença do correto.

---

## Passo 6 — Validar e dar feedback

Após cada spec:

1. Rode o **comando de testes** e o **comando e2e** da config (seção 2). Tudo verde é obrigatório.
2. Rode `scripts/sdd-lint.mjs` (frontmatter íntegro: CAs numerados, status coerente; seções
   críticas da config preenchidas; portões de engenharia ativos reportados). Para cada **portão
   ativo** (config seção 11), rode o comando declarado e reporte — bloqueie se marcado como tal.
3. Se vermelho: **pare nessa spec**, investigue, corrija. Não esconda com flags.
4. Emita um **feedback por spec**: nº de testes, arquivos criados, CAs cobertos, greps de
   ausência (= 0), e o que vem a seguir.
5. Ao fechar a spec: `status: implementada`, tarefas `[x]`, atualize o `LEDGER-<slug>.md`.

---

## Passo 7 — Fechamento

- Atualize o `CLAUDE.md`: contagem de testes, tabela de status do módulo, padrões usados.
- Resumo final: specs entregues, total de testes, pendências humanas (se houver).

---

## Checklist de informação do brief

### Obrigatórios (ausência → parada no Passo 1)
1. **Nome e objetivo** (1 frase).
2. **Problema/motivação.**
3. **Papéis/usuários.**
4. **Entidades de domínio** + campos principais.
5. **Telas/fluxos** desejados.
6. **Regras de negócio críticas** (validações, máquinas de estado, unicidade).
7. **Gates de controle humano** (onde algo sugere e um humano confirma), se aplicável.
8. **Critérios de aceitação** desejados ou exemplos do comportamento esperado.

### Opcionais (assumem default da config seção 10)
9. Multi-tenant/escopo. 10. Dados sensíveis/LGPD. 11. Não-objetivos.
12. Prioridade/ordem entre submódulos. 13. Restrições técnicas extras.

---

## Regras invioláveis do que for gerado (resumo)

Estas valem sempre; o **detalhe concreto** (qual lib, quais paths, quais greps) está na config:

1. Stack e biblioteca de UI conforme `sdd.config.md` (seções 2 e 6) — nunca introduza outra.
2. Regras inegociáveis da config seção 6 (ex.: mock-first, contrato como fonte da verdade).
3. Gates de controle humano na store (config seção 8): readonly + setter único + invariante.
4. Toda tela navegável no menu, se o projeto tiver navegação (config seção 3).
5. 1 teste por CA + 1 invariante por regra crítica (provar ausência).
6. `@agente-spec-guardian` aprova antes de marcar qualquer spec como `implementada`.
7. Tópicos bloqueados da config seção 9: **pare e avise**.

---

## Execução sem autorização

O pipeline roda sem prompts graças ao allowlist em `.claude/settings.json`. Comandos
destrutivos (`rm`, `git push`) ficam fora do allowlist de propósito.

## Retomada

Se interrompido, releia `LEDGER-<slug>.md`: continue da primeira spec `pendente`. Specs
`feita` não são refeitas.
