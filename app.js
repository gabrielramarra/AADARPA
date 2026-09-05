const FOTO_BASE = "fotos/";

function urlFoto(foto) {
  if (!foto) return "";
  // link do Google Drive (qualquer formato de compartilhamento) -> URL de imagem direta
  const drive = foto.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([a-zA-Z0-9_-]+)/);
  if (drive) return `https://drive.google.com/thumbnail?id=${drive[1]}&sz=w1000`;
  return /^https?:\/\//i.test(foto) ? foto : FOTO_BASE + foto;
}

// enquadramento: pra onde o zoom aponta dentro do card. Editável por animal na
// planilha (coluna "enquadramento"), combinando topo/centro/baixo +
// esquerda/centro/direita (ex.: "topo-esquerda"), ou coordenadas diretas
// ("35% 60%"). Em branco, aponta pro centro. O jeito prático de descobrir esses
// valores é o modo ajuste: abra o site com ?ajustar no fim da URL.
const ENQUADRAMENTOS = {
  "topo-esquerda": [20, 15], "topo": [50, 15], "topo-direita": [80, 15],
  "esquerda": [20, 50], "centro": [50, 50], "direita": [80, 50],
  "baixo-esquerda": [20, 80], "baixo": [50, 80], "baixo-direita": [80, 80],
};

function focoFoto(a) {
  const v = (a.enquadramento || "").trim().toLowerCase();
  if (ENQUADRAMENTOS[v]) return ENQUADRAMENTOS[v];
  const custom = v.match(/^(\d{1,3})%?\s+(\d{1,3})%?$/);
  if (custom) return [Number(custom[1]), Number(custom[2])];
  return [50, 50];
}

// Ajustes feitos ao vivo no modo ajuste, por nome do animal: { foco: [x, y], zoom }.
// Ficam só na memória da aba; viram permanentes quando os valores vão pra planilha.
const AJUSTES = new Map();

function cardHTML(a) {
  const adotado = a.status === "Adotado";
  const ajuste = AJUSTES.get(a.nome);
  const [x, y] = ajuste ? ajuste.foco : focoFoto(a);
  // zoom: quanto aproximar (1 = sem zoom). Coluna "zoom" na planilha, ex.: 1.5
  // O recorte tem duas partes que não se misturam: o object-position (fixo no CSS,
  // "center 25%") escolhe a fatia 4:5 da foto original, e o zoom amplia essa fatia
  // a partir do ponto de foco. Antes os dois saíam do mesmo valor da planilha e
  // brigavam, porque object-position trabalha em coordenadas da foto original e
  // transform-origin nas do card já recortado. Agora só o zoom usa o
  // enquadramento, então não tem como mirar no lugar errado.
  const zoom = ajuste ? ajuste.zoom : Math.max(1, parseFloat(a.zoom) || 1);
  const estilo = `transform:scale(${zoom}); transform-origin:${x}% ${y}%;`;
  return `
    <div class="card" data-nome="${a.nome}" data-id="${a.id ?? ""}">
      <div class="card-photo">
        <span class="badge ${adotado ? "adotado" : "disponivel"}">${adotado ? "Adotado(a)" : "Disponível"}</span>
        <img src="${urlFoto(a.foto)}" alt="Foto de ${a.nome}" loading="lazy" draggable="false" style="${estilo}">
        <div class="ajuste-info">
          <span class="ajuste-valores">${textoAjuste(x, y, zoom)}</span>
          <button type="button" class="ajuste-travar">Travar</button>
        </div>
      </div>
      <div class="card-body">
        <h3>${a.nome}</h3>
        ${adotado ? "" : `
        <div class="card-meta">
          <span>${a.sexo || ""}</span>
          <span>${a.porte || ""}</span>
          <span>${a.idade || ""}</span>
        </div>`}
      </div>
    </div>`;
}

function embaralhar(lista) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

function aplicarFiltros(animais, estado) {
  const termo = estado.busca.trim().toLowerCase();
  return animais.filter(a => {
    if (a.status !== "Disponível") return false;
    if (estado.sexo && a.sexo !== estado.sexo) return false;
    if (estado.porte && a.porte !== estado.porte) return false;
    if (termo && !a.nome.toLowerCase().includes(termo)) return false;
    return true;
  });
}

function montarFiltroBotoes(id, atributo, estado, render) {
  const grupo = document.getElementById(id);
  grupo.addEventListener("click", e => {
    const btn = e.target.closest("button");
    if (!btn) return;
    estado[atributo] = btn.dataset[atributo];
    [...grupo.children].forEach(b => b.classList.toggle("active", b === btn));
    render();
  });
}

