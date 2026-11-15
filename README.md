# Nean Direcional

Módulo para **Foundry VTT 13 e 14** que troca a imagem do token conforme a direção em que ele anda ou é girado.
Não depende de nenhum sistema.

## O que faz

- **4 poses a 45°**: frente ↙, frente ↘, costas ↖ e costas ↗. Cada movimento usa a diagonal mais próxima.
  Andar reto muda só um eixo e mantém o outro: olhando para frente ↙ e andando para a direita, vira frente ↘;
  olhando para costas ↖ e andando para baixo, vira frente ↙.
- **Qualquer jeito de mover**: arrastar, setas, WASD e régua com pontos de passagem (vale o último trecho).
- **Girar parado**: Shift ou Ctrl + roda do mouse escolhe a pose pela rotação. A figura não gira (o módulo liga *travar rotação* do token); quem muda é a imagem.
- **Furtivo** e **Arma em punho**: condições do próprio módulo, ligadas no HUD do token, cada uma com o seu jogo de imagens.
- **Caído / morto**: as condições `dead`, `prone` e `unconscious` do Foundry (dá para trocar nas configurações do módulo) mostram a imagem de caído.

## As imagens: 3 seções

| Seção | Em cada direção (↙ ↘ ↖ ↗) |
|---|---|
| **Normal** | sem arma em cima, com arma logo abaixo |
| **Furtivo** | sem arma em cima, com arma logo abaixo |
| **Caído / morto** | uma coluna só: sem arma e com arma |

Basta **uma imagem por direção**, com ou sem arma: se a versão pedida não existir, vale a outra.
Se a **direção** não tiver imagem, o token mostra a direção mais próxima que existir (a vizinha que troca só
um eixo e, por último, a oposta) quando chegar àquele ângulo. Furtivo sem imagem nenhuma usa o jogo normal;
sem nada configurado, fica a imagem original do token.

## Como usar

1. Botão **bússola** no HUD do token (vale para aquele token) ou **Nean Direcional** no menu do ator na barra lateral
   (vale para os tokens novos dele).
2. Clique em cada vaga para escolher a imagem, ou em **Preencher pela pasta** para o módulo encaixar os arquivos pelo nome.
3. Marque **Ativar** e salve. Ao desativar, o token volta à imagem original.

### Nomes de arquivo reconhecidos

O padrão é o das variações do NeanTools (`--variacoes`), com `arma_` para as poses com arma:

```
<nome>_normal_frente_esq   <nome>_furtivo_frente_esq   <nome>_caido
<nome>_normal_frente_dir   <nome>_furtivo_frente_dir
<nome>_normal_costas_esq   <nome>_furtivo_costas_esq
<nome>_normal_costas_dir   <nome>_furtivo_costas_dir

<nome>_arma_normal_frente_esq ... <nome>_arma_furtivo_costas_dir   <nome>_arma_caido
```

O número no fim (`_00001_`) é ignorado; havendo vários, vale o mais alto.

## Configurações (mestre)

- **Condições de caído**: IDs separados por vírgula (padrão `dead,prone,unconscious`).
- **Condições de furtivo / arma em punho (extra)**: IDs do seu sistema que também contam, além das condições do módulo.

## Para quem programa

`game.modules.get("nean-direcional").api` expõe `abrir(tokenOuAtor)`, `atualizarToken(tokenDoc)`, `escolher(tokenDoc, pose)`,
`poseDoVetor(dx, dy, poseAtual)`, `poseDaRotacao(graus, poseAtual)`, `ordemDirecoes(pose)` e `VAGAS`.
Os dados ficam em `flags["nean-direcional"]` do token ou do protótipo: `{ ativo, imagens, pose, original }`.

## Licença

Uso livre, modificação e distribuição gratuita permitidos, mantendo o crédito **"Nean Direcional, por NeaN World"**.
**Proibido vender** o módulo (ou versões dele) e apresentar-se como autor ou dono. Texto completo em [LICENSE](LICENSE).

© 2026 NeaN World
