/* =========================
 * NEAN DIRECIONAL
 * Troca a imagem do token pela direção em que ele anda ou é girado.
 * Tokens feitos a 45°: 4 poses (frente ↙ ↘, costas ↖ ↗). Jogos de imagem:
 *   sem arma: normal ×4, furtivo ×4, caído ×1
 *   com arma: normal ×4, furtivo ×4, caído ×1
 * "Furtivo" e "Arma em punho" são condições do próprio módulo (HUD do token);
 * "caído" usa as condições de caído/morto (configuráveis). Não depende de sistema.
 * ========================= */

import { ID, POSES, STATUS_FURTIVO, STATUS_ARMADO, vaga, VAGAS } from "./constantes.js";
import { ConfigDirecional } from "./config.js";

/* ---------- direção ---------- */

/**
 * Vetor de movimento → pose. Um componente pequeno demais (menos de 40% do outro)
 * não muda aquele eixo: andar quase na horizontal mantém frente/costas de antes.
 */
export function poseDoVetor(dx, dy, atual = "frente_dir") {
  if (!dx && !dy) return atual;
  const [vAtual, hAtual] = (POSES.includes(atual) ? atual : "frente_dir").split("_");
  const ax = Math.abs(dx), ay = Math.abs(dy);
  const v = ay > 0.4 * ax ? (dy > 0 ? "frente" : "costas") : vAtual;
  const h = ax > 0.4 * ay ? (dx > 0 ? "dir" : "esq") : hAtual;
  return `${v}_${h}`;
}

/** Rotação do Foundry (0° = olhando para baixo, cresce no sentido horário) → pose */
export function poseDaRotacao(graus, atual) {
  const rad = Math.toRadians(Number(graus ?? 0) + 90);
  return poseDoVetor(Math.cos(rad), Math.sin(rad), atual);
}

/* ---------- condições ---------- */

const lista = chave => String(game.settings.get(ID, chave) ?? "").split(",").map(s => s.trim()).filter(Boolean);
const statusDo = doc => doc?.actor?.statuses ?? new Set();
const tem = (statuses, ids) => ids.some(i => statuses.has(i));

export function estado(doc) {
  const s = statusDo(doc);
  return {
    caido: tem(s, lista("statusCaido")),
    furtivo: tem(s, [STATUS_FURTIVO, ...lista("statusFurtivo")]),
    arma: tem(s, [STATUS_ARMADO, ...lista("statusArmado")])
  };
}

/** Direções da mais próxima para a mais distante: a própria, as vizinhas (troca um eixo) e a oposta */
export function ordemDirecoes(pose) {
  const [v, h] = (POSES.includes(pose) ? pose : "frente_dir").split("_");
  const ov = v === "frente" ? "costas" : "frente", oh = h === "esq" ? "dir" : "esq";
  return [`${v}_${h}`, `${v}_${oh}`, `${ov}_${h}`, `${ov}_${oh}`];
}

/**
 * Imagem para a pose e o estado atuais. Basta uma imagem por direção (com ou sem arma):
 * 1. caído: com/sem arma;
 * 2. no jogo do estado (furtivo ou normal): a direção pedida e, se faltar, a mais próxima,
 *    em cada direção primeiro a versão com/sem arma pedida e depois a outra;
 * 3. furtivo sem imagem nenhuma: cai no jogo normal; por fim, a imagem original do token.
 */
export function escolher(doc, pose, flags = doc.flags?.[ID]) {
  const img = flags?.imagens ?? {};
  const { caido, furtivo, arma } = estado(doc);
  const candidatas = [];
  if (caido) candidatas.push(vaga(arma, false, "caido"), vaga(!arma, false, "caido"));
  for (const f of furtivo ? [true, false] : [false]) {
    for (const p of ordemDirecoes(pose)) candidatas.push(vaga(arma, f, p), vaga(!arma, f, p));
  }
  for (const k of candidatas) if (img[k]) return img[k];
  return flags?.original || null;
}

/** Aplica a imagem certa num token já existente (mudou condição, configurou agora…) */
export async function atualizarToken(doc) {
  const f = doc?.flags?.[ID];
  if (!f?.ativo || !doc.isOwner) return;
  const src = escolher(doc, f.pose ?? "frente_dir");
  if (src && src !== doc.texture.src) await doc.update({ "texture.src": src }, { neanDirecional: true });
}

function tokensDoAtor(actor) {
  if (actor.isToken) return actor.token ? [actor.token] : [];
  return actor.getDependentTokens?.() ?? [];
}

/* ---------- pré-carregamento (evita piscar na troca) ---------- */

const carregarTextura = (...a) => (foundry.canvas?.loadTexture ?? globalThis.loadTexture)?.(...a);
export function preCarregar(doc) {
  const f = doc?.flags?.[ID];
  if (!f?.ativo) return;
  for (const src of Object.values(f.imagens ?? {})) if (src) carregarTextura(src).catch?.(() => {});
}

/* ---------- registro ---------- */

