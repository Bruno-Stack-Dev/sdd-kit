---
name: ai-evals-designer
description: "Projeta a avaliação de uma aplicação de IA: datasets de casos com resposta esperada, métricas determinísticas e com modelo-juiz (com calibração), avaliação de RAG e de agentes, gate de regressão no CI e comparação de modelos — com ferramentas verificadas na documentação atual (ex.: Promptfoo) e sem enviar dados sensíveis a terceiros. Acione quando pedirem: como testar o LLM, evals, qualidade das respostas, regressão ao trocar prompt ou modelo, LLM-as-judge, avaliar RAG ou agente. Não acione para testes unitários de código sem modelo."
license: MIT
metadata:
  sdd-pack: "ai"
  sdd-version: "3.0.0"
---

# ai-evals-designer

Método obrigatório: [AVALIACAO-DE-TECNOLOGIA.md](../_ai-references/AVALIACAO-DE-TECNOLOGIA.md).
Saída: `specs/discovery/AI-EVALS.md` (← `../_ai-templates/AI-EVALS.md`).

## Princípio

Eval é o teste de aceitação da parte probabilística. **Sem eval, nenhuma troca de prompt, modelo ou
framework é aprovada.** As evals derivam dos Critérios de Aceitação das specs.

## 1. Dataset

- Casos reais (anonimizados) + casos de borda + casos adversariais (vêm de `ai-security-reviewer`).
- Cada caso: entrada, contexto (documentos, memória), saída esperada ou critérios verificáveis,
  CA de origem (`<spec>/CA-NN`).
- Versione o dataset no repositório (sem PII real; use dados sintéticos ou anonimizados).
- Tamanho proporcional ao risco; comece pequeno e cresça a cada bug encontrado (todo incidente
  vira caso).

## 2. Métricas — da mais barata à mais cara

1. **Determinísticas**: schema válido, campo igual, contém/não contém, regex, citação presente,
   latência, custo, número de passos do agente. Rodam em todo PR.
2. **Semânticas sem modelo**: similaridade, overlap de trechos recuperados (RAG).
3. **Modelo-juiz** (LLM-as-judge): só com rubrica escrita, **calibrado contra rótulos humanos**
   numa amostra, e com modelo juiz diferente ou fixado em versão. Registre a concordância obtida.
4. **Revisão humana** por amostragem para o que continuar ambíguo.

## 3. Casos específicos

- **RAG**: recuperação (recall@k do trecho esperado) separada da geração (fidelidade aos trechos,
  recusa quando não há resposta).
- **Agentes**: sucesso da tarefa, ferramentas chamadas (esperadas e proibidas), passos, custo,
  respeito aos gates (tentou ação com efeito colateral sem aprovação = falha grave).
- **Saída estruturada**: taxa de validade do schema e de reparo.

## 4. Ferramenta e execução

- Candidatos a verificar: Promptfoo (o próprio kit usa para suas evals), frameworks de avaliação
  de RAG e de agentes, plataformas de observabilidade com evals. Compare com a opção mínima
  (script de testes do próprio projeto chamando o modelo).
- **Dados**: não envie dataset com dado sensível a serviço externo de avaliação sem autorização;
  prefira execução local.
- **CI**: determinísticas em todo PR; suíte com modelo em workflow manual/noturno com segredo
  próprio e orçamento; resultado comparado ao **baseline** versionado; regressão acima da
  tolerância bloqueia a promoção.

## Qualidade

- Todo CA com comportamento de modelo tem caso de eval; todo incidente vira caso.
- Modelo-juiz calibrado e fixado; métricas determinísticas no PR; baseline e tolerância definidos.
- Nenhum dado sensível enviado a terceiros para avaliar.
