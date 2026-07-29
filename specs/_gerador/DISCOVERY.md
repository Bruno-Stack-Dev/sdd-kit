---
titulo: DISCOVERY — Entrevista guiada de projeto novo (blocos temáticos)
versao: 1.0.0
atualizado-em: 2026-07-07
tipo: orquestrador
tags: [discovery, entrevista, bootstrap, sdd, portavel]
---

# DISCOVERY — Do zero à documentação técnica completa

> **Motor de discovery do SDD Kit.** Acionado pelo `/sdd-init` quando o projeto é **novo**
> (sem código de aplicação). Conduz uma entrevista **em blocos temáticos** e, ao final, gera
> o `sdd.config.md`, o `CLAUDE.md` e **toda a documentação de discovery** em `specs/discovery/`,
> além de semear `specs/_entrada/` com um brief pronto para o `/gerar-projeto`.
>
> **Princípio (herdado do GERADOR):** este arquivo é genérico. Fatos do projeto vivem no
> `sdd.config.md` e nos artefatos de `specs/discovery/`. Nunca hardcode tecnologia aqui.

## Como conduzir a entrevista

- Faça **um bloco por mensagem**, na ordem abaixo. Numere as perguntas do bloco.
- **Pré-preencha** o que der para inferir do repositório (nome da pasta, README existente,
  arquivos de manifesto) e apresente como sugestão a confirmar — não pergunte o óbvio.
- Aceite respostas curtas. Se uma resposta abrir uma decisão arquitetural relevante
  (ex.: microserviços, GraphQL), registre-a para virar **ADR** no fechamento.
- **Não trave o usuário:** se ele não souber um item opcional, ofereça um default sensato,
  marque com `<TODO>` no artefato e siga. Itens **essenciais** ausentes → pergunte de novo,
  só aqueles, antes de fechar o bloco.
- Ao terminar cada bloco, **resuma em 2–3 linhas** o que entendeu e siga para o próximo.

---

## Bloco 1 — Produto e Requisitos
> Alimenta: `template-visao.md`, `template-requisitos.md`, `template-fluxos.md`.

1. **Nome e objetivo** em uma frase.
2. **Problema/motivação:** que dor resolve, para quem, com qual evidência.
3. **Quem usa × quem paga** (personas).
4. **Diferencial** frente a alternativas (planilha, concorrente).
5. **MVP:** o mínimo que entrega valor — e o que fica de fora da v1.
6. **Requisitos funcionais** (liste o que o sistema faz).
7. **Requisitos não funcionais** que importam (performance, segurança, disponibilidade,
   escala, backup, acessibilidade) — com alvo, se houver.
8. **Fluxos de negócio** principais (descreva; eu desenho em Mermaid).
9. **Regras de negócio críticas** (validações, unicidade, estados terminais, gates humanos).
10. **Modelo de negócio/monetização** (opcional).

---

## Bloco 2 — Dados
> Alimenta: `template-modelo-dados.md`.

1. **Entidades de domínio** e campos principais.
2. **Relacionamentos** entre elas (1:1, 1:N, N:N).
3. **Regras de integridade/invariantes** (únicos, obrigatórios, terminais).
4. **Ciclo de vida** das entidades com estado (estados e transições; quais são terminais).
5. **Dados sensíveis / LGPD** (o que é PII, o que precisa de tratamento especial).

---

## Bloco 3 — Arquitetura, Stack, API e Segurança
> Alimenta: `template-arquitetura.md` (C4), `template-api.md`, `template-rbac.md`, e a base do
> `sdd.config.md` (seções 2, 3, 5). Decisões relevantes → ADRs.
>
> **Para decisões arquiteturais não triviais, use as skills `arch-*` em cadeia**, em vez de
> improvisar. Elas vêm no pack `arch`, **inativo por padrão** em `.claude/skills/_packs/arch/`.
> **Antes de usá-las, ative o pack**: copie `_packs/arch/` para `.claude/skills/` (a cópia leva
> junto `_arch-templates/`, então as referências das skills continuam válidas; o allowlist do
> `/sdd-init` cobre a cópia). Ativado, siga a cadeia: `arch-architecture-option-generator`
> (gera opções) → `arch-quality-attribute-scenario-writer` (transforma "quero performance" em
> cenários concretos) → `arch-tradeoff-analysis-writer` (compara) → `arch-adr-writer` (registra em
> `specs/decisions/`). Para o corte monolito×serviços: `arch-monolith-vs-modular-monolith-reviewer`
> e `arch-service-decomposition-advisor`. Elas produzem o raciocínio; o resultado alimenta o
> `ARQUITETURA.md` e os ADRs — não são documentos paralelos.

