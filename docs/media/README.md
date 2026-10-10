# Capturas e vídeo do World Explorer

Este diretório reúne a documentação visual obtida pela navegação na aplicação real. A produção utiliza uma pesquisa por **Lisboa**, fotografias e informações retornadas pelos provedores, a galeria, os detalhes, lugares próximos, favoritos e histórico. A captura móvel usa uma sessão separada.

Na captura de referência, o retorno real apresentou **4 fotografias de Lisboa e 8 lugares próximos, dos quais 4 tinham fotografia**. Foram gerados sete PNGs e nove cenas úteis, somando 94 segundos no manifesto de captura. Esses números descrevem essa execução; não são dados fixos do produto.

Os scripts não interceptam requisições, não usam as fixtures dos testes e não alteram os estilos ou o conteúdo da interface. As animações originais permanecem ativas. O mapa Google sem credenciais é omitido: **não há `03-map.png` nem demonstração de mapa funcional neste material**.

## Conteúdo

| Arquivo | O que mostra | Dimensões verificadas |
| --- | --- | --- |
| `screenshots/01-home.png` | Página inicial completa | 1920 × 1163 |
| `screenshots/02-search.png` | Pesquisa com sugestões recebidas da fonte real | 1920 × 1080 |
| `screenshots/04-cinematic.png` | Apresentação do destino com fotografia selecionada | 1920 × 998 |
| `screenshots/05-details.png` | Detalhes e referências do destino | 1920 × 1080 |
| `screenshots/06-gallery.png` | Outra fotografia da galeria | 1920 × 998 |
| `screenshots/07-favorites.png` | Destino salvo na lista de favoritos | 1920 × 1080 |
| `screenshots/08-mobile.png` | Seção cinematográfica móvel completa, incluindo os créditos | 393 × 855 |
| `video/index.html` | Player estático com controles nativos e links de download | Responsivo |
| `MEDIA_CREDITS.html` | Versão dos créditos para leitura no navegador | Responsivo |
| `video/world-explorer-demo.mp4` | Demonstração editada com explicações em português | Consulte `render-info.json` |
| `video/video-thumbnail.png` | Miniatura retirada de um quadro da cena cinematográfica | Consulte `render-info.json` |
| `video/subtitles-pt-br.srt` | Legendas em arquivo separado | — |
| `video/render-info.json` | Medições e verificações do arquivo final | — |
| `MEDIA_CREDITS.md` | Autores, fontes, licenças e condições de reutilização | — |

A numeração preserva o espaço reservado ao mapa omitido. A captura não produz um oitavo PNG para preencher essa ausência.

## Requisitos

- Node.js **22 ou superior** e as dependências instaladas com `npm ci`.
- Aplicação compilada e iniciada em modo de produção, com acesso real à Wikipedia, Wikidata, Wikimedia Commons e aos hosts que entregam suas imagens. Consulte o [README do projeto](../../README.md) para configurar serviços e rede.
- Chromium. O script aceita `CHROMIUM_PATH`, detecta `/usr/bin/chromium` automaticamente ou utiliza um Chromium já instalado para o Playwright.
- Para gravar e editar: **FFmpeg** com `libx264`, filtro `ass`/`libass` e codificador de legendas `mov_text`; **ffprobe** disponível no `PATH`.
- Fonte **Open Sans** ou **DejaVu Sans**, com suporte aos caracteres portugueses. O renderizador procura `/usr/share/fonts/truetype/open-sans/OpenSans-Regular.ttf` e depois `/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf`, copiando também a variante em negrito quando disponível.

Em sistemas Debian/Ubuntu, os pacotes correspondentes são normalmente `chromium`, `ffmpeg`, `fonts-open-sans` e `fonts-dejavu-core`. Use o gerenciador e as permissões adequados à máquina. Se preferir o navegador distribuído pelo Playwright, instale-o com `npx playwright install chromium`.

A gravação utiliza os quadros reais do compositor Chromium por **CDP** e o FFmpeg do sistema. **Não é necessário baixar o pacote de FFmpeg do Playwright.** `FFMPEG_PATH` pode indicar o executável utilizado pela captura; o renderizador chama `ffmpeg` e `ffprobe` pelo `PATH`.

Confira as ferramentas antes de começar:

```bash
node --version
ffmpeg -version
ffprobe -version
ffmpeg -hide_banner -encoders | rg 'libx264|mov_text'
ffmpeg -hide_banner -filters | rg '\bass\b'
node scripts/capture-demo.mjs --help
node scripts/render-demo.mjs --help
```

## Iniciar uma interface limpa

Execute os comandos na raiz do repositório:

```bash
npm ci
npm run build
npm run start
```

