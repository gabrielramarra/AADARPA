// Lê a tabela "Animais" do Baserow e gera dados-animais.json, só com os
// campos públicos (nunca os campos internos como histórico médico ou
// vacinas). Uso: node scripts/gerar-dados.mjs
// Precisa de BASEROW_TOKEN e BASEROW_TABLE_ID no ambiente: localmente, via
// .env na raiz do repositório; no GitHub Actions, via secrets do workflow.
import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(raiz, ".env");

const env = { ...process.env };
if (existsSync(envPath)) {
  for (const linha of readFileSync(envPath, "utf8").split("\n")) {
    if (!linha.includes("=")) continue;
    const i = linha.indexOf("=");
    env[linha.slice(0, i)] ??= linha.slice(i + 1).trim();
  }
}

// Abaixo de 1 ano mostra em meses (filhotes); acima, em anos completos.
function idade(dataNascimento, hoje = new Date()) {
  if (!dataNascimento) return "";
  const [a, m, d] = dataNascimento.slice(0, 10).split("-").map(Number);
  let meses = (hoje.getFullYear() - a) * 12 + (hoje.getMonth() + 1 - m);
  if (hoje.getDate() < d) meses--;
  if (meses < 1) return "menos de 1 mês";
  if (meses < 12) return meses === 1 ? "1 mês" : `${meses} meses`;
  const anos = Math.floor(meses / 12);
  return anos === 1 ? "1 ano" : `${anos} anos`;
}

// campos de single_select vêm como {id, value, color}; os demais, no valor puro
const valor = campo => (campo && typeof campo === "object" ? campo.value : campo) ?? "";

async function main() {
  const resposta = await fetch(
    `https://api.baserow.io/api/database/rows/table/${env.BASEROW_TABLE_ID}/?user_field_names=true&size=200`,
    { headers: { Authorization: `Token ${env.BASEROW_TOKEN}` } }
  );
  if (!resposta.ok) throw new Error(`Baserow respondeu ${resposta.status}`);
  const { results } = await resposta.json();

  const animais = results.map(r => ({
    id: r.id,
    nome: valor(r.Nome),
    sexo: valor(r.Sexo),
    idade: idade(r.Data_Nasc),
    porte: valor(r.Porte),
    status: valor(r.Status),
    foto: valor(r.Foto),
    descricao: valor(r["Descrição"]),
    enquadramento: valor(r.Enquadramento),
    zoom: r.Zoom ?? "",
  }));

  const destino = join(raiz, "dados-animais.json");
  writeFileSync(destino, JSON.stringify(animais, null, 2) + "\n");
  console.log(`${animais.length} animais escritos em dados-animais.json`);
  gerarPaginasDeCompartilhamento(animais);
}

// mesma regra do slug() do app.js: "Poison (Malinois)" -> "poison-malinois"
const slug = nome => nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const html = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

// WhatsApp, Facebook etc. não leem o "#" do endereço nem rodam JavaScript, então
// aadarpa.ong.br/#jade sempre mostrava a imagem geral do site. Cada animal disponível
// ganha aadarpa.ong.br/a/<slug>/ com a foto dele na pré-visualização; quem abre o
// link é levado na hora para a ficha (/#<slug>). A pasta a/ é refeita a cada geração.
function gerarPaginasDeCompartilhamento(animais) {
  const pasta = join(raiz, "a");
  rmSync(pasta, { recursive: true, force: true });
  let n = 0;
  for (const a of animais) {
    if (a.status !== "Disponível" || !a.nome || !a.foto) continue;
    const s = slug(a.nome);
    const arquivoFoto = join(raiz, "fotos", a.foto);
    // versão da foto no endereço: se a foto for trocada, o WhatsApp busca a nova
    const versao = existsSync(arquivoFoto) ? "?v=" + createHash("sha256").update(readFileSync(arquivoFoto)).digest("hex").slice(0, 8) : "";
    const femea = a.sexo === "Fêmea";
    const titulo = `Adote ${femea ? "a" : "o"} ${a.nome} · AADARPA`;
    const resumo = [a.sexo, a.porte && `porte ${a.porte.toLowerCase()}`, a.idade].filter(Boolean).join(" · ");
    const descricao = `${resumo ? resumo + ". " : ""}${femea ? "Ela" : "Ele"} está esperando uma família no abrigo AADARPA, em Goiânia-GO.`;
    mkdirSync(join(pasta, s), { recursive: true });
    writeFileSync(join(pasta, s, "index.html"), `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${html(titulo)}</title>
<meta name="description" content="${html(descricao)}">
<meta name="robots" content="noindex">
<link rel="canonical" href="https://aadarpa.ong.br/#${s}">
<meta property="og:type" content="website">
<meta property="og:locale" content="pt_BR">
<meta property="og:site_name" content="AADARPA">
<meta property="og:title" content="${html(titulo)}">
<meta property="og:description" content="${html(descricao)}">
<meta property="og:url" content="https://aadarpa.ong.br/a/${s}/">
<meta property="og:image" content="https://aadarpa.ong.br/fotos/${html(a.foto)}${versao}">
<meta property="og:image:alt" content="Foto de ${html(a.nome)}">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0; url=/#${s}">
<script>location.replace("/#${s}");</script>
</head>
<body>
<p>Abrindo a ficha de ${html(a.nome)}… <a href="/#${s}">Ver no site</a></p>
</body>
</html>
`);
    n++;
  }
  console.log(`${n} páginas de compartilhamento em a/`);
}

// node scripts/gerar-dados.mjs --testar  confere o cálculo de idade sem chamar o Baserow
if (process.argv[2] === "--testar") {
  const hoje = new Date(2026, 9, 11); // 11/10/2026
  const casos = { "2026-10-01": "menos de 1 mês", "2026-09-11": "1 mês", "2026-09-12": "menos de 1 mês",
    "2026-05-20": "4 meses", "2025-10-12": "11 meses", "2025-10-11": "1 ano", "2025-12-30": "9 meses", "2019-03-01": "7 anos" };
  for (const [nasc, esperado] of Object.entries(casos)) {
    const obtido = idade(nasc, hoje);
    if (obtido !== esperado) throw new Error(`${nasc}: esperado "${esperado}", veio "${obtido}"`);
  }
  console.log("idade: ok");
} else {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
