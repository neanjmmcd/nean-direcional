/* Lista de atores (só o mestre): busca pelo nome e abre a configuração do protótipo de cada um */

import { ID } from "./constantes.js";
import { ConfigDirecional } from "./config.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
/** Nome do tipo traduzido; se o sistema não traduziu ("TYPES.Actor.npc"), usa o próprio tipo */
function rotuloTipo(chave, tipo) {
  const t = chave ? game.i18n.localize(chave) : "";
  if (t && t !== chave) return t;
  return String(tipo ?? "").replace(/^./, c => c.toUpperCase());
}
const normalizar = t => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export class ListaAtores extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: [ID, "nd-lista-janela"],
    window: { title: "NEAN_DIRECIONAL.Lista.Titulo", icon: "fa-solid fa-compass", resizable: true },
    position: { width: 460, height: Math.min(700, window.innerHeight - 80) },
    actions: { abrir: ListaAtores.#abrir }
  };
  static PARTS = { main: { template: `modules/${ID}/templates/lista.hbs`, scrollable: [".nd-lista"] } };

  /** Pelo menu das configurações: o Foundry chama render() numa instância nova */
  async _prepareContext() {
    const tipos = CONFIG.Actor.typeLabels ?? {};
    const atores = game.actors.contents
      .map(a => ({
        id: a.id,
        nome: a.name,
        img: a.img,
        tipo: rotuloTipo(tipos[a.type], a.type),
        ativo: !!a.prototypeToken.flags?.[ID]?.ativo,
        busca: normalizar(a.name)
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, game.i18n.lang));
    return { atores, filtro: this._filtro ?? "" };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const campo = this.element.querySelector(".nd-busca");
    const filtrar = () => {
      this._filtro = campo.value;
      const t = normalizar(campo.value);
      let visiveis = 0;
      for (const li of this.element.querySelectorAll(".nd-ator")) {
        const mostra = !t || li.dataset.busca.includes(t);
        li.hidden = !mostra;
        if (mostra) visiveis++;
      }
      const nada = this.element.querySelector(".nd-nada");
      if (nada) nada.hidden = visiveis > 0;
    };
    campo?.addEventListener("input", filtrar);
    filtrar();
    campo?.focus();
  }

  static #abrir(_ev, alvo) {
    const ator = game.actors.get(alvo.closest("[data-actor-id]")?.dataset.actorId);
    if (ator) ConfigDirecional.abrir(ator);
  }
}
