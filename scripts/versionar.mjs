// Coloca a "impressão digital" do conteúdo de cada CSS/JS local no endereço
// usado pelas páginas (style.css?v=3f2a91c0). Quando um arquivo muda, o
// endereço muda junto e o navegador é obrigado a baixar a versão nova, em vez
// de misturar uma página nova com um estilo antigo guardado no celular.
//
// Uso: node scripts/versionar.mjs           atualiza as páginas
//      node scripts/versionar.mjs --testar  confere a regra sem tocar em nada
// Roda sozinho a cada commit pelo gancho em .githooks/pre-commit (ativado com
// git config core.hooksPath .githooks, uma vez por cópia do repositório).
import { createHash } from "crypto";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const PAGINAS = ["index.html", "quem-somos.html", "privacidade.html", "doar/index.html", "transparencia/index.html"];
// src="..." ou href="..." apontando pra .css/.js do próprio site (não http:, não //)
const REF = /((?:src|href)=")((?!https?:|\/\/)[^"?#]+\.(?:css|js))(?:\?v=[0-9a-f]+)?"/g;

// quebras de linha normalizadas: o mesmo arquivo com CRLF (checkout no Windows) e LF
// (servido pelo GitHub Pages) tem a mesma impressão, sem versões novas à toa
const impressao = conteudo => createHash("sha256").update(String(conteudo).replace(/\r\n/g, "\n")).digest("hex").slice(0, 8);

export function versionarPagina(html, lerArquivo) {
  return html.replace(REF, (todo, inicio, caminho) => {
    const conteudo = lerArquivo(caminho);
    return conteudo === null ? todo : `${inicio}${caminho}?v=${impressao(conteudo)}"`;
  });
}

if (process.argv[2] === "--testar") {
  const arquivos = { "/style.css": "a{}", "app.js": "x=1" };
  const ler = c => arquivos[c] ?? null;
  const pagina = `<link href="/style.css"><script src="app.js"></script><script src="https://x.com/a.js"></script><script src="falta.js"></script>`;
  const v1 = versionarPagina(pagina, ler);
  if (!v1.includes(`/style.css?v=${impressao("a{}")}"`) || !v1.includes(`app.js?v=${impressao("x=1")}"`)) throw new Error("não versionou: " + v1);
  if (!v1.includes(`src="https://x.com/a.js"`) || !v1.includes(`src="falta.js"`)) throw new Error("mexeu em externo ou inexistente: " + v1);
  if (versionarPagina(v1, ler) !== v1) throw new Error("rodar de novo mudou o resultado");
  arquivos["app.js"] = "x=2";
  if (!versionarPagina(v1, ler).includes(`app.js?v=${impressao("x=2")}"`)) throw new Error("não atualizou a versão antiga");
  console.log("versionar: ok");
} else {
  const alteradas = [];
  for (const pagina of PAGINAS) {
    const caminhoPagina = join(raiz, pagina);
    const html = readFileSync(caminhoPagina, "utf8");
    const novo = versionarPagina(html, ref => {
      const arquivo = ref.startsWith("/") ? join(raiz, ref) : join(dirname(caminhoPagina), ref);
      return existsSync(arquivo) ? readFileSync(arquivo) : null;
    });
    if (novo !== html) { writeFileSync(caminhoPagina, novo); alteradas.push(pagina); }
  }
  console.log(alteradas.length ? `versões atualizadas em: ${alteradas.join(", ")}` : "versões já em dia");
  if (process.argv[2] === "--git-add" && alteradas.length) execSync(`git add ${alteradas.join(" ")}`, { cwd: raiz });
}
