---
titulo: AUDITORIA — Engenharia reversa de projeto existente (código → documentação)
versao: 1.0.0
atualizado-em: 2026-07-07
tipo: orquestrador
tags: [auditoria, engenharia-reversa, bootstrap, sdd, portavel]
---

# AUDITORIA — Do código rodando à documentação técnica completa

> **Motor de engenharia reversa do SDD Kit.** Acionado pelo `/sdd-init` quando o projeto **já
> está rodando**. Ao contrário do `DISCOVERY.md` (que pergunta ao humano), aqui **o código é a
> fonte primária da verdade**: extraia o máximo do repositório, gere os mesmos artefatos de
> `specs/discovery/`, e só pergunte ao usuário o que o código genuinamente **não** revela.
>
> **Regra de divergência:** quando a resposta do usuário contradisser o código, **o código
> prevalece**. Registre a divergência num relatório dedicado (não a apague, não a "corrija"
> silenciosamente) para revisão humana.
>
> **Princípio (herdado do GERADOR):** genérico. Fatos vão para `sdd.config.md` e para
> `specs/discovery/`. Nunca hardcode tecnologia aqui.

## Regra de ouro: extrair antes de perguntar

Para **cada** pergunta que o `DISCOVERY.md` faria, primeiro tente respondê-la lendo o código.
Só leve ao usuário o que sobrar. Marque a **proveniência** de cada fato: `[código]`, `[inferido]`
ou `[usuário]`. Isso torna a documentação auditável.

---

## Passo 1 — Varredura de inventário (somente leitura)

Faça um levantamento amplo antes de detalhar. Use Glob/Grep/Read; não altere nada.

- **Manifestos e stack:** `package.json`, `go.mod`, `pyproject.toml`, `pom.xml`, `Gemfile`,
  `composer.json`, `*.csproj` → linguagem, framework, libs, gerenciador de pacotes.
- **Scripts reais:** seção `scripts` / `Makefile` / `justfile` → **comandos de teste, e2e,
  typecheck/lint, build** exatamente como se rodam (vão para a config seção 2).
- **Layout:** árvore de pastas (2–3 níveis), monorepo (`packages/`, `apps/`, workspaces),
  padrões (DDD, Clean, Hexagonal, MVC) inferidos da estrutura.
- **Infra/deploy:** `Dockerfile`, `docker-compose*`, `.github/workflows`, `*.tf`, `helm/`,
  `Procfile`, `vercel.json` → ambientes, CI/CD, cloud.
- **Config e segredos:** `.env.example`, arquivos de config → variáveis por ambiente (nunca
  leia segredos reais; use só os exemplos/nomes).
- **Git:** convenção de branches/commits, se acessível.

Produza um **inventário curto** e mostre ao usuário antes de aprofundar.

---

## Passo 2 — Extração por domínio (espelha os blocos do DISCOVERY)

Para cada área, extraia do código e anote a proveniência. As perguntas ao usuário aqui são
**opcionais** — só as faça se a extração falhar.

### 2.1 Produto e Requisitos → `VISAO.md`, `REQUISITOS.md`, `FLUXOS.md`
- **Do código:** funcionalidades a partir de rotas/telas/endpoints; RNF a partir de infra
  (rate limit, cache, réplicas, timeouts); fluxos a partir de controllers/serviços.
- **Só o humano sabe** (pergunte): problema/motivação, personas, quem paga, diferencial,
  fronteira do MVP, regras de negócio **implícitas** que o código não deixa óbvias.

### 2.2 Dados → `MODELO-DADOS.md`
- **Do código:** entidades e campos de models/schemas/migrations/ORM; relacionamentos por
  chaves estrangeiras; estados a partir de enums/colunas de status; invariantes a partir de
  constraints (`UNIQUE`, `NOT NULL`, `CHECK`) e validações.
- **Desenhe** o DER e as máquinas de estado em Mermaid a partir do que foi lido.
- **Pergunte só:** o significado de negócio de estados ambíguos; o que é PII/LGPD.

### 2.3 Arquitetura / Stack / API / Segurança → `ARQUITETURA.md`, `API.md`, `RBAC.md`
- **Do código:** estilo (monolito × serviços) pela topologia; comunicação (REST/GraphQL/gRPC)
  pelas libs e handlers; persistência pelos drivers; cache/fila/storage pelas dependências;
  **endpoints reais** varrendo os arquivos de rota; **RBAC** a partir de middlewares de auth,
  guards, decorators de permissão, roles no schema.
