"""
Recorta fotos de animais em 4:3 já enquadradas no rosto, automaticamente.

Como funciona, em duas etapas:
  1. Um modelo YOLO pré-treinado localiza o cachorro (ou gato) na foto. Isso
     elimina o fundo, que é o que mais atrapalha um recorte automático simples.
  2. Dentro da caixa do animal, procura a janela com maior densidade de detalhe
     (energia de borda). O rosto é quase sempre a parte com mais contraste do
     animal (olhos, focinho, boca), então essa janela cai no rosto.

Uso:
    python recortar-rostos.py <pasta ou arquivo> [--saida <pasta>] [--conferir]

Sem --saida, sobrescreve os arquivos originais (faz backup em .originais/).
Com --conferir, gera uma folha de contato para revisão visual antes de aceitar.
"""

import argparse
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image

PROPORCAO = 4 / 5          # proporção do card no site (retrato)
MARGEM = 1.35              # folga em volta do rosto, animal de frente
MARGEM_PERFIL = 0.95       # folga menor quando o animal está de perfil
CLASSES_ANIMAIS = {15, 16}  # COCO: 15 = cat, 16 = dog


def energia_de_borda(img_cinza):
    """Mapa de detalhe: diferença absoluta entre pixels vizinhos."""
    a = np.asarray(img_cinza, dtype=np.float32)
    dx = np.abs(np.diff(a, axis=1, prepend=a[:, :1]))
    dy = np.abs(np.diff(a, axis=0, prepend=a[:1, :]))
    return dx + dy


def centro_do_rosto(energia, caixa):
    """
    Estima onde está a cabeça a partir da geometria da caixa do animal.

    Energia de borda pura não serve como único critério: piso de ladrilho,
    roupa listrada e grama têm mais contraste que um focinho, e o recorte
    acaba caindo no chão. A âncora aqui é anatômica, e a energia só decide
    ambiguidade lateral.
    """
    x0, y0, x1, y1 = caixa
    larg, alt = x1 - x0, y1 - y0

    if alt >= larg:
        # animal de pé ou sentado, de frente: cabeça no topo, ao centro
        return x0 + larg / 2, y0 + 0.25 * alt

    # animal de perfil ou deitado: cabeça numa das pontas. A cabeça tem olhos,
    # focinho e boca, então concentra mais detalhe que o traseiro.
    meio_y = slice(int(y0), int(y0 + alt * 0.6))
    esq = energia[meio_y, int(x0):int(x0 + larg * 0.3)].sum()
    dir_ = energia[meio_y, int(x1 - larg * 0.3):int(x1)].sum()
    px = x0 + 0.2 * larg if esq >= dir_ else x1 - 0.2 * larg
    return px, y0 + 0.35 * alt


