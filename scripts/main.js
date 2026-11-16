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
import { ListaAtores } from "./lista.js";
import { ManualDirecional } from "./manual.js";

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
/**
 * Condições ativas do ator: as de efeito ativo (padrão do Foundry) e as que o sistema guarda como item
 * (ex.: PF2e, em que Escondido, Caído etc. são itens do tipo "condition"), pelo slug.
 */
function statusDo(doc) {
  const actor = doc?.actor;
  const s = new Set(actor?.statuses ?? []);
  for (const item of actor?.items ?? []) {
    if (!["condition", "effect"].includes(item.type)) continue;
    if (item.isActive === false || item.active === false) continue;
    const slug = item.slug ?? item.system?.slug;
    if (slug) s.add(slug);
  }
  return s;
}
const tem = (statuses, ids) => ids.some(i => statuses.has(i));

/** Marca no próprio token: usada quando o sistema não aceita a condição do módulo (ex.: PF2e) */
const MARCA = { furtivo: "furtivo", arma: "armado" };

export function estado(doc) {
  const s = statusDo(doc);
  const m = doc?.flags?.[ID] ?? {};
  return {
    caido: tem(s, lista("statusCaido")),
    furtivo: !!m[MARCA.furtivo] || tem(s, [STATUS_FURTIVO, ...lista("statusFurtivo")]),
    arma: !!m[MARCA.arma] || tem(s, [STATUS_ARMADO, ...lista("statusArmado")])
  };
}

/**
 * Liga/desliga Furtivo ou Arma em punho. Tenta a condição do módulo; se o sistema a recusar
 * (o PF2e cancela em silêncio qualquer efeito ativo que não seja "morto"), guarda a marca no token.
 * Ao desligar, tira tudo o que estiver contando: condição do módulo, marca e condições extras do sistema.
 */
export async function alternarEstado(doc, chave) {
  const actor = doc?.actor;
  if (!actor) return false;
  const id = chave === "furtivo" ? STATUS_FURTIVO : STATUS_ARMADO;
  const extras = lista(chave === "furtivo" ? "statusFurtivo" : "statusArmado");
  const marca = `flags.${ID}.${MARCA[chave]}`;
  const tentar = async (st, active) => { try { await actor.toggleStatusEffect(st, { active }); } catch (e) { /* sistema sem essa condição */ } };

  if (!estado(doc)[chave]) {
    await tentar(id, true);
    if (!actor.statuses?.has(id)) await doc.update({ [marca]: true }, { neanDirecional: true });
  } else {
    if (actor.statuses?.has(id)) await tentar(id, false);
    if (doc.flags?.[ID]?.[MARCA[chave]]) await doc.update({ [marca]: false }, { neanDirecional: true });
    const ativas = statusDo(doc);
    for (const e of extras) if (ativas.has(e)) await tentar(e, false);
  }
  await atualizarToken(doc);
  return estado(doc)[chave];
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
  // Manual (todos) e lista de atores com busca (só o mestre) nas configurações do módulo
  game.settings.registerMenu(ID, "manual", {
    name: "NEAN_DIRECIONAL.Manual.Menu", label: "NEAN_DIRECIONAL.Manual.Botao", hint: "NEAN_DIRECIONAL.Manual.Dica",
    icon: "fa-solid fa-book-open", type: ManualDirecional, restricted: false
  });
  game.settings.registerMenu(ID, "lista", {
    name: "NEAN_DIRECIONAL.Lista.Menu", label: "NEAN_DIRECIONAL.Lista.Botao", hint: "NEAN_DIRECIONAL.Lista.Dica",
    icon: "fa-solid fa-users", type: ListaAtores, restricted: true
  });
  s("statusCaido", "dead,prone,unconscious");
  s("statusFurtivo", "");
  s("statusArmado", "");

  registrarCondicoes();
});
// Sistemas e módulos podem trocar a lista de condições depois do init: registra de novo
Hooks.once("setup", registrarCondicoes);
Hooks.once("ready", registrarCondicoes);