1. **Estilo arquitetural:** monolito · monolito modular · microserviços? Por quê.
2. **Comunicação:** REST · GraphQL · gRPC · eventos/filas?
3. **Persistência:** SQL · NoSQL · híbrido? Qual banco.
4. **Componentes de apoio:** cache, fila, storage, integrações externas.
5. **Stack concreta:** frontend, backend, banco, e gerenciador de pacotes.
6. **Autenticação/autorização:** mecanismo (OAuth2/OIDC, sessão, JWT) e **papéis (RBAC)**.
7. **Contratos de API:** principais recursos e endpoints (se expõe API).
8. **Estrutura de pastas / padrões:** DDD, Clean, Hexagonal, MVC? Monorepo?
9. **Comandos reais** de teste (unit), e2e e typecheck/lint — exatamente como se roda.
10. **Regras inegociáveis e padrões proibidos** deste projeto (viram config seções 6 e 7).

---

## Bloco 4 — Planejamento
> Alimenta: `template-backlog.md` e a numeração de specs (config seção 4).

1. **Épicos** (grandes blocos de valor).
2. Para cada épico, **features** (cada uma tende a virar uma spec).
3. **Prioridade** (MoSCoW) e **dependências** entre features.
4. **Ordem sugerida** de construção (rascunho do LEDGER).
5. **Prefixo e incremento** de numeração de specs (default: `SPEC-<ano>-`, `+10`).

---

## Bloco 5 — Infraestrutura e Operação
> Alimenta: `template-infra.md` e defaults da config (seção 10).

1. **Ambientes:** dev, homologação, produção — onde rodam.
2. **Empacotamento/deploy:** Docker? Orquestração? Estratégia de release.
3. **CI/CD:** pipeline desejado (build → test → deploy).
4. **Cloud e serviços gerenciados** (compute, banco, storage, CDN, cache, fila).
5. **Backup, SSL, segredos e variáveis** por ambiente.
6. **Observabilidade:** logs, métricas, traços, alertas.
7. **Custos/limites** relevantes (opcional).

---

## Fechamento — Gerar os artefatos

Depois do último bloco, **sem pedir confirmação adicional** (o allowlist já cobre escrita):

1. **`specs/discovery/`** — gere um arquivo por template preenchido:
   - `VISAO.md` ← `template-visao.md`
   - `REQUISITOS.md` ← `template-requisitos.md`
   - `FLUXOS.md` ← `template-fluxos.md`
   - `MODELO-DADOS.md` ← `template-modelo-dados.md`
   - `ARQUITETURA.md` ← `template-arquitetura.md`
   - `API.md` ← `template-api.md` (só se houver API)
   - `RBAC.md` ← `template-rbac.md`
   - `BACKLOG.md` ← `template-backlog.md`
   - `INFRA.md` ← `template-infra.md`
   > Todo campo indefinido fica como `<TODO>` — nunca invente fato de produto.
2. **ADRs** — para cada decisão arquitetural relevante do Bloco 3, crie
   `specs/decisions/ADR-NNN-<slug>.md` (← `template-adr.md`), status `aceito`. Use a skill
   `arch-adr-writer` para redigir cada um de forma verificável (regras que o
   `@agente-arquiteto-guardian` possa checar).
3. **`sdd.config.md`** (raiz) ← `sdd.config.example.md`, preenchido com Blocos 3–5:
   stack e comandos (2), paths (3), numeração (4), camadas (5), regras (6), proibidos (7),
   gates (8), tópicos bloqueados (9), defaults (10). Indefinidos → `<TODO>`.
4. **`CLAUDE.md`** (raiz): injete o bloco "Spec-Driven Development (SDD Kit)" do `README.md`
   do kit (se ainda não estiver lá) e uma seção **"Discovery"** apontando para `specs/discovery/`.
5. **`specs/_entrada/<slug>-brief.md`**: gere um brief consolidado a partir dos Blocos 1–2
   (formato do `EXEMPLO-brief.md`), pronto para o `/gerar-projeto`.
6. **Validar:** rode `node scripts/sdd-lint.mjs` e o comando de testes da config (se já houver
   base executável). O linter agora **falha** se as seções 7 (Padrões proibidos) e 8 (Gates) da
   config ficarem só com placeholders — resolva-as (valores reais ou `nenhum`) antes de fechar.
   Reporte verde/vermelho.
7. **Resumo final:** liste os arquivos criados, os ADRs abertos, os `<TODO>` pendentes e o
   próximo passo sugerido: `/gerar-skills` (skills sob medida do domínio agora que o discovery
   está pronto) e depois `/gerar-projeto` ou `/implementar-spec`.

## Retomada

Se a entrevista for interrompida, o `sdd-init` relê `specs/discovery/` e o `sdd.config.md`
parcial: retoma do primeiro bloco cujos artefatos ainda não existem ou têm `<TODO>` essencial.
