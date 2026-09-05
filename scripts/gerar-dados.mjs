// Lê a tabela "Animais" do Baserow e gera dados-animais.json, só com os
// campos públicos (nunca os campos internos como histórico médico ou
// vacinas). Uso: node scripts/gerar-dados.mjs
// Precisa de um .env na raiz do repositório com BASEROW_TOKEN e
// BASEROW_TABLE_ID (veja scripts/setup-baserow, ou peça pro Claude).
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");

const env = Object.fromEntries(
  readFileSync(join(raiz, ".env"), "utf8")
    .split("\n")
    .filter(l => l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim()]; })
);

function idadeEmAnos(dataNascimento) {
  if (!dataNascimento) return "";
  const anos = new Date().getFullYear() - Number(dataNascimento.slice(0, 4));
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
    idade: idadeEmAnos(r.Data_Nasc),
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

main().catch(e => { console.error(e.message); process.exit(1); });
