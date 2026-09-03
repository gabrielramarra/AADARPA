# Recorte automático de fotos

`recortar-rostos.py` deixa as fotos dos animais já enquadradas no rosto, no
formato 4:3 usado pelos cards do site. Serve para fotos novas antes de subir,
evitando o problema de rosto pequeno ou jogado no canto do card.

## Instalação (uma vez só)

```
python -m venv venv
venv\Scripts\python.exe -m pip install ultralytics
```

O modelo de detecção (6 MB) baixa sozinho na primeira execução.

## Uso

Recortar uma pasta inteira, gerando uma folha de contato para conferir antes
de aceitar o resultado:

```
venv\Scripts\python.exe recortar-rostos.py <pasta> --saida <pasta-saida> --conferir
```

Recortar sobrescrevendo os arquivos (guarda os originais em `.originais/`):

```
venv\Scripts\python.exe recortar-rostos.py <pasta>
```

## Como funciona, e onde falha

Duas etapas: um modelo YOLO localiza o animal na foto, e dentro dessa área o
script ancora o recorte na cabeça, usando a geometria da caixa do animal (de
frente, a cabeça fica no topo ao centro; de perfil, numa das pontas, decidida
pela concentração de detalhe). Só depois usa contraste, e apenas para ajuste
fino na vizinhança imediata.

A ordem importa: usar contraste como critério principal não funciona nessas
fotos, porque piso de ladrilho, roupa listrada e grama têm mais contraste que
um focinho, e o recorte cai no chão.

Acerta bem em animal de frente. Em animal de perfil ou deitado o rosto sai
visível mas nem sempre centralizado. Por isso o `--conferir`: vale bater o
olho na folha de contato e recortar à mão as poucas que saírem ruins.
