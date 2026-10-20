// Campanha temporária da rifa da clínica (até 30/10/2026): faixa no topo das páginas
// e os destaques marcados com data-rifa. Depois do prazo tudo some sozinho; quando a
// campanha acabar, dá para apagar este arquivo, o bloco "Rifa" do style.css e os data-rifa.
(function () {
  const LINK = "https://apprf.com/rifadosrefugados";
  const FIM = new Date("2026-10-30T23:59:59-03:00");

  const restante = FIM - Date.now();
  if (restante < 0) { document.querySelectorAll("[data-rifa]").forEach(e => e.remove()); return; }

  const dias = Math.ceil(restante / 864e5);
  const prazo = dias > 1 ? `Faltam ${dias} dias` : "Último dia!";
  document.querySelectorAll("[data-rifa-prazo]").forEach(e => (e.textContent = prazo));
  document.querySelectorAll("a[data-rifa]").forEach(a => (a.href = LINK));

  // a página /doar já tem o destaque no próprio card; a faixa fica para as demais
  if (document.body.classList.contains("pagina-doar")) return;
  try { if (localStorage.getItem("rifa-faixa-fechada") === "1") return; } catch (e) { /* sem armazenamento: mostra */ }

  const faixa = document.createElement("div");
  faixa.className = "rifa-faixa";
  faixa.setAttribute("role", "region");
  faixa.setAttribute("aria-label", "Campanha da rifa");
  faixa.innerHTML =
    '<p><span class="rifa-faixa-bilhete" aria-hidden="true">🎟️</span> <strong>Rifa da clínica:</strong> até 30/10 sua ajuda vale o dobro. <span class="rifa-faixa-prazo"></span></p>' +
    '<a class="rifa-faixa-botao" target="_blank" rel="noopener" data-evento="clique_rifa">Comprar rifa</a>' +
    '<button type="button" class="rifa-faixa-fechar" aria-label="Fechar aviso da rifa">✕</button>';
  faixa.querySelector(".rifa-faixa-prazo").textContent = prazo + ".";
  faixa.querySelector("a").href = LINK;
  faixa.querySelector("button").addEventListener("click", () => {
    faixa.remove();
    try { localStorage.setItem("rifa-faixa-fechada", "1"); } catch (e) { /* ok */ }
  });
  document.body.prepend(faixa);
})();
