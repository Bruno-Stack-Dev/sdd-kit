---
titulo: GERADOR — Pipeline automático de brief → specs → código
versao: 3.0.0
atualizado-em: 2026-09-23
tipo: orquestrador
tags: [gerador, pipeline, sdd, automacao, portavel]
---

# GERADOR — Pipeline automático de specs (motor genérico)

> **Motor do SDD Kit** — referência da skill `gerar-projeto` (`/gerar-projeto`). Execute este
> playbook do início ao fim, **sem pedir confirmação intermediária**, exceto no único ponto de parada
> do **Passo 1**.
>
> **Princípio:** este arquivo é genérico. Tudo que é específico do projeto (stack, paths, comandos,
> regras, padrões proibidos, gates, pipelines) vive em **`sdd.config.yaml`** (visão legível:
> `sdd.config.md`, com as mesmas seções numeradas citadas aqui). Nunca escreva um fato de projeto aqui.
>
> **`sdd`** = a CLI determinística do motor. O comando exato está no SKILL.md que carregou esta
> referência e no contexto da sessão ("CLI determinística: ..."); no modo cópia é `node scripts/sdd.mjs`.

## O que este pipeline faz

Transforma **um brief markdown** (em `specs/_entrada/`) num conjunto completo de
**specs + planos + tarefas** e então **implementa o código** seguindo as *camadas de
implementação* declaradas nas pipelines do `sdd.config.yaml` (visão: seção 5), com testes, validação pelo
`@agente-spec-guardian` e feedback de execução — **sem o usuário criar arquivos à mão**.

---

## Passo 0 — Pré-condições (sempre)

1. **Valide a config**: rode `sdd config validate`. A fonte canônica é
   `sdd.config.yaml` (a visão legível `sdd.config.md` é gerada dela; num projeto v2 ainda sem YAML,
   o `.md` legado é lido com aviso — sugira `config migrate`). Se não houver config, **pare e diga:
   "rode `/sdd-init` primeiro"**. Se o comando sair com erro, **pare e mostre os erros**: config
   inválida (schema, placeholders em `forbidden_patterns`/`human_gates`/`blocked_topics`, agente
   inexistente) não pode sustentar geração de código.
   - Rode `sdd doctor --fast` (config, specs, grafo de tarefas, estado, agentes). Se
     sair `NOT_READY`, **pare e mostre as falhas** antes de gerar qualquer coisa.
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

**Numeração** (config `numbering`): **não calcule à mão**. O primeiro submódulo de um projeto/módulo
novo recebe `sdd spec next-id --new-block`; cada submódulo seguinte,
`sdd spec next-id` (maior número usado + incremento). `PLAN-` e `TASKS-` espelham o
número da `SPEC-`.

**Ordenação por dependência** (a ordem de execução do Passo 5): contratos antes de telas;
entidades-base antes das que as referenciam. Registre num grafo simples no `PLAN` de cada spec.

Ao fim do Passo 3, **registre no estado**: `sdd tasks sync` (cria os eventos de
spec/plano/tarefa, idempotente, e valida o grafo — ciclo, dependência órfã e agente inexistente
**param** aqui) e `sdd state ledger` (gera `specs/_gerador/LEDGER-<slug>.md`). O
LEDGER é **derivado** de `.sdd/events.jsonl`: nunca o edite à mão.

---

## Passo 3 — Gerar os artefatos de spec

Para cada submódulo, a partir de `sdd template list`:

1. **Gere os três arquivos pela CLI:** `sdd spec new --slug <slug> --title "<título>" --pipeline <nome>`
   (use `--new-block` no primeiro submódulo de um módulo novo e `--depends` para as dependências).
   A CLI calcula o ID, cria spec, plano e tarefas — **uma tarefa por etapa da pipeline escolhida**,
   com o agente da etapa — e registra os eventos de criação. Nenhuma pipeline é fixa no motor: a
   config pode declarar `frontend`, `api`, `cli`, `data`... (exemplos em `docs/examples/pipelines/`).
2. Preencha a **spec**: objetivos, não-objetivos, RF/RNF, modelo de dados, **CAs numerados** (cada CA
   vira teste; `cas:` igual à contagem), riscos, segurança, acessibilidade, **gates de controle
   humano** e **dados sensíveis** (config seções 8 e 10), "Decisões assumidas".
3. Ajuste o **plano** (pré-requisitos, estratégia de testes) sem reordenar etapas à mão: mudar a
   ordem de verdade é mudar a pipeline na config.
4. Decisão transversal nova (relaxar regra, nova lib, novo padrão)? Crie um **ADR**
   (`specs/decisions/ADR-...md` ← `template-adr.md` (`sdd template show adr`)) **antes** de implementar.

---

## Passo 4 — Garantir comandos e agentes

