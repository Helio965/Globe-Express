import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Termos de uso | World Explorer',
  description: 'Fontes, atribuições, licenças e limites de utilização do World Explorer.',
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#090d12] px-6 py-12 text-[#e8edf2] sm:px-12">
      <article className="mx-auto max-w-3xl space-y-10">
        <Link href="/" className="inline-flex min-h-11 items-center text-sm text-[#e5c496] underline decoration-white/30 underline-offset-4 hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-4">
          ← Voltar à exploração
        </Link>
        <header className="space-y-4">
          <p className="text-xs uppercase tracking-[0.25em] text-[#e5c496]">World Explorer</p>
          <h1 className="text-4xl font-light tracking-tight sm:text-6xl">Termos de uso</h1>
          <p className="text-lg leading-relaxed text-[#b6c0cb]">
            O World Explorer reúne mapas, informações e fotografias de fontes externas para facilitar a descoberta de lugares. Cada fonte mantém seus próprios direitos e condições de utilização.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-2xl font-medium">Informação e disponibilidade</h2>
          <p className="leading-relaxed text-[#b6c0cb]">
            A cobertura depende dos serviços consultados. Nem todo ponto do planeta possui artigo, fotografias ou atrações próximas. A aplicação apresenta os dados encontrados e identifica conteúdo ausente; não oferece garantia de precisão, atualização ou disponibilidade contínua dos provedores.
          </p>
          <p className="leading-relaxed text-[#b6c0cb]">
            Confira as fontes antes de utilizar uma informação para planejar uma viagem. Mapas e descrições não substituem orientações locais, avisos oficiais, permissões de acesso ou avaliação das condições de segurança de um lugar.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-medium">Fotografias e créditos</h2>
          <p className="leading-relaxed text-[#b6c0cb]">
            Uma fotografia exibida não se torna propriedade da aplicação ou do visitante. Consulte seus créditos, a página de origem e a licença antes de copiar, adaptar ou republicar. Arquivos Wikimedia Commons podem ter licenças diferentes, incluindo Creative Commons e domínio público; requisitos de atribuição e de compartilhamento de adaptações devem ser respeitados quando aplicáveis.
          </p>
          <p className="leading-relaxed text-[#b6c0cb]">
            Fotografias Google estão sujeitas às condições da Google Maps Platform e às atribuições informadas pelo provedor. Preserve os créditos, as marcas e as atribuições mostradas junto a fotografias e mapas.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-medium">Fontes e suas condições</h2>
          <ul className="list-disc space-y-4 pl-5 leading-relaxed text-[#b6c0cb]">
            <li>
              <a className="underline underline-offset-4" href="https://cloud.google.com/maps-platform/terms" target="_blank" rel="noreferrer">Google Maps Platform</a>: mapas, pesquisa, fotografias e dados Google seguem seus termos, restrições de exibição e armazenamento. Veja também os <a className="underline underline-offset-4" href="https://maps.google.com/help/terms_maps/" target="_blank" rel="noreferrer">termos adicionais do Google Maps</a>.
            </li>
            <li>
              <a className="underline underline-offset-4" href="https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use" target="_blank" rel="noreferrer">Wikipedia e Wikimedia</a>: textos seguem a licença indicada na fonte, normalmente Creative Commons Atribuição-CompartilhaIgual. Fotografias têm licenças específicas em suas páginas de arquivo. Os links de origem permitem verificar o conteúdo e as condições aplicáveis.
            </li>
            <li>
              <a className="underline underline-offset-4" href="https://www.wikidata.org/wiki/Wikidata:Licensing" target="_blank" rel="noreferrer">Wikidata</a>: seus dados estruturados são disponibilizados sob CC0; a fonte é mantida para permitir verificação.
            </li>
            <li>
              <a className="underline underline-offset-4" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>: os dados cartográficos são licenciados sob ODbL e exigem atribuição. O uso dos tiles públicos também segue a <a className="underline underline-offset-4" href="https://operations.osmfoundation.org/policies/tiles/" target="_blank" rel="noreferrer">política do serviço de tiles</a>.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-medium">Utilização responsável</h2>
          <p className="leading-relaxed text-[#b6c0cb]">
            Não remova atribuições nem use a aplicação para contornar limites, extrair conteúdo em massa ou armazenar dados contrariando as políticas dos provedores. Favoritos e histórico guardam referências; os conteúdos de cada lugar são consultados novamente quando ele é aberto.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-medium">Licença do código</h2>
          <p className="leading-relaxed text-[#b6c0cb]">
            O código do projeto é distribuído sob licença MIT, conforme o arquivo LICENSE do repositório. A licença MIT do código não se aplica a fotografias, textos, mapas, marcas ou outros conteúdos fornecidos por terceiros.
          </p>
        </section>

        <footer className="border-t border-white/15 pt-6 text-sm text-[#b6c0cb]">
          Entenda o armazenamento local e as consultas externas na página de <Link href="/privacy" className="text-[#e5c496] underline underline-offset-4">privacidade</Link>.
        </footer>
      </article>
    </main>
  );
}
