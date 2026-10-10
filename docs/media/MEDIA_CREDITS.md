# Créditos das mídias demonstrativas

As capturas mostram o **World Explorer**, do repositório **Globe-Express**, em funcionamento no modo aberto. Foram realizadas em 10 de outubro de 2026, a partir do commit [`14c94113f88692edf0eca8bf38308fc6dfdeb1b9`](https://github.com/Helio965/Globe-Express/tree/14c94113f88692edf0eca8bf38308fc6dfdeb1b9), com pesquisa real por Brasília. A interface, as animações, os serviços e os dados da aplicação foram preservados.

Os PNGs são capturas diretas do Chromium. O vídeo registra interações reais e contínuas no navegador, incluindo pesquisa, seleção, zoom, deslocamento do mapa, apresentação, detalhes, troca de fotografia, locais próximos, favoritos, histórico e retorno à tela inicial. Não foram usados mocks, interceptação ou substituição de respostas, fotografias de outro destino ou imagens geradas.

## Registro e edição

O [manifest das capturas](capture-manifest.json) registra o commit, os viewports, as dimensões dos PNGs, as URLs das imagens carregadas, os identificadores Commons e os metadados recebidos. A verificação TLS permaneceu habilitada.

Para registrar os metadados completos, a automação fez três consultas JSON adicionais durante as capturas e duas durante a gravação, usando o endpoint real `POST /api/destination`. Essas consultas foram necessárias porque o Chromium não disponibilizou o corpo da resposta em streaming para inspeção. Elas não interceptaram nem substituíram a resposta NDJSON usada pela interface; o nome do destino e as URLs das fotografias renderizadas foram conferidos separadamente.

A gravação original possui viewport de 1920 × 960 e 30 FPS. A edição acrescenta uma faixa inferior de 120 pixels para as explicações em português, mantendo a interface e seus créditos visíveis na composição de 1920 × 1080. O redimensionamento, os recortes, as sobreposições e as transições das fotografias dentro da aplicação são os da interface original. A miniatura utiliza um frame real da apresentação de Brasília e recebe somente os textos editoriais da capa.

O vídeo é **silencioso, com explicações e legendas em português brasileiro**. Não havia uma ferramenta de narração pt-BR com qualidade adequada neste ambiente. Não foram utilizados música, voz sintética ou efeitos sonoros.

## Fotografias exibidas

Os links de cada obra levam ao arquivo original no Wikimedia Commons, onde estão sua descrição, autoria e condições de reutilização. As licenças e os campos `Artist`, `Credit` e `ImageDescription` foram reconfirmados pela API Commons `imageinfo/extmetadata` em 10 de outubro de 2026. Os nomes dos fotógrafos da Agência Brasília foram preservados a partir das descrições, além do crédito institucional informado em `Artist`.

| Obra / arquivo Commons | Autoria | Licença | Onde aparece |
| --- | --- | --- | --- |
| [Planalto Central (cropped).jpg](<https://commons.wikimedia.org/wiki/File%3APlanalto_Central_(cropped).jpg>) | Arturdiasr, conforme o registro de autoria da obra | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | PNGs 03, 04, 05, 06, 07 e 08; fotografia principal, prévia no mapa e cartão do Plano Piloto no vídeo; fundo da miniatura |
| [Catedral de Brasília — 53381482426](<https://commons.wikimedia.org/wiki/File%3A07_12_2023_-_-TBT_Bras%C3%ADlia%2C_h%C3%A1_36_anos_Patrim%C3%B4nio_Mundial_pela_Unesco_(53381482426).jpg>) | Renato Alves / [Agência Brasília](https://www.flickr.com/people/64586261@N02), Brasília, Brasil; [publicação de origem](https://www.flickr.com/photos/agenciabrasilia/53381482426/) | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) | Miniaturas nos PNGs 04, 05 e 07; miniatura e fotografia principal após a troca na cena 6 do vídeo |
| [Catedral de Brasília — 53381921855](<https://commons.wikimedia.org/wiki/File%3A07_12_2023_-_-TBT_Bras%C3%ADlia%2C_h%C3%A1_36_anos_Patrim%C3%B4nio_Mundial_pela_Unesco_(53381921855).jpg>) | Geovana Albuquerque / [Agência Brasília](https://www.flickr.com/people/64586261@N02), Brasília, Brasil; [publicação de origem](https://www.flickr.com/photos/agenciabrasilia/53381921855/) | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) | Miniaturas nos PNGs 04, 05 e 07 e no vídeo |
| [Catedral de Brasília — 53380561112](<https://commons.wikimedia.org/wiki/File%3A07_12_2023_-_-TBT_Bras%C3%ADlia%2C_h%C3%A1_36_anos_Patrim%C3%B4nio_Mundial_pela_Unesco_(53380561112).jpg>) | Geovana Albuquerque / [Agência Brasília](https://www.flickr.com/people/64586261@N02), Brasília, Brasil; [publicação de origem](https://www.flickr.com/photos/agenciabrasilia/53380561112/) | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) | Miniatura que passa a aparecer após a troca de fotografia na cena 6 do vídeo |
| [Rodoviária do Plano Piloto.jpg](<https://commons.wikimedia.org/wiki/File%3ARodovi%C3%A1ria_do_Plano_Piloto.jpg>) | victoria.camara; fonte e crédito original registrados na página Commons | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | Cartão de local próximo no PNG 06 e na cena 6 do vídeo |
| [BSB SDS 01.jpg](<https://commons.wikimedia.org/wiki/File%3ABSB_SDS_01.jpg>) | [Luis Dantas](https://commons.wikimedia.org/wiki/User:Luis_Dantas) | Domínio público, disponibilizado pelo próprio autor (`PD-self`); [declaração na origem](<https://commons.wikimedia.org/wiki/File%3ABSB_SDS_01.jpg>) | Cartão do Setor de Diversões Sul no PNG 06 e na cena 6 do vídeo |

As três imagens da Catedral usam o título original da série **“07 12 2023 - -TBT Brasília, há 36 anos Patrimônio Mundial pela Unesco”**. Os números apresentados na tabela identificam os arquivos e as respectivas publicações Flickr; não são fotografias intercambiáveis.

### Créditos complementares da galeria disponível

Os arquivos abaixo também foram retornados pela consulta real e têm seus créditos na área de fontes da aplicação. Não são apresentados como fotografias visíveis nos PNGs nem como novas trocas de imagem demonstradas no vídeo.

| Obra / arquivo Commons | Autoria | Licença |
| --- | --- | --- |
| [Catedral de Brasília — 53381657588](<https://commons.wikimedia.org/wiki/File%3A07_12_2023_-_-TBT_Bras%C3%ADlia%2C_h%C3%A1_36_anos_Patrim%C3%B4nio_Mundial_pela_Unesco_(53381657588).jpg>) | Geovana Albuquerque / [Agência Brasília](https://www.flickr.com/people/64586261@N02); [origem](https://www.flickr.com/photos/agenciabrasilia/53381657588/) | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) |
| [Catedral de Brasília — 53381801804](<https://commons.wikimedia.org/wiki/File%3A07_12_2023_-_-TBT_Bras%C3%ADlia%2C_h%C3%A1_36_anos_Patrim%C3%B4nio_Mundial_pela_Unesco_(53381801804).jpg>) | Geovana Albuquerque / [Agência Brasília](https://www.flickr.com/people/64586261@N02); [origem](https://www.flickr.com/photos/agenciabrasilia/53381801804/) | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) |
| [Catedral de Brasília — 53381657563](<https://commons.wikimedia.org/wiki/File%3A07_12_2023_-_-TBT_Bras%C3%ADlia%2C_h%C3%A1_36_anos_Patrim%C3%B4nio_Mundial_pela_Unesco_(53381657563).jpg>) | Geovana Albuquerque / [Agência Brasília](https://www.flickr.com/people/64586261@N02); [origem](https://www.flickr.com/photos/agenciabrasilia/53381657563/) | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) |
| [Supremo Tribunal Federal — 53380561597](<https://commons.wikimedia.org/wiki/File%3A07_12_2023_-_-TBT_Bras%C3%ADlia%2C_h%C3%A1_36_anos_Patrim%C3%B4nio_Mundial_pela_Unesco_(53380561597).jpg>) | Renato Alves / [Agência Brasília](https://www.flickr.com/people/64586261@N02); [origem](https://www.flickr.com/photos/agenciabrasilia/53380561597/) | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) |
| [Supremo Tribunal Federal — 53381658033](<https://commons.wikimedia.org/wiki/File%3A07_12_2023_-_-TBT_Bras%C3%ADlia%2C_h%C3%A1_36_anos_Patrim%C3%B4nio_Mundial_pela_Unesco_(53381658033).jpg>) | Renato Alves / [Agência Brasília](https://www.flickr.com/people/64586261@N02); [origem](https://www.flickr.com/photos/agenciabrasilia/53381658033/) | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) |
| [Supremo Tribunal Federal — 53381658023](<https://commons.wikimedia.org/wiki/File%3A07_12_2023_-_-TBT_Bras%C3%ADlia%2C_h%C3%A1_36_anos_Patrim%C3%B4nio_Mundial_pela_Unesco_(53381658023).jpg>) | Renato Alves / [Agência Brasília](https://www.flickr.com/people/64586261@N02); [origem](https://www.flickr.com/photos/agenciabrasilia/53381658023/) | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) |

## Textos, fatos e resultados de pesquisa

Os textos enciclopédicos e as descrições exibidas são atribuídos aos colaboradores da **Wikipedia em português**, sob [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.pt). São trechos ou descrições apresentados pela aplicação, com seleção e formatação feitas por ela. Os artigos e seus históricos identificam as contribuições originais:

| Conteúdo | Artigo | Colaboradores / histórico |
| --- | --- | --- |
| Brasília | [Artigo](https://pt.wikipedia.org/wiki/Bras%C3%ADlia) | [Histórico](https://pt.wikipedia.org/w/index.php?title=Bras%C3%ADlia&action=history) |
| Plano Piloto (Distrito Federal) | [Artigo](<https://pt.wikipedia.org/wiki/Plano_Piloto_(Distrito_Federal)>) | [Histórico](https://pt.wikipedia.org/w/index.php?title=Plano_Piloto_%28Distrito_Federal%29&action=history) |
| Rodoviária do Plano Piloto | [Artigo](https://pt.wikipedia.org/wiki/Rodovi%C3%A1ria_do_Plano_Piloto) | [Histórico](https://pt.wikipedia.org/w/index.php?title=Rodovi%C3%A1ria_do_Plano_Piloto&action=history) |
| Setor de Diversões Sul | [Artigo](https://pt.wikipedia.org/wiki/Setor_de_Divers%C3%B5es_Sul) | [Histórico](https://pt.wikipedia.org/w/index.php?title=Setor_de_Divers%C3%B5es_Sul&action=history) |
| Empresa Brasileira de Pesquisa e Inovação Industrial | [Artigo](https://pt.wikipedia.org/wiki/Empresa_Brasileira_de_Pesquisa_e_Inova%C3%A7%C3%A3o_Industrial) | [Histórico](https://pt.wikipedia.org/w/index.php?title=Empresa_Brasileira_de_Pesquisa_e_Inova%C3%A7%C3%A3o_Industrial&action=history) |

Os fatos estruturados de Brasília são atribuídos aos colaboradores do **Wikidata**, entidade [Q2844](https://www.wikidata.org/wiki/Q2844), disponíveis sob [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Consulte a [política de copyright do Wikidata](https://www.wikidata.org/wiki/Wikidata:Copyright). A licença CC0 refere-se aos dados estruturados; não altera as licenças das fotografias ou dos textos Wikipedia.

## Cartografia

**© OpenStreetMap contributors.** Os dados cartográficos são disponibilizados sob a [Open Database License 1.0 — ODbL](https://opendatacommons.org/licenses/odbl/1-0/). A cartografia exibida usa o serviço padrão `tile.openstreetmap.org` por meio do Leaflet.

A atribuição nativa do mapa foi preservada nos PNGs 02 e 03 e nas cenas de pesquisa e mapa do vídeo. A faixa editorial dessas cenas também informa `© OpenStreetMap contributors · https://www.openstreetmap.org/copyright`. Os mapas são capturas da renderização, sem redistribuição de um banco de dados geográfico.

Referências: [copyright e licença](https://www.openstreetmap.org/copyright), [diretrizes de atribuição](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines) e [política do serviço de tiles](https://operations.osmfoundation.org/policies/tiles/). A referência a CC BY-SA 2.0 na página de copyright do OSM aplica-se à documentação do projeto; não é usada aqui para licenciar os dados ou presumir a licença dos tiles.

Não foi utilizado conteúdo Google Maps, Places, satélite ou terreno nesta demonstração.

## Licença da documentação audiovisual

Crédito editorial: **World Explorer / projeto Globe-Express, 2026**. A montagem audiovisual, os textos explicativos, as legendas e a composição editorial da miniatura desta documentação são disponibilizados sob [Creative Commons Atribuição-CompartilhaIgual 4.0 — CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), compatível com o compartilhamento da fotografia de Arturdiasr e dos textos Wikipedia incorporados. As modificações editoriais consistem nas legendas, na faixa inferior e nos textos da capa; o conteúdo mostrado pela aplicação foi preservado.

As fotografias continuam sob suas licenças individuais, inclusive o arquivo em domínio público. Os dados OSM continuam sujeitos à ODbL. Ao reutilizar estes materiais, mantenha este arquivo de créditos ou atribuições equivalentes, os links das obras e licenças, indique alterações e compartilhe adaptações sujeitas a CC BY-SA sob licença compatível.

O código da aplicação e dos scripts continua sob a [licença MIT do repositório](../../LICENSE). A licença MIT não concede direitos adicionais sobre fotografias, textos, cartografia ou marcas de terceiros.
