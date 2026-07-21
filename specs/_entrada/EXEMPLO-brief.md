# Brief — Biblioteca Escolar (EXEMPLO)

> Modelo preenchido. Copie a estrutura para o seu projeto. O pipeline ignora arquivos
> `EXEMPLO-*`, então este nunca é processado por engano.

## 1. Nome e objetivo
Biblioteca Escolar — gerenciar acervo e empréstimos de livros de uma escola.

## 2. Problema/motivação
Hoje o controle é em planilha; livros somem e não há histórico de quem pegou o quê.

## 3. Papéis/usuários
- **Bibliotecário:** cadastra livros, registra empréstimos e devoluções.
- **Professor/aluno:** consulta o acervo e o próprio histórico (somente leitura).

## 4. Entidades de domínio
- **Livro:** título, autor, ISBN, exemplares, status (`disponível`/`emprestado`).
- **Empréstimo:** livro, pessoa, data de retirada, data prevista, data de devolução, status
  (`ativo` → `devolvido` / `atrasado`).
- **Pessoa:** nome, papel, identificador.

## 5. Telas/fluxos
- Lista do acervo (busca por título/autor).
- Cadastro/edição de livro.
- Registrar empréstimo; registrar devolução.
- Histórico de empréstimos por pessoa.

## 6. Regras de negócio críticas
- ISBN único no acervo.
- Não emprestar livro sem exemplar disponível.
- Empréstimo `devolvido` é terminal — não pode reabrir.
- `atrasado` é derivado da data prevista vs. data mockada de "hoje" (sem relógio real).

## 7. Gates de controle humano
Nenhum (não há sugestão de IA decidindo sobre pessoas neste módulo).

## 8. Critérios de aceitação (exemplos)
- CA-01: tentar emprestar livro sem exemplar disponível é bloqueado com mensagem clara.
- CA-02: registrar devolução muda o status para `devolvido` e libera um exemplar.
- CA-03: ISBN duplicado é rejeitado no cadastro.
- CA-04: histórico de uma pessoa lista só os empréstimos dela.

## Opcionais
- Multi-tenant: não (uma escola só).
- Não-objetivos: sem multas/financeiro nesta versão; sem backend (mock-first).
