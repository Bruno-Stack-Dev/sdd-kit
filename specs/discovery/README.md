# 🔎 Discovery — documentação técnica de projeto novo

Esta pasta guarda os artefatos de **descoberta** gerados pelo `/sdd-init` quando o projeto é
**novo**. São a base de "o que" e "como" que alimenta o pipeline (`/gerar-projeto`) e as specs.

## O que vive aqui

| Arquivo | Origem (template) | Conteúdo |
|---------|-------------------|----------|
| `VISAO.md` | `template-visao.md` | Problema, personas, MVP, diferencial, métricas |
| `REQUISITOS.md` | `template-requisitos.md` | RF + RNF de produto |
| `FLUXOS.md` | `template-fluxos.md` | Fluxos de negócio (Mermaid/BPMN) e casos de uso |
| `MODELO-DADOS.md` | `template-modelo-dados.md` | Entidades, DER, estados, invariantes |
| `ARQUITETURA.md` | `template-arquitetura.md` | C4 (contexto, contêineres, componentes) |
| `API.md` | `template-api.md` | Contratos de endpoints (se houver API) |
| `RBAC.md` | `template-rbac.md` | Papéis e matriz de permissões |
| `BACKLOG.md` | `template-backlog.md` | Épicos → Features → Stories → Tasks |
| `INFRA.md` | `template-infra.md` | Ambientes, deploy, CI/CD, observabilidade |
| `AUDITORIA-DIVERGENCIAS.md` | `template-auditoria-divergencias.md` | Só em projeto existente: divergências código × usuário, lacunas e dívidas conhecidas |

## Dois modos de geração

- **Projeto novo** (`DISCOVERY.md`): a fonte é a **entrevista** com o usuário.
- **Projeto existente** (`AUDITORIA.md`): a fonte primária é o **código** (engenharia reversa);
  cada fato leva proveniência `[código]`/`[inferido]`/`[usuário]`, e divergências ficam no
  `AUDITORIA-DIVERGENCIAS.md` (o código prevalece).

## Regras

- Gerado e mantido **a partir da entrevista** de `specs/_gerador/DISCOVERY.md`. Não crie à mão;
  peça uma atualização ao `/sdd-init` ou edite após revisão.
- Campos indefinidos ficam como `<TODO>` — resolva-os antes de aprovar (`status: aprovada`).
- Decisões arquiteturais concretas viram **ADRs** em `specs/decisions/`; regras permanentes vão
  para o `sdd.config.md`. Esta pasta descreve; a config governa.
- O `sdd-lint.mjs` valida o frontmatter destes docs (`doc-id`, `titulo`, `status`).
