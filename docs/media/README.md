# Documentação audiovisual do World Explorer

Estas mídias foram produzidas em 10 de outubro de 2026 a partir do commit [`14c9411`](https://github.com/Helio965/Globe-Express/commit/14c94113f88692edf0eca8bf38308fc6dfdeb1b9), com a aplicação de produção e serviços públicos reais. O destino pesquisado foi Brasília. A captura não interceptou requisições, não utilizou fixtures e não modificou componentes, serviços, estilos, animações, hooks ou testes.

## Arquivos e evidências

- [Oito screenshots PNG](screenshots/): sete vistas desktop e uma vista móvel.
- [Demonstração MP4](video/world-explorer-demo.mp4): 98,033 segundos, 1920 × 1080, H.264, yuv420p, 30 FPS e 22.606.541 bytes.
- [Miniatura](video/video-thumbnail.png): frame real da apresentação cinematográfica, com textos editoriais.
- [Legendas pt-BR](video/subtitles-pt-br.srt): oito cenas sincronizadas, também incorporadas ao vídeo.
- [Créditos e licenças](MEDIA_CREDITS.md): autores, fotografias, textos, dados e cartografia.
- [Manifesto das capturas](capture-manifest.json): commit, dimensões, imagens carregadas, fontes e resultados da rede.
- [Manifesto de produção](video/production-manifest.json): edição, timeline, checksums SHA-256 e verificação do MP4.

As imagens 01–05 e 07 têm 1920 × 1080 pixels. A imagem 06 tem 1920 × 1084 para incluir toda a seção de locais próximos e seus créditos. A imagem móvel 08 tem 430 × 932, sem transbordamento horizontal. Todas foram abertas para conferência visual.

O navegador gravou continuamente em 1920 × 960, com as animações originais. A edição acrescentou uma faixa inferior de 120 pixels para as explicações, sem recortar ou redimensionar a interface. O MP4 usa H.264 em dois passes, faixa de cor limitada e `faststart` (`moov` antes de `mdat`). A decodificação completa com FFmpeg passou. O Chromium reproduziu o arquivo e avançou para cinco pontos entre o início e o encerramento, sem erro de mídia.

O vídeo é silencioso: não havia ferramenta de narração pt-BR adequada. Não foi utilizada música, voz sintética ou efeitos sonoros. As explicações em português brasileiro permanecem disponíveis nas legendas incorporadas e no SRT.

## Cenas do vídeo

| Intervalo aproximado | Interação registrada |
| --- | --- |
| 00:00–00:09 | Tela inicial e animação original |
| 00:09–00:21 | Digitação de Brasília, resultados reais e seleção |
| 00:21–00:33 | Zoom e arraste no OpenStreetMap |
| 00:33–00:44 | Abertura da apresentação cinematográfica |
| 00:44–00:57 | Resumo, fatos geográficos e rolagem pelas informações |
| 00:57–01:12 | Troca de fotografia e cartões de locais próximos |
| 01:12–01:28 | Favorito, recentes e recuperação com nova consulta |
| 01:28–01:38 | Retorno ao início e encerramento |

## Ferramentas verificadas

| Ferramenta | Versão utilizada |
| --- | --- |
| Node.js / npm | 24.19.0 / 11.9.0 |
| Next.js / React | 16.4.0 / 19.3.0, preservados pelo lockfile |
| Playwright | 1.64.0, resolvido pelo lockfile existente |
| Chromium | 154.0.8037.57, `/usr/bin/chromium` |
| FFmpeg / ffprobe | 7.1.5, com libx264 e libass |
| Fontes editoriais | Open Sans; DejaVu Sans para o símbolo de reprodução |

## Reproduzir as capturas

Use o checkout existente e as dependências do lockfile. São necessários acesso aos provedores públicos, Chromium, FFmpeg/ffprobe com libx264/libass, Fontconfig e as fontes editoriais. Nenhuma chave Google é exigida para esta demonstração do modo aberto. TLS deve continuar verificado.

```bash
npm ci
npm run build
npm run start -- --port 3001
```

Em outro terminal, indique o servidor e um diretório temporário para a gravação original:

```bash
export WORLD_EXPLORER_URL=http://127.0.0.1:3001
export WORLD_EXPLORER_DESTINATION=Brasília
export WORLD_EXPLORER_RECORDING_DIRECTORY="$(mktemp -d)"
node scripts/capture-documentation.mjs screenshots
```

Abra e confira os oito PNGs antes de gravar. O script aguarda fontes, estados reais, animações, fotografias e tiles; tempos de pausa no vídeo servem somente à leitura depois dessas verificações. Para dados de autoria, consulta também o endpoint real em JSON e confere as imagens renderizadas. A motivação e as consultas adicionais estão registradas no manifesto e nos créditos.

```bash
node scripts/capture-documentation.mjs record
node scripts/render-documentation-video.mjs \
  --recording-directory "$WORLD_EXPLORER_RECORDING_DIRECTORY"
```

Se faltar o executável FFmpeg esperado pelo Playwright, instale os artefatos da versão já resolvida: `npx --no-install playwright install ffmpeg`. Para Chromium ausente, use `npx --no-install playwright install chromium` ou informe `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. Neste ambiente, a gravação utilizou o FFmpeg 7.1.5 do sistema por um symlink no cache temporário configurado em `PLAYWRIGHT_BROWSERS_PATH`; não houve atualização de pacotes.

O raw e sua timeline ficam no diretório temporário indicado, fora do repositório. Sem override, ambos os scripts usam a pasta `world-explorer-media/raw` dentro do diretório temporário do sistema. Os novos arquivos finais são escritos em `docs/media/`.

O relógio da timeline começa após a criação da página. Confira os primeiros frames de cada nova gravação antes de usar `--offset-seconds`. Nesta produção foi removida somente a margem inicial medida de 0,235 segundo; o manifesto registra essa medida e a inspeção visual, sem afirmar uma calibração mais precisa. Os resultados externos podem mudar, portanto confira novamente destino, fotografias, textos, atribuições e sincronização antes de publicar uma nova captura.

## Conferir o resultado

```bash
ffprobe -v error -show_streams -show_format docs/media/video/world-explorer-demo.mp4
ffmpeg -v error -i docs/media/video/world-explorer-demo.mp4 -f null -
npm run check
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001 npm run test:e2e
```

Confira também os PNGs, a miniatura, as legendas e a reprodução do MP4 em um navegador ou player. Depois do push, verifique os arquivos na branch publicada e a renderização do README no GitHub. Os testes existentes utilizam respostas controladas em alguns fluxos; a documentação visual foi capturada separadamente com os serviços reais.
