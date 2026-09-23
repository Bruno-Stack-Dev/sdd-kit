# Fixtures

Projetos sintéticos, pequenos e versionados, usados pelos testes e pela suíte de evals
determinística (`evals/deterministic/cases.json`). Nenhum contém código proprietário.

| Fixture | Representa |
|---------|------------|
| `greenfield-react-node` | projeto novo (só config, sem código) |
| `brownfield-dotnet` | API .NET existente com dívida conhecida |
| `python-api` | API Python com pipeline de API |
| `go-cli` | CLI Go com pipeline de CLI |
| `monorepo` | web + API em workspaces |
| `broken-project` | defeitos de spec/tarefa/ADR/padrão proibido (segredos entram como overlay em tempo de execução) |
| `ai-rag-project` | API com LLM + RAG (pack `ai`) |
| `legacy-config` | configs v2 para a migração |
