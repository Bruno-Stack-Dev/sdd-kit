---
doc-id: RADAR-AAAA-MM-DD
titulo: Radar de ferramentas — <Nome> (AAAA-MM-DD)
versao: 0.1.0
status: rascunho            # rascunho | aprovada | arquivada
atualizado-em: AAAA-MM-DD
foco: <projeto inteiro | ex.: agentes de IA, observabilidade>
tags: [discovery, radar, ferramentas]
---

# Radar de ferramentas — <Nome>

> Artefato gerado pela skill **`radar-ferramentas`**. São **sugestões, não decisões**: nada aqui é
> instalado. Toda adoção passa por decisão humana e vira ADR em `specs/decisions/`. Fato vindo do
> projeto leva `[CODE]`/`[CONFIG]`/`[DOC]`; evidência externa leva link, versão e data; o que não foi
> verificado fica `NÃO VERIFICADO`.

## 🎯 Escopo e restrições
- **Objetivo do projeto:** <uma frase, de VISAO.md> `[DOC]`
- **Drivers que pesam** (RNF, INFRA, ai:): <ex.: LLM local obrigatório; custo; latência> `[DOC]`
- **Restrições eliminatórias:** <ex.: sem cloud para dados do cliente; licença compatível com SaaS>
- **Stack atual:** <de `sdd radar inventory`> `[CONFIG]`

## ✅ Já coberto — não sugerido
> Saída de `sdd radar check`. Ocorrência não é decisão: o contexto foi lido.

| Ferramenta | Status | Onde | Observação |
|------------|--------|------|------------|
| <ex.: langgraph> | em-uso | `apps/agents/pyproject.toml` | já é a orquestração |

## 🔍 Lacunas
| ID | Lacuna | Driver / fonte | Prioridade |
|----|--------|----------------|------------|
| L-01 | <ex.: observabilidade das chamadas de LLM> | <RNF-03, INFRA.md> | Must |

## 🧪 Candidatos por lacuna

### L-01 — <lacuna>

| Candidato | Versão avaliada | Consulta | Licença | Último release | Link | Status (`radar check`) |
|-----------|-----------------|----------|---------|----------------|------|------------------------|
| Opção mínima: <o que a stack atual / código próprio já resolve> | — | — | — | — | — | — |
| <candidato A> | <x.y.z> | AAAA-MM-DD | <SPDX> | AAAA-MM-DD | <url> | novo |
| <candidato B> | NÃO VERIFICADO | | | | | novo |

| Critério | Peso | Mínima | A | B |
|----------|------|--------|---|---|
| Aderência à lacuna | <1-5> | | | |
| Compatível com stack e restrições | | | | |
| Maturidade e manutenção | | | | |
| Licença | | | | |
| Lock-in / portabilidade | | | | |
| Segurança e supply chain | | | | |
| Dados (onde trafegam, retenção) | | | | |
| Operação e custo | | | | |

- **O que a comparação mostra:** <leitura curta, com a evidência>
- **Riscos:** <…>
- **Spike sugerido?** <não | sim: casos, métrica e critério de corte definidos antes>

## 🧑‍⚖️ Decisões (preenchidas pelo humano)
| Lacuna | Candidato | Decisão | Próximo passo | Quem / quando |
|--------|-----------|---------|---------------|---------------|
| L-01 | <A> | adotar · spike · adiar · descartar | <ADR-NNN proposto · /nova-spec · item no BACKLOG> | |

## 🔁 Reavaliar quando
- <ex.: release major de A; custo por requisição acima de X; em 6 meses>

## 📚 Fontes consultadas
| Fonte | Data | Para quê |
|-------|------|----------|
| <url oficial / Context7 library-id> | AAAA-MM-DD | <versão, licença, API> |
