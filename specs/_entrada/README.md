# 📥 Entrada de projetos

Coloque **um único arquivo `.md`** descrevendo o seu projeto nesta pasta. Depois, no chat,
rode **`/gerar-projeto`** (ou peça "ler o gerador"). O resto é automático: o pipeline gera as
specs, planos e tarefas e implementa o código com testes, seguindo o `sdd.config.md` da raiz.

## Como escrever o brief

Responda, no seu `.md`, ao **Checklist de informação** documentado em
[`../_gerador/GERADOR.md`](../_gerador/GERADOR.md) (seção "Checklist de informação do brief").
Veja um modelo preenchido em [`EXEMPLO-brief.md`](EXEMPLO-brief.md).

Quanto mais completo o brief, **menos** o pipeline te interrompe. Se faltar algo obrigatório,
ele para e pergunta **somente** o que falta — depois retoma sozinho.

## Regras

- **Um** brief por vez. Arquivos `README.md` e `EXEMPLO-*` são ignorados pelo pipeline.
- Não crie specs/pastas manualmente — o gerador faz isso.
- O brief é livre: escreva em tópicos ou prosa. O pipeline extrai a estrutura.