async function copiarTexto(texto, botao) {
  try {
    await navigator.clipboard.writeText(texto);
  } catch {
    // navegador sem permissão de área de transferência (ou página sem https)
    const campo = document.createElement("textarea");
    campo.value = texto;
    document.body.appendChild(campo);
    campo.select();
    document.execCommand("copy");
    campo.remove();
  }
  if (!botao) return;
  const original = botao.textContent;
  botao.textContent = "Copiado!";
  setTimeout(() => { botao.textContent = original; }, 1500);
}

/* ---------- modo ajuste (?ajustar) ----------
Reposicionar o recorte arrastando a foto no próprio card, como a galeria do
Notion, e travar a posição com um clique — grava direto na tabela do Baserow,
sem copiar/colar em planilha nenhuma. Fica invisível pra quem só visita o
site: só liga com ?ajustar na URL. Quem usa precisa colar o token de escrita
do Baserow uma vez por aba (nunca fica salvo no código do site, só na memória
do navegador enquanto a aba estiver aberta). */
const MODO_AJUSTE = new URLSearchParams(location.search).has("ajustar");
const BASEROW_TABLE_ID = "1178421";

function tokenBaserow() {
  let token = sessionStorage.getItem("baserow_token");
  if (!token) {
    token = prompt("Token de escrita do Baserow (fica só nesta aba, nunca é salvo no site):");
    if (token) sessionStorage.setItem("baserow_token", token);
  }
  return token;
}

