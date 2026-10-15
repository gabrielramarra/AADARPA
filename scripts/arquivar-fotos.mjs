// Guarda no Dropbox as fotos que saíram do site (substituídas ou apagadas em fotos/),
// com a data em que deixaram de ser usadas: bob_ate-2026-10-15.jpg.
// Roda sozinho depois de cada commit e de cada git pull (.githooks/post-commit e post-merge);
// arquivos já arquivados são pulados. Em outra máquina sem essa pasta do Dropbox, não faz nada.
import { execFileSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { homedir } from "os";
import { basename, dirname, extname, join } from "path";
import { fileURLToPath } from "url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const site = join(homedir(), "Dropbox", "AADARPA", "Site de Adoção");
const destino = join(site, "fotos-arquivadas");
if (!existsSync(site)) process.exit(0);

// Antes de 49a3717 as fotos eram rascunhos; 8345af2 só converteu PNG em JPG (mesmas fotos).
// Commits futuros que só reprocessam fotos: ponha [sem-arquivo] na mensagem.
const INICIO = "49a3717";
const TECNICOS = ["8345af2"];

const git = (...args) => execFileSync("git", args, { cwd: raiz, maxBuffer: 1 << 28 });
const log = git("log", `${INICIO}..HEAD`, "--diff-filter=MD", "--name-status", "--format=@%h %cs %s", "--", "fotos/").toString();

let commit, data, pular;
let novas = 0;
for (const linha of log.split("\n")) {
  if (linha.startsWith("@")) {
    [commit, data] = linha.slice(1).split(" ");
    pular = TECNICOS.includes(commit) || linha.includes("[sem-arquivo]");
    continue;
  }
  const [status, caminho] = linha.split("\t");
  if (pular || !caminho || !/^[MD]$/.test(status)) continue;
  const nome = `${basename(caminho, extname(caminho))}_ate-${data}${extname(caminho)}`;
  const arquivo = join(destino, nome);
  if (existsSync(arquivo)) continue;
  mkdirSync(destino, { recursive: true });
  writeFileSync(arquivo, git("show", `${commit}^:${caminho}`));
  console.log("arquivada:", nome);
  novas++;
}
if (novas) console.log(`${novas} foto(s) em ${destino}`);