/** Condições do próprio módulo (valem em qualquer sistema): Furtivo e Arma em punho */
function registrarCondicoes() {
  const icone = nome => `modules/${ID}/icons/${nome}.svg`;
  const lista = CONFIG.statusEffects;
  for (const st of [
    { id: STATUS_FURTIVO, name: "NEAN_DIRECIONAL.Furtivo", img: icone("furtivo") },
    { id: STATUS_ARMADO, name: "NEAN_DIRECIONAL.Armado", img: icone("armado") }
  ]) {
    const existe = Array.isArray(lista) ? lista.some(e => e.id === st.id) : !!lista?.[st.id];
    if (existe) continue;
    if (Array.isArray(lista)) lista.push(st); else if (lista) lista[st.id] = st;
  }
}

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

/* Condições ligadas/desligadas: caído, furtivo, arma em punho.
 * Efeitos ativos (padrão do Foundry) e itens de condição/efeito (sistemas como o PF2e). */
for (const gancho of ["createActiveEffect", "deleteActiveEffect", "updateActiveEffect", "createItem", "deleteItem", "updateItem"]) {
  Hooks.on(gancho, (efeito, ...resto) => {
    if (resto.at(-1) !== game.user.id) return;          // só quem fez a mudança aplica
    const actor = efeito.parent;
    if (!(actor instanceof Actor)) return;
    if (efeito.documentName === "Item" && !["condition", "effect"].includes(efeito.type)) return;
    // espera o ator recalcular as condições
    setTimeout(() => { for (const t of tokensDoAtor(actor)) atualizarToken(t); }, 0);
  });
}

/* Pré-carrega as imagens dos tokens ativos da cena */
Hooks.on("canvasReady", () => { for (const t of canvas.tokens?.placeables ?? []) preCarregar(t.document); });
Hooks.on("createToken", doc => preCarregar(doc));

/* Botões no HUD do token: configurar (bússola) e, com o módulo ativo no token,
 * ligar/desligar Furtivo e Arma em punho sem procurar na lista de condições */
Hooks.on("renderTokenHUD", (hud, html) => {
  const doc = hud.document ?? hud.object?.document;
  if (!doc?.isOwner) return;
  const el = html instanceof HTMLElement ? html : html?.[0];
  const col = el?.querySelector(".col.left");
  if (!col || col.querySelector(".nean-direcional-hud")) return;
  const botao = (classe, icone, dica, ativo, aoClicar) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `control-icon nean-direcional-hud ${classe}` + (ativo ? " active" : "");
    b.dataset.tooltip = dica;
    b.innerHTML = `<i class="${icone}"></i>`;
    b.addEventListener("click", ev => { ev.preventDefault(); aoClicar(b); });
    col.append(b);
  };
  botao("nd-hud-config", "fa-solid fa-compass", game.i18n.localize("NEAN_DIRECIONAL.Titulo"),
    !!doc.flags?.[ID]?.ativo, () => ConfigDirecional.abrir(doc));
  if (!doc.flags?.[ID]?.ativo || !doc.actor) return;
  const atual = estado(doc);
  const alternar = async (chave, b) => b.classList.toggle("active", await alternarEstado(doc, chave));
  botao("nd-hud-furtivo", "fa-solid fa-user-ninja", game.i18n.localize("NEAN_DIRECIONAL.Furtivo"),
    atual.furtivo, b => alternar("furtivo", b));
  botao("nd-hud-armado", "fa-solid fa-hand-fist", game.i18n.localize("NEAN_DIRECIONAL.Armado"),
    atual.arma, b => alternar("arma", b));
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
  game.modules.get(ID).api = { escolher, atualizarToken, estado, alternarEstado, poseDoVetor, poseDaRotacao, ordemDirecoes, VAGAS, abrir: d => ConfigDirecional.abrir(d), manual: () => ManualDirecional.abrir() };
});
