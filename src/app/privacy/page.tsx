import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacidade | World Explorer',
  description: 'Como o World Explorer utiliza armazenamento local e serviços externos durante a exploração.',
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#090d12] px-6 py-12 text-[#e8edf2] sm:px-12">
      <article className="mx-auto max-w-3xl space-y-10">
        <Link href="/" className="inline-flex min-h-11 items-center text-sm text-[#e5c496] underline decoration-white/30 underline-offset-4 hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-4">
          ← Voltar à exploração
        </Link>
        <header className="space-y-4">
          <p className="text-xs uppercase tracking-[0.25em] text-[#e5c496]">World Explorer</p>
          <h1 className="text-4xl font-light tracking-tight sm:text-6xl">Privacidade</h1>
          <p className="text-lg leading-relaxed text-[#b6c0cb]">
            Explorar um lugar envolve consultas a serviços externos. Esta página explica quais dados participam desse fluxo e quais informações ficam no seu navegador.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-2xl font-medium">Favoritos e histórico neste dispositivo</h2>
          <p className="leading-relaxed text-[#b6c0cb]">
            A aplicação usa o armazenamento local do navegador (localStorage) para guardar referências dos lugares favoritos e recentes: identificadores do provedor ou coordenadas escolhidas. Não salva permanentemente fotografias, descrições ou respostas Google nessa coleção. Ao reabrir um lugar, sua referência é enviada para uma nova consulta às fontes disponíveis.
          </p>
          <p className="leading-relaxed text-[#b6c0cb]">
            Essas referências ficam associadas a este navegador. Você pode remover favoritos na interface ou apagar os dados do site nas configurações do navegador. Limpar esses dados, usar outro navegador ou navegar em modo privado pode impedir sua recuperação.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-medium">Consultas a mapas e fontes</h2>
          <p className="leading-relaxed text-[#b6c0cb]">
            O texto digitado na pesquisa, o lugar selecionado e suas coordenadas são utilizados para buscar resultados, informações e fotografias. Conforme o modo ativo, essas consultas envolvem Google Maps Platform, Wikipedia, Wikidata e Wikimedia Commons. O mapa aberto utiliza tiles OpenStreetMap.
          </p>
          <p className="leading-relaxed text-[#b6c0cb]">
            Mapas, fotografias e outros recursos podem ser carregados diretamente pelo navegador. Nesses casos, o serviço externo recebe dados técnicos da conexão, como endereço IP e informações do navegador. As consultas feitas pelo servidor também passam pela infraestrutura de hospedagem, que pode manter registros técnicos conforme sua própria configuração. A aplicação não solicita localização GPS automaticamente; coordenadas podem vir do ponto que você escolhe no mapa.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-medium">Contas, cookies e análise de navegação</h2>
          <p className="leading-relaxed text-[#b6c0cb]">
            Esta versão não possui cadastro de usuários nem inclui ferramentas próprias de publicidade ou análise de navegação. A persistência de favoritos utiliza localStorage. Serviços externos podem aplicar suas próprias políticas de privacidade e mecanismos de armazenamento; consulte os links abaixo para entender o tratamento realizado por cada provedor.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-medium">Políticas dos provedores</h2>
          <ul className="list-disc space-y-3 pl-5 text-[#b6c0cb]">
            <li><a className="underline underline-offset-4" href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Política de privacidade do Google</a></li>
            <li><a className="underline underline-offset-4" href="https://foundation.wikimedia.org/wiki/Policy:Privacy_policy" target="_blank" rel="noreferrer">Política de privacidade da Wikimedia</a></li>
            <li><a className="underline underline-offset-4" href="https://osmfoundation.org/wiki/Privacy_Policy" target="_blank" rel="noreferrer">Política de privacidade da OpenStreetMap Foundation</a></li>
          </ul>
        </section>

        <footer className="border-t border-white/15 pt-6 text-sm text-[#b6c0cb]">
          Veja também os <Link href="/terms" className="text-[#e5c496] underline underline-offset-4">termos de uso e atribuições</Link>.
        </footer>
      </article>
    </main>
  );
}