Hooks.once("init", () => {
  const s = (chave, padrao) => game.settings.register(ID, chave, {
    name: `NEAN_DIRECIONAL.Config.${chave}.nome`, hint: `NEAN_DIRECIONAL.Config.${chave}.dica`,
    scope: "world", config: true, type: String, default: padrao
  });
  s("statusCaido", "dead,prone,unconscious");
  s("statusFurtivo", "");
  s("statusArmado", "");

  // Condições do módulo no HUD do token
  const icone = nome => `modules/${ID}/icons/${nome}.svg`;
  for (const st of [
    { id: STATUS_FURTIVO, name: "NEAN_DIRECIONAL.Furtivo", img: icone("furtivo") },
    { id: STATUS_ARMADO, name: "NEAN_DIRECIONAL.Armado", img: icone("armado") }
  ]) if (!CONFIG.statusEffects.some(e => e.id === st.id)) CONFIG.statusEffects.push(st);
});

/* Andar (arrastar, setas, WASD, régua) e girar (Shift/Ctrl + roda) */
Hooks.on("preUpdateToken", (doc, changes, options) => {
  const f = doc.flags?.[ID];
  if (!f?.ativo || options.neanDirecional) return;
  let pose = f.pose ?? "frente_dir";
  let mudou = false;

  if ("x" in changes || "y" in changes) {
    let dx = (changes.x ?? doc._source.x) - doc._source.x;
    let dy = (changes.y ?? doc._source.y) - doc._source.y;
    // Movimento com pontos de passagem: vale o último trecho
    const wps = options.movement?.[doc.id]?.waypoints;
    if (Array.isArray(wps) && wps.length >= 2) {
      const a = wps.at(-2), b = wps.at(-1);
      if (Number.isFinite(a?.x) && Number.isFinite(b?.x)) { dx = b.x - a.x; dy = b.y - a.y; }
    }
    if (dx || dy) { pose = poseDoVetor(dx, dy, pose); mudou = true; }
  }
  if (!mudou && "rotation" in changes) {
    pose = poseDaRotacao(changes.rotation, pose);
    mudou = true;
  }
  if (!mudou) return;

  foundry.utils.setProperty(changes, `flags.${ID}.pose`, pose);
  const src = escolher(doc, pose);
  if (src && src !== doc.texture.src) foundry.utils.setProperty(changes, "texture.src", src);
});

/* Condições ligadas/desligadas: caído, furtivo, arma em punho */
for (const gancho of ["createActiveEffect", "deleteActiveEffect", "updateActiveEffect"]) {
  Hooks.on(gancho, (efeito, ...resto) => {
    if (resto.at(-1) !== game.user.id) return;          // só quem fez a mudança aplica
    const actor = efeito.parent;
    if (!(actor instanceof Actor)) return;
    // espera o ator recalcular as condições
    setTimeout(() => { for (const t of tokensDoAtor(actor)) atualizarToken(t); }, 0);
  });
}

/* Pré-carrega as imagens dos tokens ativos da cena */
Hooks.on("canvasReady", () => { for (const t of canvas.tokens?.placeables ?? []) preCarregar(t.document); });
Hooks.on("createToken", doc => preCarregar(doc));

/* Botão no HUD do token */
Hooks.on("renderTokenHUD", (hud, html) => {
  const doc = hud.document ?? hud.object?.document;
  if (!doc?.isOwner) return;
  const el = html instanceof HTMLElement ? html : html?.[0];
  const col = el?.querySelector(".col.left");
  if (!col || col.querySelector(".nean-direcional-hud")) return;
  const botao = document.createElement("button");
  botao.type = "button";
  botao.className = "control-icon nean-direcional-hud" + (doc.flags?.[ID]?.ativo ? " active" : "");
  botao.dataset.tooltip = game.i18n.localize("NEAN_DIRECIONAL.Titulo");
  botao.innerHTML = '<i class="fa-solid fa-compass"></i>';
  botao.addEventListener("click", ev => { ev.preventDefault(); ConfigDirecional.abrir(doc); });
  col.append(botao);
});

/* Menu do ator na barra lateral: configura o protótipo (vale para tokens novos) */
Hooks.on("getActorContextOptions", (_app, opcoes) => {
  const ator = li => game.actors.get((li?.[0] ?? li)?.closest?.("[data-entry-id]")?.dataset.entryId);
  const v14 = (game.release?.generation ?? 13) >= 14;
  const nome = game.i18n.localize("NEAN_DIRECIONAL.Titulo");
  opcoes.push(v14
    ? { label: nome, icon: "fa-solid fa-compass", visible: li => !!ator(li)?.isOwner, onClick: (_e, li) => ConfigDirecional.abrir(ator(li)) }
    : { name: nome, icon: '<i class="fa-solid fa-compass"></i>', condition: li => !!ator(li)?.isOwner, callback: li => ConfigDirecional.abrir(ator(li)) });
});

Hooks.once("ready", () => {
  game.modules.get(ID).api = { escolher, atualizarToken, poseDoVetor, poseDaRotacao, ordemDirecoes, VAGAS, abrir: d => ConfigDirecional.abrir(d) };
});
