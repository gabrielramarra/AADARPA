// Lê a tabela "Animais" do Baserow e gera dados-animais.json, só com os
// campos públicos (nunca os campos internos como histórico médico ou
// vacinas). Uso: node scripts/gerar-dados.mjs
// Precisa de BASEROW_TOKEN e BASEROW_TABLE_ID no ambiente: localmente, via
// .env na raiz do repositório; no GitHub Actions, via secrets do workflow.
import { existsSync, readFileSync, writeFileSync } from "fs";
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