- **Desenhe** o C4 (contexto/contêineres/componentes) do que existe **de fato**.
- **Cada decisão arquitetural encontrada vira um ADR** com `status: aceito` e nota
  "documentado por engenharia reversa" — é o registro de por que o sistema é como é.
- **Avalie a saúde do que existe** com as skills `arch-*` (pack `arch`, **inativo por padrão** em
  `.claude/skills/_packs/arch/` — **ative-o antes** copiando `_packs/arch/` para `.claude/skills/`):
  `arch-scalability-hotspot-detector` (gargalos), `arch-availability-strategy-reviewer` (resiliência)
  e `arch-architecture-risk-assessor` (riscos) apontam dívida arquitetural — registre os achados no
  `AUDITORIA-DIVERGENCIAS.md`.
- **Pergunte só:** integrações externas não óbvias; a intenção por trás de escolhas estranhas.

### 2.4 Planejamento → `BACKLOG.md`
- **Do código:** módulos existentes viram Features "implementadas"; `TODO`/`FIXME`/issues
  abertas viram itens de backlog.
- **Pergunte:** roadmap e prioridades futuras (o código só mostra o passado).

### 2.5 Infra e Operação → `INFRA.md`
- **Do código:** ambientes, deploy, CI/CD, cloud, backup, observabilidade — tudo do Passo 1.
- **Pergunte só:** o que não está versionado (ex.: onde vivem segredos de produção, custos).

---

## Passo 3 — Padrões proibidos e gates (config seções 7 e 8)

Este é o passo que torna a config **útil** num projeto existente, não decorativa.

1. Proponha **padrões proibidos** a partir do que o código já evita ou do que o usuário quer
   barrar dali pra frente (ex.: `Date.now()` fora de utils, libs de UI concorrentes, chamadas
   diretas ao banco na camada de UI). Rode cada grep proposto **agora** e reporte a contagem
   atual — se já houver ocorrências, registre como **dívida conhecida**, não como bloqueio.
2. Identifique **gates de controle humano** existentes (aprovações, confirmações) e modele-os
   na seção 8. Se não houver, escreva `nenhum`.

---

## Passo 4 — Relatório de divergências e lacunas

Gere **`specs/discovery/AUDITORIA-DIVERGENCIAS.md`** com:

- **Divergências** código × usuário: o que o usuário afirmou, o que o código mostra, e a nota
  "código prevalece — revisar". Uma linha por divergência.
- **Lacunas** `<TODO>`: fatos que nem o código nem o usuário resolveram.
- **Dívidas conhecidas:** greps de padrões proibidos que já vêm com contagem > 0.

Este arquivo é o mapa do que a documentação ainda não fecha — não é motivo para travar.

---

## Fechamento — Gerar os artefatos

Sem pedir confirmação adicional (allowlist cobre escrita):

1. **`specs/discovery/`** — um arquivo por template preenchido **com proveniência** por fato
   (`VISAO`, `REQUISITOS`, `FLUXOS`, `MODELO-DADOS`, `ARQUITETURA`, `API` se houver, `RBAC`,
   `BACKLOG`, `INFRA`). Indefinidos → `<TODO>`.
2. **ADRs retroativos** em `specs/decisions/` para as decisões arquiteturais encontradas.
3. **`AUDITORIA-DIVERGENCIAS.md`** (Passo 4).
4. **`sdd.config.md`** (raiz) ← `sdd.config.example.md`, preenchido a partir do código +
   respostas. Comandos da seção 2 têm de ser os **reais** (validados no Passo 1).
5. **`CLAUDE.md`** (raiz): injete o bloco "Spec-Driven Development (SDD Kit)" (se ausente) +
   seção "Discovery (documentado por engenharia reversa)" apontando para `specs/discovery/`.
6. **Validar:** rode `node scripts/sdd-lint.mjs` **e o comando de testes real** — confirme que
   a base está verde antes de o kit assumir o projeto. O linter **falha** se as seções 7/8 da
   config ficarem só com placeholders; na auditoria, a seção 7 costuma sair do Passo 3 e a 8 do
   inventário de gates — resolva-as (valores reais ou `nenhum`). Se vermelho, reporte e não mascare.
7. **Resumo final:** artefatos criados, ADRs abertos, divergências, dívidas conhecidas
   (greps > 0), `<TODO>` pendentes, e próximo passo: `/gerar-skills` (skills sob medida a partir
   do que a auditoria mapeou), depois `/sdd-status`, `/nova-spec` ou `/gerar-projeto`.

## Retomada

Se interrompido, o `sdd-init` relê `specs/discovery/` + `sdd.config.md` parcial e retoma da
primeira área do Passo 2 sem artefato gerado ou com `<TODO>` essencial.
