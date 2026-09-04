// Cole aqui a URL de "Publicar na Web" (formato CSV) da aba "Público" da Planilha Google.
// Deixe vazio para usar os dados de exemplo em dados-exemplo.json.
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQeWqJccN8iuZEpI5RJBXV6k0gtww5Sg-4tCBOMYAuVQDMXkl_52fAlSFtxz5NqFE5e5GU4XWlBBr_v/pub?gid=1604179694&single=true&output=csv";

const FOTO_BASE = "fotos/";

function parseCSV(texto) {
  const linhas = [];
  let campo = "", linha = [], dentroAspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i], prox = texto[i + 1];
    if (dentroAspas) {
      if (c === '"' && prox === '"') { campo += '"'; i++; }
      else if (c === '"') { dentroAspas = false; }
      else { campo += c; }
    } else {
      if (c === '"') dentroAspas = true;
      else if (c === ',') { linha.push(campo); campo = ""; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && prox === '\n') i++;
        linha.push(campo); campo = "";
        if (linha.length > 1 || linha[0] !== "") linhas.push(linha);
        linha = [];
      } else { campo += c; }
    }
  }
  if (campo !== "" || linha.length) { linha.push(campo); linhas.push(linha); }

  const cabecalho = linhas[0].map(h => h.trim().toLowerCase());
  return linhas.slice(1).map(cols => {
    const obj = {};
    cabecalho.forEach((h, idx) => obj[h] = (cols[idx] || "").trim());
    return obj;
  });
}

function urlFoto(foto) {
  if (!foto) return "";
  // link do Google Drive (qualquer formato de compartilhamento) -> URL de imagem direta
  const drive = foto.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([a-zA-Z0-9_-]+)/);
  if (drive) return `https://drive.google.com/thumbnail?id=${drive[1]}&sz=w1000`;
  return /^https?:\/\//i.test(foto) ? foto : FOTO_BASE + foto;
}

