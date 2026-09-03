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

function cardHTML(a) {
  const adotado = a.status === "Adotado";
  return `
    <div class="card">
      <div class="card-photo">
        <span class="badge ${adotado ? "adotado" : "disponivel"}">${adotado ? "Adotado" : "Disponível"}</span>
        <img src="${urlFoto(a.foto)}" alt="Foto de ${a.nome}" loading="lazy">
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