- Os comandos e os `@agente-*` já existem em `.claude/`. **Não os recrie.**
- Crie um agente novo **só** se o brief exigir uma especialidade inexistente; siga o formato
  dos atuais (frontmatter `name`/`description` + "Quando é usado" + "Regras" + "Regras globais",
  sempre delegando o específico ao `sdd.config.md`).

---

## Passo 5 — Implementar (automático, em ordem)

Para **cada spec, na ordem do LEDGER**, execute as **etapas da pipeline da spec**, uma a uma,
cada uma pelo agente declarado, **até o verde antes da próxima spec**.
Equivale a `/implementar-spec`. Escolha a próxima tarefa com `sdd tasks ready`
(respeita dependências) e registre o ciclo de vida de cada uma:

- antes: `sdd event TASK_STARTED --task <SPEC>/T-NNN --agent <agente>` (recusado se
  houver dependência não concluída);
- travou: `event TASK_BLOCKED --task ... --reason "<motivo>"`;
- verde: `event TASK_COMPLETED --task ...`.

**A pipeline de cada spec vem da config** (escolhida no `spec new --pipeline`), conforme o que a
spec toca e o estágio (config seção 1). As etapas, a ordem e o agente de cada uma estão em
`pipelines.<nome>`; o motor não assume frontend nem backend. Uma entrega que atravessa camadas vira
**specs separadas por pipeline** ligadas por `depende-de` (ex.: a spec da API antes da spec da UI que
a consome; em mock-first, a UI consome mock e não depende da API). Mudanças de arquitetura ou de
infraestrutura usam a pipeline de entrega da config, quando existir (ex.: `delivery`, com
`@agente-arquiteto-guardian` e `@agente-devops`).

Em cada camada, o agente aplica:
- as **regras inegociáveis** (config seção 6);
- os **gates de controle humano** na store/serviço, não só na UI (config seção 8);
- os **paths** corretos (config seções 3 e 3-B) — incluindo a entrada de **menu/navegação** se o
  projeto tiver uma (rota sem entrada de menu é bug de entrega);
- **invariantes** que provam a ausência do caminho proibido, não só a presença do correto;
- **APIs de bibliotecas conferidas na versão em uso** (lockfile/manifesto) — documentação oficial ou
  Context7 (perfil MCP `minimal`); nunca invente API. Sem MCP, a documentação oficial basta.

---

## Passo 6 — Validar e dar feedback

Após cada spec:

1. Rode o **comando de testes** e o **comando e2e** da config (seção 2). Tudo verde é obrigatório.
   Registre o resultado: `event TEST_PASSED` ou `event TEST_FAILED` com `--spec <SPEC> --command "<cmd>"`.
2. Rode `sdd check forbidden` (padrões proibidos da config: cada contagem tem de
   ficar no esperado — é a evidência que o guardião cita) e `sdd doctor --fast` (frontmatter íntegro: CAs numerados, status coerente; seções
   críticas da config preenchidas; portões de engenharia ativos reportados). Para cada **portão
   ativo** (config seção 11), rode o comando declarado e reporte — bloqueie se marcado como tal.
3. Se vermelho: **pare nessa spec**, investigue, corrija. Não esconda com flags.
4. Emita um **feedback por spec**: nº de testes, arquivos criados, CAs cobertos, greps de
   ausência (= 0), e o que vem a seguir.
5. **Guardião:** `event GUARDIAN_STARTED --spec <SPEC>`; o `@agente-spec-guardian` devolve o
   relatório; então `event GUARDIAN_APPROVED --spec <SPEC> --evidence <relatório>` ou
   `event GUARDIAN_REJECTED --spec <SPEC> --reason "<o que falta>"` (volta ao Passo 5).
6. Ao fechar a spec: `event SPEC_IMPLEMENTED --spec <SPEC>` — **recusado** sem aprovação do
   guardião, com tarefa aberta, teste falhando ou gate bloqueado. Só então `status: implementada` no
   frontmatter, `sdd tasks sync` (checkboxes a partir do estado) e `sdd state ledger`.

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

O pipeline roda com poucos prompts graças ao allowlist em `.claude/settings.json`. As regras críticas
**não** dependem deste texto: os hooks do SDD (`scripts/hooks/sdd-hook.mjs`, política em
`policies/sdd-policy.json`) negam segredos, git destrutivo, escrita direta no estado e em arquivos
gerados, e pedem confirmação para instalar dependências novas e acessar a rede. Se um comando for
negado, leia o motivo (`[regra]`) e siga o caminho indicado — não tente contornar. Detalhes:
`docs/security/policy.md`.

## Retomada

Se interrompido, rode `sdd state resume`: mostra sessões sem fechamento, specs
ativas, tarefas em andamento/bloqueadas (com motivo) e as próximas prontas — reconstruído
deterministicamente de `.sdd/events.jsonl`, sem depender de reler prosa. Specs `implemented` não são
refeitas. Projeto v2 com `LEDGER` escrito à mão: `sdd state import-ledger <arquivo>` uma vez.
