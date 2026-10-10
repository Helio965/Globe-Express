# World Explorer

Explore lugares do mundo por pesquisa ou pelo mapa e transforme a seleção em uma apresentação com fotografias reais, informações enciclopédicas e atrações próximas. O **World Explorer**, mantido neste repositório Globe-Express, consulta os provedores a cada exploração: não contém um catálogo fixo de destinos nem depende de geração de texto por inteligência artificial.

A interface combina mapa interativo, títulos editoriais, galeria com créditos, cartões de locais próximos e transições GSAP. Conteúdo ausente é informado; uma fotografia de outro destino nunca deve substituir silenciosamente uma imagem indisponível.

Ao clicar em um ponto de interesse do mapa Google, seu identificador é usado para consultar os detalhes e fotografias desse lugar. Cliques fora desses pontos conservam as coordenadas exatas. Quando a geocodificação identifica uma localidade, o enriquecimento enciclopédico exige correspondência de nome e um artigo a até 1,5 km; pontos sem identidade confirmada não recebem imagens de um artigo vizinho.

## Funcionalidades e disponibilidade

| Recurso | Origem / requisito |
| --- | --- |
| Pesquisa com sugestões de lugares | Google Places API (New), com chave de servidor |
| Mapa, satélite, relevo, marcador e seleção por clique | Google Maps JavaScript API, com chave de navegador |
| Identificação de coordenadas e endereços | Google Geocoding API, com chave de servidor |
| Pesquisa sem chaves Google | Wikipedia, com cobertura menor: somente artigos com coordenadas |
| Descrições, links de referência e informações estruturadas | Wikipedia e Wikidata, quando disponíveis |
| Fotografias reais e créditos | Wikimedia Commons e Google Place Photos, conforme disponibilidade e configuração |
| Galeria, detalhes, próximos lugares e navegação entre destinos | Conteúdo recuperado dos provedores, sem recarregar a página |
| Favoritos e histórico | Referências locais no navegador, sem conta de usuário |

**Sem as chaves Google, a busca enciclopédica continua disponível quando a rede permite acessar a Wikimedia.** O mapa informa a configuração ausente; a aplicação não simula um mapa Google funcionando. A pesquisa da Wikipedia não substitui a cobertura do Places para endereços, estabelecimentos ou regiões pouco documentadas. Nenhuma API de IA é necessária.

## Tecnologias

- Next.js 16 com App Router, React 19 e TypeScript em modo estrito.
- Tailwind CSS 4, CSS responsivo, fonte Oswald hospedada localmente, Lucide e GSAP para animações com suporte a movimento reduzido.
- Next Image com loader próprio e Sharp para dimensionar fotografias licenciadas da Wikimedia; fotos Google preservam o fluxo sem cache.
- Zod para validação de entradas e respostas externas.
- Google Maps JavaScript API, Places API (New), Place Photos e Geocoding API.
- APIs MediaWiki da Wikipedia e Wikimedia Commons; Wikidata.
- Vitest para testes de lógica e serviços; Playwright para navegação e interface.

As versões efetivamente instaladas estão fixadas em `package-lock.json`. O código-fonte usa a licença MIT; textos, mapas e imagens de terceiros conservam as próprias condições de uso.

## Execução local

Requisitos: **Node.js 22 ou superior**, npm e acesso HTTPS aos provedores utilizados. O faturamento Google é necessário para os recursos correspondentes.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

O servidor de desenvolvimento escuta a porta 3000. Preencha as chaves em `.env.local` para habilitar os serviços Google ou deixe-as vazias para usar a pesquisa enciclopédica. `npm install` também instala as dependências, mas `npm ci` reproduz o lockfile sem modificá-lo. Não versione `.env.local`.

Para produção:

```bash
npm run build
npm run start
```

A aplicação precisa de um runtime Node.js para as rotas de API. Um host somente de arquivos estáticos não executa as integrações de servidor. Configure as variáveis no serviço de hospedagem e reinicie o processo após alterá-las. A chave pública é entregue ao mapa pela configuração da página no servidor; esse fluxo aceita configuração em runtime, sem depender de um valor já embutido no build.

## Variáveis de ambiente

| Variável | Uso | Exposição |
| --- | --- | --- |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Carregar o mapa Google no navegador | Pública por natureza; restringir por referenciador HTTP e API |
| `GOOGLE_MAPS_SERVER_API_KEY` | Places, Place Photos e Geocoding nas rotas de servidor | Segredo; nunca usar em componentes de cliente ou enviar ao navegador |

Use **duas chaves separadas**. Nenhum valor real está no arquivo `.env.example`. Não crie `AI_API_KEY`: o projeto não usa um serviço de IA.

