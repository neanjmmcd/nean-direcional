/* Manual do módulo dentro do Foundry (português ou inglês, conforme o idioma do jogo) */

import { ID } from "./constantes.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ManualDirecional extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: [ID, "nd-manual-janela"],
    window: { title: "NEAN_DIRECIONAL.Manual.Titulo", icon: "fa-solid fa-book-open", resizable: true },
    position: { width: 720, height: Math.min(820, window.innerHeight - 80) }
  };
  static PARTS = { main: { template: `modules/${ID}/templates/manual.hbs`, scrollable: [".nd-manual"] } };

  static abrir() {
    const aberta = [...foundry.applications.instances.values()].find(a => a instanceof ManualDirecional);
    if (aberta) return aberta.bringToFront?.() ?? aberta.render({ force: true });
    return new ManualDirecional().render({ force: true });
  }

  async _prepareContext() {
    return { pt: String(game.i18n.lang).startsWith("pt"), img: `modules/${ID}/manual` };
  }
}
