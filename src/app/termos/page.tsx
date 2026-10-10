import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Termos de uso | World Explorer",
  description: "Uso do World Explorer, fontes de informação e atribuição das fotografias.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#101513] px-6 py-12 text-[#f6f2e9] sm:px-12">
      <article className="mx-auto max-w-3xl space-y-10 text-base leading-relaxed">
        <Link className="inline-flex text-sm text-[#d9ef9c] underline underline-offset-4" href="/">
          ← Voltar ao World Explorer
        </Link>
        <header className="space-y-4">
          <p className="text-xs tracking-[0.24em] text-[#d9ef9c] uppercase">World Explorer</p>
          <h1 className="text-4xl font-medium tracking-tight sm:text-6xl">Explore com contexto.</h1>
          <p className="text-lg text-[#c9d0c8]">
            Condições de uso, fontes das informações e direitos sobre os conteúdos apresentados.
          </p>
        </header>

        <section className="space-y-3" aria-labelledby="purpose">
          <h2 id="purpose" className="text-2xl font-medium">Finalidade e disponibilidade</h2>
          <p>
            O World Explorer permite descobrir localidades por meio de mapas, informações
            enciclopédicas e fotografias de serviços externos. A cobertura varia conforme o
            destino e as fontes disponíveis. Um lugar pode não ter fotografias, artigo ou
            atrações próximas; essas ausências não são preenchidas com dados inventados.
          </p>
          <p>
            As informações podem estar incompletas ou desatualizadas. Confira os links das fontes
            e os canais oficiais do destino antes de planejar uma visita. A aplicação não fornece
            orientação de navegação em tempo real, condições de segurança, disponibilidade de
            acesso ou garantia sobre serviços turísticos.
          </p>
          <p>
            Alguns recursos dependem de credenciais, faturamento e disponibilidade dos provedores.
            Falhas de rede, limites de uso ou remoção de conteúdo podem interromper consultas.
            Utilize o serviço de forma razoável, sem tentar contornar limites ou interferir no
            acesso de outras pessoas.
          </p>
        </section>

        <section className="space-y-3" aria-labelledby="google">
          <h2 id="google" className="text-2xl font-medium">Mapas, lugares e fotos Google</h2>
          <p>
            Quando disponíveis, os recursos Google Maps e Places estão sujeitos aos termos e
            políticas do Google. Preserve logotipos, identificação de origem e créditos dos
            autores. A exibição de uma foto não concede uma licença geral para copiá-la,
            redistribuí-la ou utilizá-la comercialmente.
          </p>
          <p>
            As referências salvas nos favoritos permitem consultar novamente um lugar; a
            aplicação não oferece uma biblioteca permanente de cópias do conteúdo Google.
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li><a className="text-[#d9ef9c] underline underline-offset-4" href="https://maps.google.com/help/terms_maps/">Termos adicionais do Google Maps e Google Earth</a></li>
            <li><a className="text-[#d9ef9c] underline underline-offset-4" href="https://developers.google.com/maps/documentation/places/web-service/policies">Políticas de uso e atribuição do Google Places</a></li>
            <li><a className="text-[#d9ef9c] underline underline-offset-4" href="https://developers.google.com/maps/documentation/places/web-service/place-photos">Informações sobre Google Place Photos</a></li>
          </ul>
        </section>

        <section className="space-y-3" aria-labelledby="wikimedia">
          <h2 id="wikimedia" className="text-2xl font-medium">Wikipedia, Wikidata e Wikimedia Commons</h2>
          <p>
            Os textos enciclopédicos são provenientes dos artigos indicados na apresentação.
            Sua reutilização exige observar as condições aplicáveis, incluindo atribuição e,
            quando exigido, compartilhamento pela mesma licença. Consulte o artigo original e
            seu histórico para conhecer a autoria. Dados estruturados do Wikidata são
            disponibilizados sob CC0.
          </p>
          <p>
            Cada imagem do Wikimedia Commons possui condições próprias. Os créditos da galeria
            identificam o autor, a licença informada e o arquivo de origem. Antes de reutilizar
            uma fotografia, abra sua página original e confira as exigências, inclusive atribuição,
            indicação de alterações, compartilhamento pela mesma licença e eventuais outros direitos.
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li><a className="text-[#d9ef9c] underline underline-offset-4" href="https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use">Termos de Uso da Wikimedia</a></li>
            <li><a className="text-[#d9ef9c] underline underline-offset-4" href="https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia">Como reutilizar conteúdo do Wikimedia Commons</a></li>
            <li><a className="text-[#d9ef9c] underline underline-offset-4" href="https://www.wikidata.org/wiki/Wikidata:Licensing">Licenciamento do Wikidata</a></li>
          </ul>
        </section>

        <section className="space-y-3" aria-labelledby="responsibility">
          <h2 id="responsibility" className="text-2xl font-medium">Código e responsabilidade pela instalação</h2>
          <p>
            O código do World Explorer é disponibilizado sob licença MIT. Essa licença não
            altera os direitos sobre mapas, textos e fotografias fornecidos por terceiros.
          </p>
          <p>
            O operador de cada instalação é responsável por configurar seus serviços e revisar
            os termos aplicáveis antes de disponibilizá-la ao público, incluindo exigências
            regionais dos provedores. Esta página descreve o uso pretendido do projeto e não
            certifica conformidade jurídica de uma instalação. Os direitos assegurados pela
            legislação aplicável permanecem preservados.
          </p>
        </section>

        <footer className="border-t border-white/15 pt-6 text-sm text-[#c9d0c8]">
          Saiba como seus dados são utilizados na <Link className="text-[#d9ef9c] underline underline-offset-4" href="/privacidade">política de privacidade</Link>.
        </footer>
      </article>
    </main>
  );
}
