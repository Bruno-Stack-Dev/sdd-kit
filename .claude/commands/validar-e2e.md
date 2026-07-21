# /validar-e2e [filtro]

Roda os testes e2e do projeto.

Passos:
1. Use o **comando e2e** declarado em `sdd.config.md` (seção 2). Se for `n/a`, avise que o
   projeto não tem e2e e encerre.
2. Na primeira vez na máquina, instale o runner se necessário (ex.: `npx playwright install chromium`).
3. Rode a suíte (ou só `<filtro>` para um arquivo/teste específico).
4. Reporte total passou/falhou; se falhar, aponte como abrir o relatório/trace.

Cobertura esperada por feature navegável: abrir a tela **pelo menu**, executar o caminho feliz
(criar → listar → detalhe) e validar o resultado visível — o caminho feliz de cada CA navegável.