Mantenha o servidor em execução e use outro terminal para capturar. Prefira produção para não incluir indicadores de desenvolvimento, mensagens de compilação ou ferramentas de inspeção na interface. O script abre um contexto de navegador novo, sem dados privados de uma sessão anterior.

O endereço padrão é `http://127.0.0.1:3000`. Para outro endereço, forneça `--url` ou a variável `WORLD_EXPLORER_URL`. A URL deve ser HTTP(S), sem credenciais, parâmetros de consulta ou fragmentos.

Em ambientes cujo acesso externo depende de `HTTPS_PROXY`/`HTTP_PROXY`, mantenha a configuração fornecida pela hospedagem e habilite `NODE_USE_ENV_PROXY=1` no processo da aplicação quando necessário. Esse suporte requer Node **22.21+ ou 24.5+**. Preserve a verificação TLS e o acesso direto ao endereço local. A ausência de credenciais Google não impede o fluxo enciclopédico usado nesta captura.

## Capturar os PNGs e a gravação original

```bash
mkdir -p /tmp/globe-demo
CHROMIUM_PATH=/usr/bin/chromium node scripts/capture-demo.mjs \
  --url http://127.0.0.1:3000 \
  --query Lisboa \
  --hero-photo 2 \
  --record \
  --raw-dir /tmp/globe-demo \
  --manifest /tmp/globe-demo/capture-manifest.json
```

O script salva os sete PNGs em `docs/media/screenshots/`. A gravação original fica em um subdiretório único, como `/tmp/globe-demo/world-explorer-raw-<identificador>/browser-recording.mp4`. O manifesto informa o caminho absoluto em `rawVideoPath`, as cenas e seus tempos, as respostas dos destinos, os metadados das fotografias e a razão da omissão do mapa.

Use o manifesto produzido pela mesma execução que gerou a gravação. O renderizador exige `completed: true`; uma captura interrompida pode deixar arquivos parciais e um manifesto incompleto. Não publique esses arquivos como uma execução concluída.

| Opção da captura | Comportamento |
| --- | --- |
| `--query TEXT` | Pesquisa real, padrão `Lisboa`; precisa de um resultado geográfico com nome correspondente |
| `--hero-photo N` | Fotografia inicial da galeria, contando a partir de 1; padrão 2 |
| `--output PATH` | Diretório dos PNGs; padrão `docs/media/screenshots` |
| `--manifest PATH` | Caminho do manifesto; padrão `docs/media/capture-manifest.json` |
| `--raw-dir PATH` | Diretório pai para a gravação original; padrão diretório temporário do sistema |
| `--timeout MS` | Prazo por operação, padrão 60000; intervalo permitido de 10000 a 180000 |
| `--record` | Grava o navegador e mantém as cenas pelo tempo necessário às explicações |
| `--headed` | Exibe a janela do navegador quando existe uma sessão gráfica |
| `--overwrite` | Autoriza substituir os PNGs e o manifesto existentes |

Sem `--record`, o script produz as capturas e seus metadados, mas não gera o vídeo original necessário à edição. Os comandos recusam substituir arquivos existentes por padrão: revise os resultados antes de acrescentar `--overwrite` para uma nova execução.

A captura exige pelo menos duas fotografias verificadas do destino. Se a fonte não retornar o lugar, se uma imagem não carregar ou se a interface apresentar um erro, investigue a resposta e a rede; o script não fabrica conteúdo para completar a cena. A seção de próximos lugares é omitida quando a resposta real não contém resultados.

## Editar e exportar

Depois que a captura terminar com sucesso:

```bash
node scripts/render-demo.mjs \
  --manifest /tmp/globe-demo/capture-manifest.json \
  --credits-url https://github.com/Helio965/Globe-Express/blob/64d74af5fde1cbc52ebac1893a728c50a8a4a342/docs/media/MEDIA_CREDITS.md
```

O renderizador aceita `--manifest`, `--credits-url`, `--overwrite` e `--help`. A saída é sempre `docs/media/video/`. Os arquivos intermediários de edição são criados em um diretório temporário próprio e removidos ao final. A gravação original e o manifesto de captura permanecem no local escolhido; não precisam ser versionados.

`--credits-url` define a URL HTTPS pública dos créditos que aparece no encerramento, nas legendas e nos metadados. O padrão aponta a `MEDIA_CREDITS.md` na branch `main`. Para publicar uma PR antes do merge, prefira um link permanente `https://github.com/Helio965/Globe-Express/blob/<SHA-publicado>/docs/media/MEDIA_CREDITS.md`, usando o commit que contém os créditos correspondentes à captura. Assim o endereço continua válido mesmo se a branch de trabalho for removida.

O roteiro tem **94 segundos como duração-alvo**, com cenas de início, pesquisa, apresentação, galeria, detalhes, próximos lugares, favoritos, histórico e encerramento. Os tempos reais vêm do manifesto. Trechos de preparação, consultas e carregamentos marcados com `include: false` são retirados. As interações mantidas não são aceleradas; intervalos estáticos repetem o último quadro real para compor a gravação a 30 FPS.

