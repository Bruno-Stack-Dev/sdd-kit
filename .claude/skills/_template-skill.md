---
name: <slug-da-skill>
description: <3ª pessoa, com GATILHOS claros — quando um agente deve carregar esta skill. Ex.: "Perícia de cadastro de produtos: entidades, variações, estoque e regras de publicação. Use ao trabalhar em qualquer spec que toque produtos, catálogo ou estoque.">
license: <licença do projeto>
metadata:
  gerada-de: "specs/discovery/MODELO-DADOS.md, specs/discovery/ARQUITETURA.md"
  atualizado-em: "AAAA-MM-DD"
  gerada-por: agente-gerador-skills
---

<!-- Frontmatter só com campos da spec Agent Skills (name, description, license, compatibility,
     metadata, allowed-tools). Rastreabilidade vai em `metadata` (valores texto). Detalhes longos vão
     para references/ (progressive disclosure). Valide com `sdd doctor --skills`. -->

# Skill — <Nome legível>

> Skill **sob medida deste projeto**, gerada pelo `@agente-gerador-skills` a partir do discovery.
> Concentra a perícia de um recorte do sistema para que qualquer agente carregue o contexto de
> uma vez. Não é tutorial genérico: fala das entidades, regras e armadilhas **deste** projeto.

## Escopo e gatilhos
- **Cobre:** <o recorte — entidades/fluxos/integração/tecnologia>.
- **Carregue quando:** <situações concretas — ex.: "spec toca Produto/Variação/Estoque">.
- **Não cobre:** <fronteiras — o que pertence a outra skill>.

## Entidades e contratos
> Referencie os tipos (não copie). Aponte para os paths reais da config seção 3.
| Entidade | Onde (contrato/path) | Papel no recorte |
|----------|----------------------|------------------|
| <ex.: Produto> | <path do tipo> | <raiz do agregado> |

## Regras e invariantes deste recorte
- <ex.: SKU único por unidade; publicar exige preço e ≥1 variação>
- <invariante — e, quando houver, o grep de ausência que o prova (config seção 7)>

## Gates de controle humano aplicáveis (config seção 8)
- <ex.: alteração de preço acima de X% exige confirmação humana> — ou `nenhum`.

## Armadilhas conhecidas → padrão do projeto
| Armadilha | Por que morde | Padrão correto aqui |
|-----------|---------------|---------------------|
| <ex.: estoque negativo em concorrência> | <race condition> | <transação + verificação atômica> |

## (Se skill de banco/infra) Convenções da tecnologia concreta
> Só quando a skill é de um banco/fila/serviço específico já decidido na INFRA/config.
- **Tecnologia:** <ex.: PostgreSQL 16>
- **Migrations:** <convenção do projeto>
- **Índices/consultas críticas:** <padrões esperados>
- **Transações/consistência:** <regras>
- **Conexão/pool/segredos:** <de onde vêm; nunca do repo>

## Referências
- Discovery: <arquivos de origem>
- ADRs relacionados: <ADR-NNN>
