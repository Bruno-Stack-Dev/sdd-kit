---
doc-id: API
titulo: Especificação de API — <Nome>
versao: 0.1.0
status: rascunho
atualizado-em: AAAA-MM-DD
tags: [discovery, api, contrato]
---

# Especificação de API — <Nome>

> Artefato de **discovery** (Bloco 3), quando o projeto expõe API. É a **fonte da verdade** dos
> contratos — o backend se conforma a ela. Se você mantém um `openapi.yaml`, referencie-o aqui e
> deixe este doc como o resumo humano.

## Convenções
- **Base URL:** `<ex.: /api/v1>`
- **Autenticação:** `<ex.: Bearer JWT>`
- **Formato de erro padrão:** `{ "error": { "code": "...", "message": "..." } }`
- **Paginação:** `<ex.: ?page=&size=>`

## Endpoints
### `<MÉTODO> <caminho>` — <o que faz>
- **Auth:** <papel(is) exigido(s) — ver Modelo de Permissões>
- **Request:**
  ```json
  { "campo": "valor" }
  ```
- **Response 200:**
  ```json
  { "id": "uuid", "campo": "valor" }
  ```
- **Erros:** `400` <quando> · `403` <quando> · `404` <quando> · `409` <quando>

> Repita por endpoint. Agrupe por recurso.

## Modelos (schemas)
```ts
// Espelham o Modelo de Dados; viram os contratos compartilhados (config seção 3/5).
```

## 📅 Histórico
| Data | Versão | Mudança |
|------|--------|---------|
| AAAA-MM-DD | 0.1.0 | Versão inicial (discovery) |
