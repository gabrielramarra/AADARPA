// Efeito "botão líquido" nos botões .cta (inspirado em recent.design/i/pd1kyjp):
// no hover o botão vira uma gota que se estica em direção ao cursor e ganha um
// degradê com brilho; ao sair, volta à pílula. Só em mouse/trackpad e sem
// "reduzir movimento": no toque e no modo reduzido os botões ficam como antes.
(function () {
  if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // filtro "gooey": desfoca e endurece o contorno, fundindo a gota com a pílula
  document.body.insertAdjacentHTML("beforeend",
    '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">' +
    '<filter id="cta-liquido" x="-60%" y="-150%" width="220%" height="400%" color-interpolation-filters="sRGB">' +
    '<feGaussianBlur in="SourceGraphic" stdDeviation="7" result="b"/>' +
    '<feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8" result="g"/>' +
    '<feComposite in="SourceGraphic" in2="g" operator="atop"/>' +
    "</filter></svg>");

  function liquefazer(botao) {
    const camada = document.createElement("span");
    camada.className = "liquido";
    camada.setAttribute("aria-hidden", "true");
    const base = document.createElement("span");
    base.className = "liquido-base";
    const gota = document.createElement("span");
    gota.className = "liquido-gota";
    gota.append(document.createElement("span"));
    camada.append(base, gota);
    botao.prepend(camada);
    botao.classList.add("cta-liquida");

    let alvo = { x: 0, y: 0 }, pos = { x: 0, y: 0 }, quadro = 0;
    const animar = () => {
      // a gota persegue o alvo com atraso, o que dá a sensação de líquido
      pos.x += (alvo.x - pos.x) * 0.2;
      pos.y += (alvo.y - pos.y) * 0.2;
      gota.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
      quadro = Math.abs(alvo.x - pos.x) + Math.abs(alvo.y - pos.y) > 0.3 ? requestAnimationFrame(animar) : 0;
    };
    const mirar = e => {
      const r = botao.getBoundingClientRect();
      const cx = r.width / 2, cy = r.height / 2;
      // empurra a gota para fora a partir do centro: ela "puxa" a borda na direção do cursor
      alvo = { x: cx + (e.clientX - r.left - cx) * 1.05, y: cy + (e.clientY - r.top - cy) * 1.45 };
      if (!quadro) quadro = requestAnimationFrame(animar);
    };
    botao.addEventListener("pointerenter", e => {
      const r = botao.getBoundingClientRect();
      pos = { x: e.clientX - r.left, y: e.clientY - r.top };
      mirar(e);
      botao.classList.add("liquido-ativo");
    });
    botao.addEventListener("pointermove", mirar);
    botao.addEventListener("pointerleave", () => botao.classList.remove("liquido-ativo"));
  }

  document.querySelectorAll(".cta").forEach(liquefazer);
})();
