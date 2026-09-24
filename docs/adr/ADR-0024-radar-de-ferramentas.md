---
adr-id: ADR-0024
titulo: Radar de ferramentas por projeto — pesquisa na sessão principal, checagem determinística do que já existe, só sugestão
status: aceito
data: 2026-09-24
---

# ADR-0024: `/radar-ferramentas` e `sdd radar`

## Contexto
Ao fim do `/gerar-projeto`, o projeto tem discovery, stack, ADRs e backlog, mas o kit não ajudava a
responder "que ferramenta externa melhoraria ESTE projeto?". O pack `ai` já compara frameworks e
modelos com evidência atual (ADR-0016), mas só para IA e só no discovery. Faltavam três coisas:
uma varredura genérica guiada pelos drivers do projeto; uma forma de não sugerir de novo o que já
está em uso, decidido ou planejado; e um registro datado que o próximo radar pudesse ler.

Restrições vigentes: nenhum agente tem ferramenta de web (ADR-0009); MCP só por allowlist, sem
enviar código nas consultas (ADR-0010); nada de dependência no core; instalação de pacote pede
confirmação (ADR-0005).

## Decisão
- **Skill core `radar-ferramentas`** (`disable-model-invocation: true`), oferecida no Passo 7 do
  `GERADOR.md` e disponível a qualquer momento. Ela deriva lacunas dos drivers do discovery (sem
  lista fixa de categorias), confirma as lacunas com o usuário, pesquisa **na sessão principal**
  (WebSearch/WebFetch; Context7 para documentação), compara cada candidato com a **opção mínima**
  pelo método `references/AVALIACAO-DE-FERRAMENTAS.md` (versão genérica do método do pack `ai`) e
  grava `specs/discovery/RADAR-<AAAA-MM-DD>.md` pelo `template-radar.md`.
- **CLI determinística `sdd radar`** (só leitura, sem rede):
  - `inventory` — config (stack, packs, `ai:`), dependências por manifesto (fora `.claude/`), ADRs
    com status, docs de discovery, backlog e radares anteriores;
  - `check <nome...>` — onde cada candidato aparece, com trecho, e um status por precedência:
    `em-uso` (manifesto ou `stack`) > `em-adr` > `no-backlog` > `avaliado` (radar anterior) >
    `mencionado` (outro doc de discovery) > `novo`. A correspondência ignora caixa e separadores
    nos dois sentidos (`llama.cpp` = `llama-cpp`, `nemoguardrails` = `NeMo Guardrails`), exige
    fronteira de palavra e, contra manifestos, aceita o pacote sem o sufixo `.js` (`next.js` = `next`).
- **Só sugestão.** A skill não instala, não edita manifestos, não cria ADR `aceito` nem muda
  config ou backlog sem decisão humana. Adotar → ADR `proposto` + item de backlog ou `/nova-spec`;
  spike, adiar e descartar ficam registrados no radar com o motivo.
- Decisões de IA continuam no pack `ai` (`ai-architecture-evaluator`, `ai-model-strategy`); o radar
  as encaminha, não as duplica.
- O radar mora em `specs/discovery/` (e não em `specs/architecture/`, que o loader trata como
  spec): o lint valida `doc-id`, `titulo` e `status`, e a auditoria brownfield enxerga as tags de
  proveniência.

## Alternativas consideradas
- **Etapa de pipeline com agente próprio** — rejeitada: o radar é por projeto, não por spec, e um
  agente com web violaria a ADR-0009.
- **Tabela de ferramentas recomendadas no kit** — rejeitada pelo mesmo motivo da ADR-0016: envelhece
  em semanas e dispensa evidência.
- **Skill sem CLI, lendo os arquivos** — rejeitada: "já está no roadmap?" ficaria a critério do
  modelo; a checagem por manifesto, ADR e backlog é barata de tornar determinística.
- **Modelo de decisão externo para classificar candidatos** — rejeitado: adiciona fornecedor,
  chave e saída de dados para um ganho de latência irrelevante num fluxo conduzido por humano.

## Consequências
- Sugestões chegam com fonte, data e o que já existe no projeto; o próximo radar parte do anterior.
- A qualidade da pesquisa depende de web disponível na sessão; sem ela, os candidatos ficam
  `NÃO VERIFICADO` e o relatório diz isso.
- `radar check` encontra ocorrências, não decisões: um nome citado como alternativa rejeitada num
  ADR aceito aparece como `em-adr`. A skill manda ler o trecho antes de descartar ou sugerir.
- `manifestDependencies` (`scripts/lib/manifests.mjs`, compartilhada com `ai detect`) passa a ler
  cada formato pelo que ele declara como dependência — seções de dependência do `pyproject`
  (PEP 621, grupos e Poetry), `Pipfile`, `Cargo.toml` e blocos `require` do `go.mod` — em vez de
  qualquer string entre aspas, e deixa de contar manifestos em `.claude/`, que são dos scripts das
  skills do kit, não do produto.

## Reavaliar quando
- Os clientes passarem a permitir web em subagentes com escopo de domínio (revisitar a ADR-0009).
- O radar virar rotina (ex.: mensal): avaliar um evento `RADAR_COMPLETED` para o painel.
