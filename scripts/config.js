/* Janela de configuração: as 18 imagens do token (ou do protótipo do ator) */

import { ID, POSES, vaga, VAGAS } from "./constantes.js";
import { escolher, preCarregar } from "./main.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const FP = () => foundry.applications.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
const SETA = { frente_esq: "↙", frente_dir: "↘", costas_esq: "↖", costas_dir: "↗" };
const L = k => game.i18n.localize(`NEAN_DIRECIONAL.${k}`);

/** "nean_arma_furtivo_costas_dir_00002_.png" → "nean_arma_furtivo_costas_dir" */
const baseDoArquivo = f => decodeURIComponent(String(f).split("/").pop())
  .replace(/\.(png|webp|jpe?g|gif|avif|svg)$/i, "").replace(/_\d+_?$/, "").toLowerCase();

/** O arquivo serve para a vaga? (as vagas sem arma não pegam os arquivos "arma_") */
function serve(base, chave) {
  const igual = base === chave || base.endsWith(`_${chave}`);
  if (!igual) return false;
  return chave.startsWith("arma_") || !(base === `arma_${chave}` || base.endsWith(`_arma_${chave}`));
}

export class ConfigDirecional extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: [ID],
    tag: "form",
    window: { icon: "fa-solid fa-compass", resizable: true },
    position: { width: 660, height: "auto" },
    form: { handler: ConfigDirecional.#salvar, closeOnSubmit: true },
    actions: { escolher: ConfigDirecional.#escolher, limpar: ConfigDirecional.#limpar, pasta: ConfigDirecional.#pasta }
  };
  static PARTS = { main: { template: `modules/${ID}/templates/config.hbs`, scrollable: [".nd-corpo"] } };

  /** Abre (ou traz para a frente) a janela de um token ou de um ator */
  static abrir(doc) {
    if (!doc) return;
    const id = `${ID}-${doc.uuid.replaceAll(".", "-")}`;
    const aberta = foundry.applications.instances.get(id);
    if (aberta) return aberta.bringToFront?.() ?? aberta.render({ force: true });
    return new ConfigDirecional({ id, documento: doc }).render({ force: true });
  }

  constructor(options) {
    super(options);
    this.documento = options.documento;
    const f = this.#flags();
    this.rascunho = Object.fromEntries(VAGAS.map(k => [k, f.imagens?.[k] ?? ""]));
    this.estado = { ativo: f.ativo ?? true, prototipo: false };
  }

  get ehAtor() { return this.documento instanceof Actor; }
  get title() { return `${L("Titulo")}: ${this.documento.name}`; }

  #flags() {
    const d = this.documento;
    return (this.ehAtor ? d.prototypeToken.flags?.[ID] : d.flags?.[ID]) ?? {};
  }

  async _prepareContext() {
    // 3 seções; em cada direção, a vaga sem arma em cima e a com arma logo abaixo
    const v = (k, rotulo) => ({ key: k, rotulo, src: this.rascunho[k] ?? "" });
    const coluna = (furtivo, pose, titulo) => ({
      titulo,
      vagas: [v(vaga(false, furtivo, pose), L("SemArma")), v(vaga(true, furtivo, pose), L("ComArma"))]
    });
    const direcoes = furtivo => POSES.map(p => coluna(furtivo, p, `${L(`Pose.${p}`)} ${SETA[p]}`));
    const secoes = [
      { titulo: L("Normal"), colunas: direcoes(false) },
      { titulo: L("Furtivo"), colunas: direcoes(true) },
      { titulo: L("CaidoMorto"), colunas: [coluna(false, "caido", "")] }
    ];
    return { secoes, ativo: this.estado.ativo, prototipo: this.estado.prototipo, ehToken: !this.ehAtor };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    // guarda as caixas marcadas: escolher uma imagem redesenha a janela
    for (const nome of ["ativo", "prototipo"]) {
      this.element.querySelector(`[name="${nome}"]`)?.addEventListener("change", ev => { this.estado[nome] = ev.target.checked; });
    }
  }

  static #escolher(_ev, alvo) {
    const key = alvo.dataset.key;
    new (FP())({
      type: "image",
      current: this.rascunho[key] || "",
      callback: caminho => { this.rascunho[key] = caminho; this.render(); }
    }).render(true);
  }

  static #limpar(_ev, alvo) {
    this.rascunho[alvo.dataset.key] = "";
    this.render();
  }

  /** Escolhe uma pasta e encaixa os arquivos pelo nome (padrão do NeanTools) */
  static #pasta() {
    new (FP())({
      type: "folder",
      callback: async pasta => {
        let arquivos = [];
        for (const origem of ["data", "public"]) {
          try { arquivos = (await FP().browse(origem, pasta)).files ?? []; } catch { arquivos = []; }
          if (arquivos.length) break;
        }
        let n = 0;
        for (const k of VAGAS) {
          const achados = arquivos.filter(f => serve(baseDoArquivo(f), k)).sort();
          if (achados.length) { this.rascunho[k] = achados.at(-1); n++; }   // o de número mais alto
        }
        ui.notifications[n ? "info" : "warn"](game.i18n.format("NEAN_DIRECIONAL.PastaResultado", { n, total: VAGAS.length }));
        this.render();
      }
    }).render(true);
  }

  static async #salvar(_ev, _form, formData) {
    const dados = foundry.utils.expandObject(formData.object);
    const imagens = Object.fromEntries(VAGAS.map(k => [k, String(dados.imagens?.[k] ?? "").trim()]));
    const ativo = !!dados.ativo;
    const montar = (atual, srcAtual) => ({
      ativo, imagens,
      pose: atual?.pose ?? "frente_dir",
      original: atual?.original || srcAtual   // imagem do token antes de ativar (volta ao desativar)
    });

    const salvarPrototipo = async actor => {
      const pt = actor.prototypeToken;
      const f = montar(pt.flags?.[ID], pt.texture.src);
      const upd = { [`prototypeToken.flags.${ID}`]: f };
      if (ativo) {
        upd["prototypeToken.lockRotation"] = true;   // a figura não gira; quem muda é a imagem
        const src = imagens[vaga(false, false, f.pose)] || Object.values(imagens).find(Boolean);
        if (src) upd["prototypeToken.texture.src"] = src;
      } else if (f.original) upd["prototypeToken.texture.src"] = f.original;
      await actor.update(upd);
    };

    if (this.ehAtor) return salvarPrototipo(this.documento);

    const tok = this.documento;
    const f = montar(tok.flags?.[ID], tok.texture.src);
    const upd = { [`flags.${ID}`]: f };
    if (ativo) {
      upd.lockRotation = true;
      const src = escolher(tok, f.pose, f);
      if (src) upd["texture.src"] = src;
    } else if (f.original) upd["texture.src"] = f.original;
    await tok.update(upd, { neanDirecional: true });
    preCarregar(tok);
    if (dados.prototipo && tok.actor) await salvarPrototipo(game.actors.get(tok.actor.id) ?? tok.actor);
  }
}
