import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacidade | World Explorer",
  description: "Como o World Explorer usa pesquisas, favoritos e serviços externos.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#101513] px-6 py-12 text-[#f6f2e9] sm:px-12">
      <article className="mx-auto max-w-3xl space-y-10 text-base leading-relaxed">
        <Link className="inline-flex text-sm text-[#d9ef9c] underline underline-offset-4" href="/">
          ← Voltar ao World Explorer
        </Link>
        <header className="space-y-4">
          <p className="text-xs tracking-[0.24em] text-[#d9ef9c] uppercase">World Explorer</p>
          <h1 className="text-4xl font-medium tracking-tight sm:text-6xl">Sua exploração, seus dados.</h1>
          <p className="text-lg text-[#c9d0c8]">
            Esta página explica os dados usados por esta aplicação e os serviços externos que ajudam
            a encontrar lugares, mapas e fotografias.
          </p>
        </header>

        <section className="space-y-3" aria-labelledby="local-data">
          <h2 id="local-data" className="text-2xl font-medium">O que fica no seu navegador</h2>
          <p>
            Não há cadastro ou conta de usuário. Ao favoritar um lugar, sua referência é guardada
            no armazenamento local deste navegador. O histórico registra automaticamente as últimas
            12 explorações concluídas para permitir que você retorne a elas.
          </p>
          <p>
            São armazenados identificadores de lugares, o idioma do artigo quando necessário e
            coordenadas de pontos escolhidos no mapa. Não são guardadas cópias de fotografias,
            descrições ou dados completos do Google. Ao reabrir um destino, as informações são
            consultadas novamente. Esses registros não são sincronizados com outros dispositivos.
          </p>
          <p>
            Você pode remover favoritos e limpar o histórico nos respectivos controles da aplicação.
            Limpar os dados deste site nas configurações do navegador também remove os registros.
            Pessoas com acesso ao mesmo perfil de navegador podem visualizar os lugares salvos.
          </p>
        </section>

        <section className="space-y-3" aria-labelledby="requests">
          <h2 id="requests" className="text-2xl font-medium">Pesquisas e serviços externos</h2>
          <p>
            Os termos que você pesquisa, as referências dos destinos e as coordenadas selecionadas
            são enviados ao servidor para consultar as fontes disponíveis. Com os serviços Google
            configurados, a aplicação consulta Google Maps, Places e Geocoding. Wikipedia, Wikidata
            e Wikimedia Commons fornecem artigos, informações e fotografias quando encontrados.
          </p>
          <p>
            O navegador também faz conexões diretas com o Google para carregar mapas e fotografias.
            As fotografias da Wikimedia são obtidas e dimensionadas pelo servidor da aplicação.
            Ao abrir links de fontes, você acessa os sites dos respectivos provedores. Eles podem receber seu endereço
            IP, dados técnicos da conexão e informações necessárias ao recurso solicitado, sujeitos
            às suas políticas. Quando a consulta passa pelo servidor, o provedor recebe os dados
            consultados e o endereço de saída do servidor.
          </p>
          <p>
            A aplicação não solicita sua localização atual pelo GPS. Coordenadas de um ponto que
            você escolheu representam esse ponto, não uma afirmação sobre onde você está.
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li><a className="text-[#d9ef9c] underline underline-offset-4" href="https://policies.google.com/privacy">Política de Privacidade do Google</a></li>
            <li><a className="text-[#d9ef9c] underline underline-offset-4" href="https://foundation.wikimedia.org/wiki/Policy:Privacy_policy">Política de Privacidade da Wikimedia</a></li>
          </ul>
        </section>

        <section className="space-y-3" aria-labelledby="technical-data">
          <h2 id="technical-data" className="text-2xl font-medium">Dados técnicos e medição</h2>
          <p>
            O código da aplicação não inclui ferramentas de publicidade ou analytics. O servidor
            utiliza temporariamente informações da requisição, incluindo o IP informado pela
            infraestrutura, para limitar chamadas excessivas. A hospedagem e os provedores de rede
            podem manter logs técnicos conforme suas próprias configurações e políticas.
          </p>
          <p>
            Não envie informações pessoais sensíveis na pesquisa. O World Explorer foi desenvolvido
            para consultar localidades e não oferece um canal privado de mensagens.
          </p>
        </section>

        <section className="space-y-3" aria-labelledby="installation">
          <h2 id="installation" className="text-2xl font-medium">Sobre esta instalação</h2>
          <p>
            Estas informações descrevem o funcionamento da versão aberta do World Explorer. O
            responsável por uma instalação pública deve identificar seus canais de contato,
            informar suas práticas de hospedagem e adequar esta política antes da publicação.
            Para questões sobre uma instalação específica, utilize os canais disponibilizados
            pelo responsável pelo site em que você está navegando.
          </p>
        </section>

        <footer className="border-t border-white/15 pt-6 text-sm text-[#c9d0c8]">
          Leia também os <Link className="text-[#d9ef9c] underline underline-offset-4" href="/termos">termos de uso e atribuição</Link>.
        </footer>
      </article>
    </main>
  );
}
