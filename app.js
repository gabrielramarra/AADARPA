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

// enquadramento: onde fica o rosto do animal na foto, pra centralizar o corte e o zoom.
// Editável por animal na planilha (coluna "enquadramento"), combinando:
// topo/centro/baixo + esquerda/centro/direita (ex.: "topo-esquerda"). Pra ajuste
// fino também aceita coordenadas diretas, ex.: "35% 60%". Em branco usa o padrão.
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
  return [50, 25];
}

function cardHTML(a) {
  const adotado = a.status === "Adotado";
  const [x, y] = focoFoto(a);
  // zoom: quanto aproximar do rosto (1 = sem zoom). Coluna "zoom" na planilha, ex.: 1.5
  // transform-origin fica sempre no centro: object-position já trouxe o rosto pro
  // meio da caixa, então o zoom amplia a partir dali (não do ponto na imagem original).
  const zoom = Math.max(1, parseFloat(a.zoom) || 1);
  const estilo = `object-position:${x}% ${y}%; transform:scale(${zoom});`;
  return `
    <div class="card">
      <div class="card-photo">
        <span class="badge ${adotado ? "adotado" : "disponivel"}">${adotado ? "Adotado(a)" : "Disponível"}</span>
        <img src="${urlFoto(a.foto)}" alt="Foto de ${a.nome}" loading="lazy" style="${estilo}">
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
  botao.addEventListener("click", async () => {
    const campo = document.getElementById("pix-chave");
    try {
      await navigator.clipboard.writeText(campo.value);
    } catch {
      campo.select();
      document.execCommand("copy");
    }
    const original = botao.textContent;
    botao.textContent = "Copiado!";
    setTimeout(() => { botao.textContent = original; }, 1500);
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
})();