Em um ambiente com injeção de segredos por proxy HTTPS, o valor presente no processo pode ser um marcador substituído apenas nas requisições aos hosts autorizados. A chave de servidor deve ter destinos `places.googleapis.com` e `maps.googleapis.com` autorizados e trafegar pelo proxy fornecido. A chave do navegador precisa ser a chave pública real: um marcador de segredo do proxy do servidor não funciona no navegador. Não copie marcadores ou segredos para arquivos públicos e não desative a verificação TLS para solucionar conectividade.

Se a rede da hospedagem depende de `HTTPS_PROXY`/`HTTP_PROXY`, habilite o suporte nativo do Node ao proxy nas chamadas `fetch`. Em **Node 22.21+ ou 24.5+**, execute `NODE_USE_ENV_PROXY=1 npm run dev` ou `NODE_USE_ENV_PROXY=1 npm run start`, preservando as configurações de proxy fornecidas pelo ambiente. Em redes sem proxy, essa opção não é necessária. Consulte a [documentação do Node](https://nodejs.org/api/cli.html#node_use_env_proxy1) para a versão utilizada.

## Configuração no Google Cloud

1. No [Google Cloud Console](https://console.cloud.google.com/), crie ou selecione um projeto. Vincule uma conta de faturamento conforme os requisitos da Google Maps Platform.
2. Em **APIs e serviços → Biblioteca**, habilite **Maps JavaScript API**, **Places API (New)** e **Geocoding API**. Place Photos faz parte do serviço Places; a aplicação usa os endpoints novos.
3. Em **APIs e serviços → Credenciais**, crie uma chave para o navegador. Em restrições do aplicativo, escolha **Sites / referenciadores HTTP** e adicione somente as origens necessárias: seu domínio de produção e, para desenvolvimento, o endereço/porta usados localmente. Exemplo de desenvolvimento: `http://localhost:3000/*`. Não libere todos os sites.
4. Na mesma chave, restrinja as APIs à **Maps JavaScript API**. Coloque-a em `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
5. Crie outra chave para o servidor. Restrinja as APIs a **Places API (New)** e **Geocoding API**. Quando a hospedagem possui IP de saída estável, aplique a restrição de **endereços IP** correspondente. Não use restrição por referenciador HTTP nesta chave. Para saída dinâmica, use a solução de saída fixa/controle de acesso suportada pela hospedagem e siga as recomendações oficiais; não reutilize a chave do navegador.
6. Guarde essa chave em `GOOGLE_MAPS_SERVER_API_KEY` no gerenciador de segredos ou ambiente do servidor. Não a envie por chat, commit ou URL de uma página pública.
7. Em quotas e métricas das APIs, defina limites de requisições compatíveis com o orçamento. Configure [orçamentos e alertas](https://cloud.google.com/billing/docs/how-to/budgets). Um alerta de orçamento avisa sobre gastos; ele não é, por si só, um teto que interrompe as cobranças.
8. Reinicie a aplicação. Pesquise um local, selecione uma sugestão, confirme marcador e coordenadas, entre na apresentação e verifique imagens, atribuições e próximos lugares. Teste também o clique em uma região remota e a navegação entre destinos. O painel de APIs do Google deve registrar as chamadas correspondentes.

Se o mapa mostrar erro de autorização, confira API habilitada, faturamento, restrição de referenciador e a chave pública. Se a pesquisa Google falhar, confira a chave **de servidor**, a ativação do Places (New), a restrição de API/IP e as quotas. Uma falha de rede/proxy não comprova que a chave está incorreta. Mantenha erros e logs livres de credenciais.

Documentação oficial: [primeiros passos](https://developers.google.com/maps/get-started), [segurança de chaves](https://developers.google.com/maps/api-security-best-practices), [sessões do Autocomplete](https://developers.google.com/maps/documentation/places/web-service/session-pricing) e [preços](https://developers.google.com/maps/billing-and-pricing/pricing).

## Rede e hospedagem

As integrações usam HTTPS. Em ambientes com lista de permissão, preserve os destinos já necessários e acrescente os que correspondem aos recursos utilizados:

| Destinos | Finalidade |
| --- | --- |
| `maps.googleapis.com`, `maps.gstatic.com` | JavaScript, recursos do mapa e Geocoding |
| `places.googleapis.com` | Autocomplete, detalhes, busca de próximos lugares e fotos |
| `*.googleusercontent.com` | Entrega de imagens do Google autorizadas pelo endpoint de fotos |
| `pt.wikipedia.org`, `en.wikipedia.org` | Pesquisa, coordenadas e descrições em português/inglês |
| `www.wikidata.org` | Informações estruturadas |
| `commons.wikimedia.org`, `upload.wikimedia.org`, `thumb.wikimedia.org` | Metadados, atribuições, arquivos de imagem e miniaturas |
| `registry.npmjs.org` | Instalação das dependências |

Os recursos do mapa podem requisitar outros domínios Google conforme a configuração e região. Consulte a [documentação de Content Security Policy](https://developers.google.com/maps/documentation/javascript/content-security-policy) para manter a política de rede e a CSP adequadas. As páginas oficiais de referência requerem ainda acesso a `developers.google.com`, `cloud.google.com` e `foundation.wikimedia.org`.

As rotas têm limites de requisição por processo/IP: 60/minuto na pesquisa e na resolução de um lugar, 30/minuto para destinos completos, 45/minuto na geocodificação reversa e 120/minuto em cada serviço de fotos. O mapa e os serviços externos possuem suas próprias quotas. Em produção com mais de uma instância, aplique limites compartilhados e proteção de abuso no gateway; o limitador em memória não é um controle global de custos. O proxy de entrada deve sobrescrever `x-forwarded-for` de forma confiável, sem aceitar um IP arbitrário enviado pelo cliente.

`/api/media` aceita apenas arquivos HTTPS rasterizados de `upload.wikimedia.org` e `thumb.wikimedia.org` em `/wikipedia/commons/`, valida redirecionamentos, limita downloads a 12 MiB e processamento a 80 milhões de pixels. A interface utiliza as miniaturas de até 1600 pixels fornecidas pelo Commons, quando disponíveis, inclusive no fundo da apresentação. O servidor processa no máximo duas imagens ao mesmo tempo, com fila de 12 e prazo de 15 segundos incluindo espera; o Sharp também recebe um limite de processamento. Converte as fotos em WebP com largura adequada à tela e cache HTTP de uma hora, permitido para esse conteúdo licenciado. O endpoint não aceita fotos Google nem URLs arbitrárias. Autoria, licença e fonte continuam junto à galeria. `npm run dev` usa o compilador webpack suportado pelo Next.js, evitando o ciclo de HMR observado com Turbopack nesta máquina; o build de produção usa o compilador padrão.

## Testes e verificação

```bash
npm run lint
npm run test
npm run build
npm run typecheck
```

Para os testes de navegador, instale o Chromium do Playwright e execute:

```bash
npx playwright install chromium
npm run test:e2e
```

Caso a máquina já forneça um Chromium compatível:

```bash
CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e
```

O Playwright inicia o servidor de teste conforme `playwright.config.ts`, com as chaves Google vazias para verificar também esse estado. Fora de CI, ele pode reutilizar um servidor já iniciado na porta 3000; esse servidor deve estar em modo sem chaves para a suíte. Os testes automatizados interceptam respostas externas para testar carregamento, falhas e mudanças de destino de forma determinística; esses dados são exclusivos dos testes. A aplicação utiliza serviços reais. Testes com respostas interceptadas não validam uma credencial, uma quota ou a disponibilidade real do Google/Wikimedia.

Na validação com provedores reais, use localidades variadas como entradas de pesquisa: cidade, monumento, montanha, parque, praia, ponto oceânico e nome inexistente. Confira também ausência de fotos, respostas lentas, troca rápida de destino, teclado, movimento reduzido e telas estreitas. Os exemplos de teste não são um catálogo da aplicação.

Os comandos acima são instruções reproduzíveis; não constituem uma declaração de que todos os provedores externos foram verificados. Consulte os resultados efetivos da execução/CI e configure as chaves para validar os recursos Google.

Com o servidor iniciado, a validação real e opcional dos provedores pode ser executada com `npm run test:live`. Ela consulta cidades, monumento, montanha, parque e praia, além de um ponto oceânico, um nome inexistente e coordenadas inválidas. Para outra instalação, defina `WORLD_EXPLORER_URL`. Não usa respostas simuladas e depende da rede e disponibilidade das APIs; sem chaves Google valida a cobertura Wikimedia.

## Organização do projeto

```text
src/
├── app/                 páginas, layout e rotas de API
├── components/          mapa, pesquisa e apresentação cinematográfica
├── lib/                 estado de requisições, persistência local e utilitários de servidor
├── services/            adaptadores Google e Wikimedia
└── types/               contratos compartilhados
```

Os testes `*.test.ts` ficam junto dos módulos que verificam; a configuração de navegador fica em `playwright.config.ts`.
As especificações e fixtures de navegador ficam em `e2e/`. Elas executam os fluxos em Chromium desktop e móvel, com movimento reduzido, e não simulam a disponibilidade de um mapa Google quando a chave está ausente.

As páginas `/privacidade` e `/termos` descrevem o uso de dados e conteúdo ao visitante. A configuração Google fica no servidor; somente a chave destinada ao navegador é exposta. As entradas são validadas, chamadas externas têm tratamento de erro e respostas obsoletas não devem substituir a seleção atual.

## Dados, atribuição e licenciamento

- **Código:** licença [MIT](LICENSE), preservando o aviso de autoria existente.
- **Google Maps/Places:** conteúdo sujeito aos [termos da Google Maps Platform](https://cloud.google.com/maps-platform/terms/) e às [políticas de Places](https://developers.google.com/maps/documentation/places/web-service/policies). Preserve o logotipo, os créditos e as atribuições exigidas. Os requisitos podem variar com o produto, a região e o contrato, inclusive para contas com endereço de faturamento no Espaço Econômico Europeu.
- **Fotos do Google:** as atribuições retornadas pelo serviço acompanham as fotos. Consulte [Place Photos (New)](https://developers.google.com/maps/documentation/places/web-service/place-photos). URLs de fotos, nomes de recursos de foto e respostas Google não são um acervo para download ou cache permanente. A integração solicita conteúdo sem cache HTTP persistente; favoritos guardam apenas a referência do lugar.
- **Wikipedia:** textos possuem condições de atribuição e compartilhamento descritas nos [Termos de Uso da Wikimedia](https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use). A apresentação identifica a Wikipedia, a licença e o artigo original; consulte a página específica e o histórico de autoria para redistribuição.
- **Wikidata:** dados estruturados são disponibilizados sob [CC0](https://www.wikidata.org/wiki/Wikidata:Licensing); os links dos itens permitem verificar sua origem.
- **Wikimedia Commons:** cada arquivo tem autor, licença e condições próprios. A galeria exibe os metadados disponíveis e oferece o link de origem. Licenças CC BY/CC BY-SA e domínio público têm requisitos diferentes; abrir uma imagem no site não transfere direitos irrestritos ao visitante. Consulte a [orientação oficial para reutilização](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia).

Antes de publicar uma instalação, o operador deve revisar esses documentos vigentes, conferir as atribuições exibidas e adaptar termos, privacidade e identificação do responsável à hospedagem e à jurisdição aplicáveis. As páginas incluídas explicam o comportamento técnico; não representam certificação de conformidade nem substituem a revisão dos contratos dos provedores.

As políticas oficiais de Places e Place Photos foram consultadas na implementação; os links permitem conferir as condições aplicáveis à sua instalação. O logotipo incluído em `public/attribution` é o SVG oficial do Google Maps, preservado sem alterações; a marca não está coberta pela licença MIT do código. A fonte Oswald conserva sua licença SIL Open Font License no pacote correspondente.

## Limitações conhecidas

- Uma localidade pode existir no mapa e não ter artigo, fotografia licenciada ou atração próxima. A apresentação mantém os dados encontrados e informa as lacunas.
- Coordenadas em oceano ou regiões remotas não se transformam automaticamente em uma cidade ou ponto turístico.
- A correspondência entre uma entidade geográfica e um artigo depende de nome, coordenadas e metadados disponíveis; as fontes ficam acessíveis para conferência.
- Alguns artigos têm somente texto em inglês. A ausência de conteúdo não é preenchida com fatos gerados por IA.
- Imagens podem expirar, falhar, ser removidas ou ter licenças/atribuições atualizadas no provedor. A aplicação trata a falha sem trocar por fotografias aleatórias.
- Favoritos e histórico são deste navegador, podem ser apagados pelo usuário e não sincronizam entre dispositivos. São guardados identificadores de lugares, idioma do artigo ou coordenadas selecionadas, nunca fotografias ou descrições Google. O histórico registra automaticamente as últimas 12 explorações concluídas; os favoritos dependem de ação do usuário.
- O serviço depende de acesso aos provedores, faturamento, quotas e credenciais válidas. O mapa Google e suas consultas pagas exigem validação com as chaves reais da instalação.

## Custos

Carregamento do mapa, Autocomplete, detalhes de lugares, busca de próximos lugares, fotos e geocodificação podem gerar cobrança conforme os SKUs e planos vigentes do Google. Sessões e campos solicitados influenciam o consumo. A Wikimedia não exige chave para este fluxo, mas possui regras de uso e limites próprios. Configure quotas, monitore consumo e dimensione também os custos de hospedagem e tráfego de imagens.
