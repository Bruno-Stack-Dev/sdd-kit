---
name: ai-rag-memory-designer
description: "Projeta recuperação de conhecimento (RAG vetorial, híbrido ou por grafo) e memória de agentes (sessão e longo prazo) de uma aplicação de IA: ingestão, chunking, embeddings, índice, busca, reranking, permissões por documento, retenção e esquecimento — com critérios, documentação atual verificada e ADR. Acione quando pedirem: RAG, busca semântica, banco vetorial, embeddings, base de conhecimento para o modelo, memória do agente, lembrar o usuário entre sessões. Não acione para busca textual comum sem modelo."
license: MIT
metadata:
  sdd-pack: "ai"
  sdd-version: "3.0.0"
---

# ai-rag-memory-designer

Método obrigatório: [AVALIACAO-DE-TECNOLOGIA.md](../_ai-references/AVALIACAO-DE-TECNOLOGIA.md).
Saídas: `specs/discovery/AI-RAG.md` e/ou `AI-MEMORY.md` (templates em `../_ai-templates/`) + ADR.

## RAG

### 1. Precisa de RAG?

- O conhecimento cabe no contexto do modelo (com cache de prompt)? Então comece sem RAG.
- A pergunta é estruturada (filtros, números, datas)? Consulta ao banco/ferramenta pode ser melhor
  que busca semântica.
- RAG se justifica com corpus grande, mutável ou com permissões por documento.

### 2. Desenho

Registre cada decisão com o motivo:

- **Fontes e ingestão**: formatos, frequência de atualização, deduplicação, remoção (o documento
  apagado some do índice?), extração de tabelas/PDF.
- **Permissões**: filtragem por usuário/tenant **na busca**, nunca só no prompt. Documento que o
  usuário não pode ler não pode entrar no contexto.
- **Chunking**: por estrutura do documento (seções) antes de tamanho fixo; metadados por chunk
  (fonte, data, permissão, versão).
- **Embeddings**: modelo, dimensão, idioma; re-embedding ao trocar de modelo (custo e plano).
- **Busca**: vetorial, híbrida (vetorial + lexical) ou por grafo (entidades e relações); top-k,
  reranking; citação das fontes na resposta.
- **Índice/armazenamento**: exemplos de candidatos a verificar — extensão vetorial do banco já
  usado (ex.: pgvector), bancos vetoriais dedicados (ex.: Qdrant, Weaviate, Milvus, LanceDB),
  plataformas de RAG (ex.: RAGFlow), grafos de conhecimento. A opção "usar o banco que o projeto já
  opera" entra sempre na comparação.

### 3. Avaliação de RAG

Separe as métricas: **recuperação** (o trecho certo veio? recall@k, MRR) e **geração** (a resposta
é fiel aos trechos? cita a fonte? admite "não sei"?). Conjunto de perguntas com fonte esperada
entra no `AI-EVALS.md`.

## Memória

### 1. Tipos

| Tipo | Dura | Exemplo |
|------|------|---------|
| Contexto da conversa | a requisição/sessão | histórico recente, resumo |
| Estado do agente | a execução | plano, passos concluídos, checkpoints |
| Longo prazo | entre sessões | preferências, fatos sobre o usuário, episódios |

Comece pelo menor tipo que atende. Memória de longo prazo é **dado pessoal** na maioria dos casos.

### 2. Desenho

- O que é gravado, por quem (o modelo decide? regra determinística?), com qual validação.
- Leitura: como a memória entra no contexto (recuperação por relevância, perfil fixo).
- **Correção e esquecimento**: o usuário vê e apaga o que foi lembrado? Retenção máxima? (LGPD —
  ligar a `AI-DATA-GOVERNANCE.md`.)
- Envenenamento: conteúdo não confiável (documento externo, outro usuário) nunca vira memória sem
  validação — é vetor de prompt injection persistente.
- Candidatos a verificar: o próprio banco da aplicação; camadas de memória para agentes (ex.: Mem0,
  Letta, Cognee, Graphiti/grafos temporais); recursos de memória do framework de agentes escolhido.

## Qualidade

- Permissão aplicada na recuperação; remoção de documento propaga para o índice.
- Recuperação e geração avaliadas separadamente, com casos no `AI-EVALS.md`.
- Memória com dono, retenção, correção e esquecimento definidos; conteúdo não confiável não é
  memorizado sem validação.
