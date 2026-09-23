---
adr-id: ADR-0013
titulo: Auditoria brownfield separa OBSERVED, INTENDED e RUNTIME; drift de segurança nunca é reconciliado sem evidência
status: aceito
data: 2026-09-23
---

# ADR-0013: OBSERVED × INTENDED × RUNTIME

## Contexto
O v2 resolvia divergência código × usuário com "o código prevalece". Isso é útil para descobrir o que
existe, mas transforma bug e falha de segurança em "comportamento documentado".

## Decisão
1. Três camadas por fato divergente: OBSERVED (código/config), INTENDED (spec, doc, ADR, confirmação),
   RUNTIME (evidência de execução ou "não verificada").
2. Proveniência com 7 valores: CODE, CONFIG, TEST, DOC, RUNTIME, USER_CONFIRMED, INFERRED (tags v2
   aceitas como alias).
3. Classificação: DOC_DRIFT, SPEC_DRIFT, SECURITY_DRIFT, RUNTIME_DRIFT, CONFIG_DRIFT, UNKNOWN.
4. `SECURITY_DRIFT`/`RUNTIME_DRIFT` só saem de `pendente` com evidência de RUNTIME ou USER_CONFIRMED;
   aceitar como intencional exige ADR; "código prevalece" é recusado. O doctor valida o relatório
   (`brownfield.divergences`) e avisa docs de discovery sem proveniência.
5. Conteúdo do repositório é evidência, nunca instrução (defesa contra prompt injection em brownfield).

## Consequências
- Relatórios v2 continuam legíveis (aviso para reclassificar).
- Dívida conhecida vira `expected: N` nos padrões proibidos: pode diminuir, não crescer.