def janela_no_rosto(energia, caixa, larg_janela, tamanho_img):
    """Janela 4:3 centrada na cabeça, com ajuste fino guiado pelo detalhe."""
    W, H = tamanho_img
    larg_janela = int(min(larg_janela, W, H * PROPORCAO))
    alt_janela = int(larg_janela / PROPORCAO)

    cx, cy = centro_do_rosto(energia, caixa)
    esq = int(round(cx - larg_janela / 2))
    topo = int(round(cy - alt_janela / 2))

    # ajuste fino: procura só na vizinhança imediata, para encaixar melhor no
    # rosto sem liberdade de fugir para o fundo
    acum = np.pad(energia.cumsum(axis=0).cumsum(axis=1), ((1, 0), (1, 0)))

    def soma(ax, ay, bx, by):
        return acum[by, bx] - acum[ay, bx] - acum[by, ax] + acum[ay, ax]

    raio = int(larg_janela * 0.15)
    passo = max(3, raio // 6)
    melhor, melhor_pos = -1.0, (esq, topo)
    for dy in range(-raio, raio + 1, passo):
        for dx in range(-raio, raio + 1, passo):
            ax = min(max(0, esq + dx), W - larg_janela)
            ay = min(max(0, topo + dy), H - alt_janela)
            s = soma(ax, ay, ax + larg_janela, ay + alt_janela)
            if s > melhor:
                melhor, melhor_pos = s, (ax, ay)
    return (*melhor_pos, larg_janela, alt_janela)


def localizar_animal(modelo, caminho, img):
    """Caixa do animal com maior confiança, ou a imagem toda se não achar."""
    resultado = modelo(str(caminho), verbose=False)[0]
    melhor_caixa, melhor_conf = None, 0.0
    for cx in resultado.boxes:
        classe = int(cx.cls[0])
        conf = float(cx.conf[0])
        if classe in CLASSES_ANIMAIS and conf > melhor_conf:
            melhor_caixa, melhor_conf = cx.xyxy[0].tolist(), conf
    if melhor_caixa is None:
        return (0, 0, img.width, img.height), 0.0
    return melhor_caixa, melhor_conf


def recortar(modelo, caminho, destino):
    img = Image.open(caminho).convert("RGB")
    caixa, conf = localizar_animal(modelo, caminho, img)

    energia = energia_de_borda(img.convert("L"))

    larg_caixa = caixa[2] - caixa[0]
    alt_caixa = caixa[3] - caixa[1]
    # animal de frente ocupa a largura toda com cabeça e peito, então cabe uma
    # janela mais folgada. De perfil, o corpo se estende para o lado e a mesma
    # folga traria muito tronco, então o recorte fecha mais na cabeça.
    folga = MARGEM if alt_caixa >= larg_caixa else MARGEM_PERFIL
    larg_janela = min(larg_caixa, alt_caixa) * folga

    x, y, w, h = janela_no_rosto(energia, caixa, larg_janela, img.size)
    img.crop((x, y, x + w, y + h)).save(destino)
    return conf, (x, y, w, h), img.size


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("alvo", help="arquivo ou pasta com as fotos")
    ap.add_argument("--saida", help="pasta de saída (padrão: sobrescreve)")
    ap.add_argument("--conferir", action="store_true",
                    help="gera folha-de-contato.png para revisão visual")
    args = ap.parse_args()

    from ultralytics import YOLO
    modelo = YOLO("yolov8n.pt")

    alvo = Path(args.alvo)
    fotos = sorted(p for p in ([alvo] if alvo.is_file() else alvo.iterdir())
                   if p.suffix.lower() in {".jpg", ".jpeg", ".png"})
    if not fotos:
        sys.exit(f"nenhuma foto encontrada em {alvo}")

    if args.saida:
        saida = Path(args.saida)
        saida.mkdir(parents=True, exist_ok=True)
    else:
        saida = alvo if alvo.is_dir() else alvo.parent
        backup = saida / ".originais"
        backup.mkdir(exist_ok=True)

    resultados = []
    for foto in fotos:
        if not args.saida:
            destino_backup = backup / foto.name
            if not destino_backup.exists():
                shutil.copy2(foto, destino_backup)
        destino = saida / foto.name
        conf, janela, tamanho = recortar(modelo, foto, destino)
        marca = "animal detectado" if conf else "SEM DETECÇÃO, usou a foto toda"
        print(f"{foto.name}: {marca} ({conf:.0%}) {tamanho} -> {janela[2]}x{janela[3]}")
        resultados.append(destino)

    if args.conferir:
        cols = 3
        linhas = (len(resultados) + cols - 1) // cols
        tw, th = 260, 195
        folha = Image.new("RGB", (tw * cols, th * linhas), "white")
        for i, p in enumerate(resultados):
            folha.paste(Image.open(p).convert("RGB").resize((tw, th)),
                        ((i % cols) * tw, (i // cols) * th))
        caminho_folha = saida / "folha-de-contato.png"
        folha.save(caminho_folha)
        print(f"\nfolha de contato: {caminho_folha}")


if __name__ == "__main__":
    main()