async function travarNoBaserow(id, enquadramento, zoom) {
  const token = tokenBaserow();
  if (!token) return { ok: false, motivo: "sem token" };
  const resp = await fetch(
    `https://api.baserow.io/api/database/rows/table/${BASEROW_TABLE_ID}/${id}/?user_field_names=true`,
    {
      method: "PATCH",
      headers: { "Authorization": `Token ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ Enquadramento: enquadramento, Zoom: zoom }),
    }
  );
  if (resp.status === 401 || resp.status === 403) sessionStorage.removeItem("baserow_token");
  if (!resp.ok) return { ok: false, motivo: `Baserow respondeu ${resp.status}` };
  return { ok: true };
}

// Depois de travar no Baserow, aciona na hora a mesma automação que já lê o
// Baserow e publica o site (em vez de esperar os até 15min do agendamento).
function tokenGithub() {
  let token = sessionStorage.getItem("github_token");
  if (!token) {
    token = prompt("Token do GitHub pra publicar agora (fica só nesta aba; Enter pra pular e deixar a publicação automática cuidar disso em até 15min):");
    if (token) sessionStorage.setItem("github_token", token);
  }
  return token;
}

async function publicarAgora() {
  const token = tokenGithub();
  if (!token) return { ok: false, motivo: "sem token" };
  const resp = await fetch(
    "https://api.github.com/repos/gabrielramarra/AADARPA/actions/workflows/sincronizar-baserow.yml/dispatches",
    {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Accept": "application/vnd.github+json" },
      body: JSON.stringify({ ref: "main" }),
    }
  );
  if (resp.status === 401 || resp.status === 403) sessionStorage.removeItem("github_token");
  if (!resp.ok) return { ok: false, motivo: `GitHub respondeu ${resp.status}` };
  return { ok: true };
}

function valoresPlanilha(x, y, zoom) {
  return [`${Math.round(x)}% ${Math.round(y)}%`, zoom.toFixed(2)];
}

function textoAjuste(x, y, zoom) {
  // sem zoom a foto 4:5 preenche o card inteiro: não sobra imagem pra deslocar
  if (zoom <= 1.01) return "aproxime para reposicionar";
  const [enq, z] = valoresPlanilha(x, y, zoom);
  return `${enq} · zoom ${z}`;
}

function ajusteDoCard(card) {
  const nome = card.dataset.nome;
  if (!AJUSTES.has(nome)) {
    const img = card.querySelector("img");
    const origem = img.style.transformOrigin.match(/([\d.]+)%\s+([\d.]+)%/);
    const escala = img.style.transform.match(/scale\(([\d.]+)\)/);
    AJUSTES.set(nome, {
      foco: origem ? [Number(origem[1]), Number(origem[2])] : [50, 50],
      zoom: escala ? Number(escala[1]) : 1,
    });
  }
  return AJUSTES.get(nome);
}

function desenharAjuste(card, ajuste) {
  const img = card.querySelector("img");
  img.style.transform = `scale(${ajuste.zoom})`;
  img.style.transformOrigin = `${ajuste.foco[0]}% ${ajuste.foco[1]}%`;
  card.querySelector(".ajuste-valores").textContent =
    textoAjuste(ajuste.foco[0], ajuste.foco[1], ajuste.zoom);
}

function iniciarModoAjuste() {
  document.body.classList.add("modo-ajuste");

  const barra = document.createElement("div");
  barra.className = "barra-ajuste";
  barra.innerHTML = `
    <span>Modo ajuste: arraste a foto para reposicionar, role para aproximar,
    clique em <strong>Travar</strong> pra gravar no banco de dados e publicar
    no site na hora.</span>`;
  document.body.prepend(barra);

  const area = document.querySelector("main");
  // No touque, dois dedos no mesmo card viram pinça de zoom em vez de
  // arrasto: por isso os ponteiros ativos ficam num Map (não só o último),
  // pra saber quando são dois e medir a distância entre eles.
  const ponteiros = new Map(); // pointerId -> {x, y}
  let cardAtivo = null, ultimoX = 0, ultimoY = 0, distanciaAnterior = null;

  const distanciaEntrePonteiros = () => {
    const [a, b] = [...ponteiros.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  area.addEventListener("pointerdown", e => {
    if (e.target.closest(".ajuste-info")) return;
    const foto = e.target.closest(".card-photo");
    if (!foto) return;
    const card = foto.closest(".card");
    if (cardAtivo && cardAtivo !== card) return;
    cardAtivo = card;
    ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    foto.classList.add("arrastando");
    try { foto.setPointerCapture(e.pointerId); } catch { /* segundo dedo às vezes chega tarde demais, sem problema */ }
    if (ponteiros.size === 1) {
      ultimoX = e.clientX;
      ultimoY = e.clientY;
    } else if (ponteiros.size === 2) {
      distanciaAnterior = distanciaEntrePonteiros();
    }
  });

  area.addEventListener("pointermove", e => {
    if (!cardAtivo || !ponteiros.has(e.pointerId)) return;
    ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const ajuste = ajusteDoCard(cardAtivo);

    if (ponteiros.size >= 2) {
      const distancia = distanciaEntrePonteiros();
      if (distanciaAnterior) {
        ajuste.zoom = Math.min(4, Math.max(1, ajuste.zoom * (distancia / distanciaAnterior)));
        desenharAjuste(cardAtivo, ajuste);
      }
      distanciaAnterior = distancia;
      return;
    }

    if (ajuste.zoom <= 1.01) return;   // nada pra deslocar ainda
    // Sensibilidade fixa (não depende do zoom): arrastar a largura/altura toda
    // da caixa sempre varre 0-100%. Antes dividia por largura*(zoom-1) pra
    // acompanhar o cursor 1 pra 1 de verdade, mas isso deixava o arraste
    // absurdamente sensível com pouco zoom (o normal pra maioria dos ajustes):
    // qualquer tremedeira de mouse já estourava pro extremo.
    const caixa = cardAtivo.querySelector(".card-photo").getBoundingClientRect();
    const dx = 100 * (e.clientX - ultimoX) / caixa.width;
    const dy = 100 * (e.clientY - ultimoY) / caixa.height;
    ajuste.foco = [
      Math.min(100, Math.max(0, ajuste.foco[0] - dx)),
      Math.min(100, Math.max(0, ajuste.foco[1] - dy)),
    ];
    ultimoX = e.clientX;
    ultimoY = e.clientY;
    desenharAjuste(cardAtivo, ajuste);
  });

  ["pointerup", "pointercancel"].forEach(ev => area.addEventListener(ev, e => {
    ponteiros.delete(e.pointerId);
    if (ponteiros.size === 0) {
      if (cardAtivo) cardAtivo.querySelector(".card-photo").classList.remove("arrastando");
      cardAtivo = null;
      distanciaAnterior = null;
    } else if (ponteiros.size === 1) {
      // sobrou um dedo: reinicia a base do arraste pra não pular de lugar
      const [p] = [...ponteiros.values()];
      ultimoX = p.x;
      ultimoY = p.y;
      distanciaAnterior = null;
    }
  }));

  area.addEventListener("wheel", e => {
    const card = e.target.closest(".card");
    if (!card) return;
    e.preventDefault();
    const ajuste = ajusteDoCard(card);
    const novo = ajuste.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08);
    ajuste.zoom = Math.min(4, Math.max(1, novo));
    desenharAjuste(card, ajuste);
  }, { passive: false });

  area.addEventListener("click", async e => {
    const botao = e.target.closest(".ajuste-travar");
    if (!botao) return;
    const card = botao.closest(".card");
    const id = card.dataset.id;
    if (!id) { alert("Esse animal não tem id do Baserow (dado de exemplo?), não dá pra travar."); return; }

    const ajuste = ajusteDoCard(card);
    const [enquadramento, zoomTexto] = valoresPlanilha(ajuste.foco[0], ajuste.foco[1], ajuste.zoom);
    const original = botao.textContent;
    botao.disabled = true;
    botao.textContent = "Travando...";
    const resultado = await travarNoBaserow(id, enquadramento, Number(zoomTexto));
    if (!resultado.ok) {
      botao.textContent = original;
      botao.disabled = false;
      if (resultado.motivo !== "sem token") alert(`Não consegui travar: ${resultado.motivo}`);
      return;
    }

    botao.textContent = "Publicando...";
    const publicou = await publicarAgora();
    botao.textContent = publicou.ok ? "Travado, publicando!" : "Travado!";
    if (!publicou.ok && publicou.motivo !== "sem token") {
      console.warn(`Travou no banco, mas não consegui publicar agora: ${publicou.motivo}. A publicação automática ainda cuida disso em até 15min.`);
    }
    botao.disabled = false;
    setTimeout(() => { botao.textContent = original; }, 2500);
  });
}

// dados-animais.json é gerado a partir do Baserow (scripts/gerar-dados.mjs),
// não editado à mão. dados-exemplo.json é só uma reserva estática, pro caso
// raro do arquivo gerado não existir.
async function carregarAnimais() {
  const resp = await fetch("dados-animais.json", { cache: "no-store" });
  if (resp.ok) return resp.json();
  const reserva = await fetch("dados-exemplo.json");
  return reserva.json();
}

// Payload PIX padrão (BR Code / EMV), pra gerar um QR estático que funciona em
// qualquer banco. Referência: manual do BR Code do Banco Central.
function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function tlv(id, valor) {
  return `${id}${String(valor.length).padStart(2, "0")}${valor}`;
}

function montarPayloadPix(chave, nome, cidade) {
  const contaPix = tlv("00", "BR.GOV.BCB.PIX") + tlv("01", chave);
  let payload =
    tlv("00", "01") +
    tlv("01", "11") +
    tlv("26", contaPix) +
    tlv("52", "0000") +
    tlv("53", "986") +
    tlv("58", "BR") +
    tlv("59", nome.slice(0, 25)) +
    tlv("60", cidade.slice(0, 15)) +
    tlv("62", tlv("05", "***")) +
    "6304";
  return payload + crc16(payload);
}

(function configurarPix() {
  const chave = "aadarpagoiania@gmail.com";
  const payload = montarPayloadPix(chave, "AADARPA", "GOIANIA");
  document.getElementById("pix-qr").src =
    `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(payload)}`;

  const botao = document.getElementById("pix-copiar");
  botao.addEventListener("click", () => {
    copiarTexto(document.getElementById("pix-chave").value, botao);
  });
})();

(async function init() {
  let animais;
  try {
    animais = await carregarAnimais();
  } catch (e) {
    document.getElementById("grid").innerHTML = `<p class="vazio">Não foi possível carregar os animais agora.</p>`;
    console.error(e);
    return;
  }
  animais.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const adotados = animais.filter(a => a.status === "Adotado");
  document.getElementById("finais-felizes").hidden = adotados.length === 0;
  // Aleatório de propósito: dá chance de adoções antigas reaparecerem, em vez
  // de fixar sempre os mesmos (e a lista só cresce, nunca ficaria só numa tela).
  document.getElementById("grid-adotados").innerHTML = embaralhar(adotados).slice(0, 10).map(cardHTML).join("");

  const estado = { sexo: "", porte: "", busca: "" };
  const grid = document.getElementById("grid");
  const vazio = document.getElementById("vazio");
  const contador = document.getElementById("contador");

  function render() {
    const filtrados = aplicarFiltros(animais, estado);
    grid.innerHTML = filtrados.map(cardHTML).join("");
    vazio.hidden = filtrados.length > 0;
    const total = animais.filter(a => a.status === "Disponível").length;
    contador.textContent = `Mostrando ${filtrados.length} de ${total} pets`;
  }

  document.getElementById("busca").addEventListener("input", e => {
    estado.busca = e.target.value;
    render();
  });
  montarFiltroBotoes("filtro-sexo", "sexo", estado, render);
  montarFiltroBotoes("filtro-porte", "porte", estado, render);

  render();
  if (MODO_AJUSTE) iniciarModoAjuste();
})();
