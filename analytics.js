// Google Analytics 4 e os eventos de conversão, num lugar só para todas as
// páginas. As páginas carregam este arquivo com defer, e ele injeta o gtag.js
// do Google de forma assíncrona: nada aqui bloqueia a renderização.
// Só observa: não chama preventDefault nem muda o comportamento de nada.
// Abra qualquer página com ?debug_ga no fim da URL para ver os eventos no
// DebugView do GA4.
(function () {
  const ID = "G-154PZY9YF0";

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://www.googletagmanager.com/gtag/js?id=" + ID;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { dataLayer.push(arguments); };
  gtag("js", new Date());
  // Teste: ?debug_ga na URL ou qualquer endereço fora do site oficial (prévia
  // local, rede de casa). O filtro de tráfego de desenvolvedor do GA4 tira
  // essas visitas dos relatórios e das conversões.
  const teste = new URLSearchParams(location.search).has("debug_ga") || !/(^|\.)aadarpa\.ong\.br$/.test(location.hostname);
  gtag("config", ID, teste ? { debug_mode: true } : {});

  // Cliques de saída: beacon entrega o hit mesmo se a página for descarregada.
  const enviar = (nome, params) => gtag("event", nome, { ...params, transport_type: "beacon" });

  document.addEventListener("click", e => {
    const link = e.target.closest("a[href]");
    if (!link) return;
    // ig.me é o atalho do Instagram que abre uma conversa (botão da ficha do animal)
    const rede = /(^|\.)instagram\.com$|^ig\.me$/.test(link.hostname) ? "instagram"
      : /(^|\.)tiktok\.com$/.test(link.hostname) ? "tiktok" : null;
    if (!rede) return;
    // "Quero adotar" (topo da home e ficha do animal) leva ao Instagram; os demais
    // são links de rede social. Na ficha, também vai o nome do animal.
    if (link.classList.contains("cta")) enviar("clique_adotar", { destino: rede, origem: location.pathname, ...(link.dataset.animal && { animal: link.dataset.animal }) });
    else enviar("clique_social", { rede });
  }, { capture: true });

  document.addEventListener("aadarpa:copiou", e => {
    // chave ou código Pix Copia e Cola, na página de adoção ou em /doar
    const id = e.detail && e.detail.botao && e.detail.botao.id;
    if (id && id.startsWith("pix-copiar")) enviar("copiar_pix", { forma: id === "pix-copiar-codigo" ? "codigo" : "chave", origem: location.pathname });
  });
})();
