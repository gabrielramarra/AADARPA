async function copiarTexto(texto, botao) {
  let copiou = false;
  try {
    await navigator.clipboard.writeText(texto);
    copiou = true;
  } catch {
    // navegador sem permissão de área de transferência (ou página sem https)
    const campo = document.createElement("textarea");
    campo.value = texto;
    document.body.appendChild(campo);
    campo.select();
    copiou = document.execCommand("copy");
    campo.remove();
  }
  // analytics.js escuta isto pra contar copiar_pix só quando a cópia deu certo
  if (copiou) document.dispatchEvent(new CustomEvent("aadarpa:copiou", { detail: { botao } }));
  if (!botao) return;
  const original = botao.textContent;
  botao.textContent = "Copiado!";
  setTimeout(() => { botao.textContent = original; }, 1500);
}

// Barra "Compartilhar:" usada pelas páginas do site (ficha do animal, bloco de
// doação e a janela "Compartilhar o abrigo", aberta por [data-abrir-compartilhar]):
// copiar link, X, WhatsApp e Facebook. Nenhum site posta direto no Status do
// WhatsApp: no celular abrimos o app (whatsapp://) na tela "Enviar para...",
// onde "Meu status" aparece no topo; no computador, o WhatsApp Web (wa.me).
// A escolha é pelo tipo de tela, não pela existência de navigator.share
// (Chrome/Edge no Windows também têm, mas abre a janela do Windows).
// O Instagram ficou de fora: o iPhone não o oferece para imagens de sites e
// não há link que poste nos Stories.
const CELULAR = matchMedia("(pointer: coarse)").matches;

const BOTOES_COMPARTILHAR = [
  ["copiar", "icone-link", "Copiar link"],
  ["x", "icone-x", "X"],
  ["whatsapp", "icone-whatsapp", "WhatsApp"],
  ["facebook", "icone-facebook", "Facebook"],
];

function montarBarrasCompartilhar() {
  document.querySelectorAll(".compartilhar").forEach(barra => {
    const botoes = BOTOES_COMPARTILHAR
      .map(([acao, icone, nome]) =>
        `<button type="button" class="compartilhar-${acao}" data-acao="${acao}"><svg aria-hidden="true"><use href="#${icone}"/></svg><span>${nome}</span></button>`)
      .join("");
    barra.innerHTML = (barra.hasAttribute("data-sem-rotulo") ? "" : `<span class="compartilhar-rotulo">${barra.dataset.rotulo || "Compartilhar:"}</span>`) +
      `<div class="compartilhar-botoes">${botoes}</div>`;
  });
}

// O que compartilhar, conforme onde está a barra: o animal da ficha (a página de
// adoção define window.alvoDaFicha) ou o site. data-local nomeia o lugar no Analytics.
function alvoDaBarra(barra) {
  const ficha = barra.dataset.alvo === "ficha" && window.alvoDaFicha && window.alvoDaFicha();
  return ficha || {
    url: "https://aadarpa.ong.br/",
    texto: "Cães e gatos do abrigo AADARPA estão esperando uma família em Goiânia 🐾 Adote ou ajude:",
    local: barra.dataset.local || (barra.closest("dialog") ? "topo" : "apoio"),
  };
}

// registra antes de sair da página (beacon garante a entrega)
function registrarCompartilhar(alvo, metodo) {
  if (window.gtag) gtag("event", "compartilhar", { local: alvo.local, ...(alvo.animal && { animal: alvo.animal }), metodo, transport_type: "beacon" });
}

function compartilharVia(acao, alvo, botao) {
  const registrar = metodo => registrarCompartilhar(alvo, metodo);
  const mensagem = encodeURIComponent(alvo.texto + " " + alvo.url);
  if (acao === "copiar") {
    copiarTexto(alvo.url, botao.querySelector("span"));
    registrar("copiar_link");
  } else if (acao === "whatsapp") {
    registrar(CELULAR ? "app_whatsapp" : "whatsapp_web");
    if (CELULAR) location.href = "whatsapp://send?text=" + mensagem;
    else window.open("https://wa.me/?text=" + mensagem, "_blank", "noopener");
  } else if (acao === "facebook") {
    registrar("facebook");
    window.open("https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(alvo.url), "_blank", "noopener");
  } else if (acao === "x") {
    registrar("x");
    window.open("https://x.com/intent/post?text=" + encodeURIComponent(alvo.texto) + "&url=" + encodeURIComponent(alvo.url), "_blank", "noopener");
  }
}

(function configurarCompartilhar() {
  montarBarrasCompartilhar();
  document.addEventListener("click", e => {
    const botao = e.target.closest(".compartilhar [data-acao]");
    if (botao) compartilharVia(botao.dataset.acao, alvoDaBarra(botao.closest(".compartilhar")), botao);
  });
  const caixa = document.getElementById("caixa-compartilhar");
  if (!caixa) return;
  document.querySelectorAll("[data-abrir-compartilhar]").forEach(b => b.addEventListener("click", () => caixa.showModal()));
  caixa.querySelector(".ficha-fechar").addEventListener("click", () => caixa.close());
  caixa.addEventListener("click", e => { if (e.target === caixa) caixa.close(); });
})();