function renderStats(animais) {
  const disponiveis = animais.filter(a => a.status !== "Adotado");
  const femeas = disponiveis.filter(a => a.sexo === "Fêmea").length;
  const machos = disponiveis.filter(a => a.sexo === "Macho").length;
  document.getElementById("stats").innerHTML = `
    <div><div class="valor">${disponiveis.length}</div><div class="rotulo">Pets disponíveis</div></div>
    <div><div class="valor">${femeas}</div><div class="rotulo">Fêmeas</div></div>
    <div><div class="valor">${machos}</div><div class="rotulo">Machos</div></div>
  `;
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
    <div class="card" data-nome="${a.nome}">
      <div class="card-photo">
        <span class="badge ${adotado ? "adotado" : "disponivel"}">${adotado ? "Adotado(a)" : "Disponível"}</span>
        <img src="${urlFoto(a.foto)}" alt="Foto de ${a.nome}" loading="lazy" style="${estilo}">
        <div class="ajuste-info">
          <span class="ajuste-valores">${textoAjuste(x, y, zoom)}</span>
          <button type="button" class="ajuste-copiar">Copiar</button>
        </div>
      </div>
      <div class="card-body">
        <h3>${a.nome}</h3>
        <div class="card-meta">
          <span>${a.sexo || ""}</span>
          <span>${a.porte || ""}</span>
          <span>${a.idade || ""}</span>
        </div>
      </div>
    </div>`;
}

function aplicarFiltros(animais, estado) {
  const termo = estado.busca.trim().toLowerCase();
  return animais.filter(a => {
    if (a.status === "Adotado") return false;
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
Notion, e sair com os valores prontos pra colar nas colunas "enquadramento" e
"zoom" da planilha. Fica invisível pra quem só visita o site: só liga com
?ajustar na URL. Nada é salvo sozinho, a planilha continua sendo a fonte da
verdade. */
const MODO_AJUSTE = new URLSearchParams(location.search).has("ajustar");

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
    <span>Modo ajuste: arraste a foto para reposicionar, role para aproximar.
    Depois cole os valores nas colunas <strong>enquadramento</strong> e
    <strong>zoom</strong> da planilha.</span>
    <button type="button" id="copiar-todos">Copiar todos</button>`;
  document.body.prepend(barra);

  const area = document.querySelector("main");
  let cardAtivo = null, ultimoX = 0, ultimoY = 0;

  area.addEventListener("pointerdown", e => {
    if (e.target.closest(".ajuste-info")) return;
    const foto = e.target.closest(".card-photo");
    if (!foto) return;
    cardAtivo = foto.closest(".card");
    ultimoX = e.clientX;
    ultimoY = e.clientY;
    foto.classList.add("arrastando");
    foto.setPointerCapture(e.pointerId);
  });

  area.addEventListener("pointermove", e => {
    if (!cardAtivo) return;
    const ajuste = ajusteDoCard(cardAtivo);
    if (ajuste.zoom <= 1.01) return;   // nada pra deslocar ainda
    // com scale(z) a partir do ponto de foco, a janela visível anda
    // largura*(z-1) pixels na tela de ponta a ponta: essa conta faz a foto
    // acompanhar o cursor na razão de 1 pra 1.
    const caixa = cardAtivo.querySelector(".card-photo").getBoundingClientRect();
    const dx = 100 * (e.clientX - ultimoX) / (caixa.width * (ajuste.zoom - 1));
    const dy = 100 * (e.clientY - ultimoY) / (caixa.height * (ajuste.zoom - 1));
    ajuste.foco = [
      Math.min(100, Math.max(0, ajuste.foco[0] - dx)),
      Math.min(100, Math.max(0, ajuste.foco[1] - dy)),
    ];
    ultimoX = e.clientX;
    ultimoY = e.clientY;
    desenharAjuste(cardAtivo, ajuste);
  });

  ["pointerup", "pointercancel"].forEach(ev => area.addEventListener(ev, () => {
    if (cardAtivo) cardAtivo.querySelector(".card-photo").classList.remove("arrastando");
    cardAtivo = null;
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

  area.addEventListener("click", e => {
    const botao = e.target.closest(".ajuste-copiar");
    if (!botao) return;
    const ajuste = ajusteDoCard(botao.closest(".card"));
    // separado por tabulação: uma colada só preenche as duas células da planilha
    copiarTexto(valoresPlanilha(ajuste.foco[0], ajuste.foco[1], ajuste.zoom).join("\t"), botao);
  });

  document.getElementById("copiar-todos").addEventListener("click", e => {
    const linhas = [...AJUSTES].map(([nome, aj]) =>
      [nome, ...valoresPlanilha(aj.foco[0], aj.foco[1], aj.zoom)].join("\t"));
    copiarTexto(linhas.join("\n"), e.target);
  });
}

async function carregarAnimais() {
  if (SHEET_CSV_URL) {
    const resp = await fetch(SHEET_CSV_URL, { cache: "no-store" });
    if (!resp.ok) throw new Error("Falha ao carregar a planilha");
    return parseCSV(await resp.text());
  }
  const resp = await fetch("dados-exemplo.json");
  return resp.json();
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

  renderStats(animais);

  const adotados = animais.filter(a => a.status === "Adotado");
  document.getElementById("finais-felizes").hidden = adotados.length === 0;
  document.getElementById("grid-adotados").innerHTML = adotados.map(cardHTML).join("");

  const estado = { sexo: "", porte: "", busca: "" };
  const grid = document.getElementById("grid");
  const vazio = document.getElementById("vazio");
  const contador = document.getElementById("contador");

  function render() {
    const filtrados = aplicarFiltros(animais, estado);
    grid.innerHTML = filtrados.map(cardHTML).join("");
    vazio.hidden = filtrados.length > 0;
    const total = animais.filter(a => a.status !== "Adotado").length;
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