A imagem inteira do navegador é reduzida proporcionalmente para caber na área superior de **1920 × 960**, com preenchimento lateral quando necessário. Uma faixa editorial externa de **120 px** ocupa a parte inferior do vídeo final de **1920 × 1080**. As explicações ficam nessa faixa, preservando a interface e seus créditos. As transições usam fades discretos de 0,18 s.

O material é **sem narração e sem música**; não há faixa de áudio. Não havia um serviço de síntese de voz disponível para esta produção. As explicações em português estão visíveis no vídeo, em uma faixa opcional de legendas `mov_text` no MP4 e no arquivo `.srt`. Como o texto já está gravado na imagem, a faixa opcional fica desativada por padrão para evitar duplicação visual.

## Verificação e métricas

O renderizador só copia os arquivos finais após verificar:

- MP4 com vídeo H.264, 1920 × 1080, 30 FPS e formato de pixel `yuv420p`.
- Legendas `mov_text`, ausência de faixa de áudio e duração entre 60 e 120 segundos, compatível com a soma das cenas.
- Tamanho inferior a **25 MiB**, com uma segunda compressão quando necessária.
- Decodificação de **todos os quadros** com FFmpeg, além da inspeção de metadados por ffprobe.

A exportação publicada tem **93,967 segundos, 1920 × 1080 pixels, 30 FPS e 4,35 MiB**, com vídeo H.264 `yuv420p`, legendas visíveis/`mov_text`/SRT e nenhuma faixa de áudio. Todos os quadros foram decodificados; a reprodução também foi conferida no Chromium. As medições estão em [`video/render-info.json`](video/render-info.json). A duração-alvo de 94 segundos não substitui a duração efetivamente medida nesse arquivo.

Para conferir novamente a exportação:

```bash
ffprobe -v error \
  -show_entries format=duration,size:stream=codec_name,codec_type,width,height,r_frame_rate,pix_fmt \
  -of json docs/media/video/world-explorer-demo.mp4

ffmpeg -hide_banner -loglevel error -nostdin \
  -i docs/media/video/world-explorer-demo.mp4 \
  -map 0:v:0 -an -sn -f null -
```

Revise também o vídeo, a miniatura e os sete PNGs visualmente: dados carregados, créditos legíveis, nenhuma ferramenta de desenvolvimento, nenhum segredo e nenhuma afirmação de mapa funcionando sem a configuração correspondente.

## Fontes e nova publicação

Consulte [`MEDIA_CREDITS.md`](MEDIA_CREDITS.md) antes de reutilizar ou publicar os arquivos. A licença MIT do código não se estende automaticamente às fotografias, aos mapas e aos textos de terceiros. O enquadramento, a redução e a montagem do vídeo não eliminam as condições de atribuição das fontes originais.

Ao repetir a captura, os provedores podem retornar fotografias, autores, licenças e locais próximos diferentes. **Confira novamente as páginas de origem e atualize os créditos de acordo com o novo manifesto.** Reavalie também permissões de redistribuição se decidir capturar conteúdo Google. Este conjunto demonstra o conteúdo efetivamente obtido para Lisboa; não comprova a cobertura de todos os destinos nem a integração Google Maps.

## Publicar o player

`video/index.html` oferece controles nativos, reprodução em tela cheia e downloads do vídeo e das legendas. Ele funciona em qualquer servidor estático que sirva este diretório; não precisa executar a aplicação para reproduzir o material. O player e a ausência de overflow mobile foram verificados no Chromium.

A branch `gh-pages` já contém uma cópia dos arquivos da demonstração, dos créditos e da licença, com `.nojekyll`. A integração do GitHub não permite ativar Pages: a API retornou HTTP 403, “Resource not accessible by integration”. A publicação do player ainda não foi concluída.

Para ativá-lo, abra **Settings → Pages** no repositório, escolha **Deploy from a branch**, selecione **gh-pages** e **/(root)**, e salve. Após o deploy, o endereço esperado é `https://helio965.github.io/Globe-Express/`. Confira a reprodução, os downloads e os créditos antes de substituir o link da miniatura no README por esse endereço. O MP4 já pode ser baixado diretamente pelo link publicado no README.

Essa página é a documentação do vídeo. A aplicação Next.js continua exigindo o runtime e a configuração descritos no README principal.

`MEDIA_CREDITS.html` foi gerado de `MEDIA_CREDITS.md` pelo renderizador Markdown do GitHub. Ao atualizar fontes ou licenças, atualize ambas as versões e publique novamente os arquivos estáticos. A gravação mantém um link permanente para os créditos do commit correspondente, preservando as atribuições daquela edição.
