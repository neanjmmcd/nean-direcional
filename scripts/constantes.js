/* Constantes do Nean Direcional (separadas para main.js e config.js não dependerem um do outro ao carregar) */

export const ID = "nean-direcional";
export const POSES = ["frente_esq", "frente_dir", "costas_esq", "costas_dir"];
export const STATUS_FURTIVO = "nean-furtivo";
export const STATUS_ARMADO = "nean-armado";

/** Nome da vaga: [arma_]normal_<pose>, [arma_]furtivo_<pose> ou [arma_]caido */
export const vaga = (arma, furtivo, pose) =>
  `${arma ? "arma_" : ""}${pose === "caido" ? "caido" : `${furtivo ? "furtivo" : "normal"}_${pose}`}`;

export const VAGAS = [false, true].flatMap(a => [
  ...POSES.map(p => vaga(a, false, p)),
  ...POSES.map(p => vaga(a, true, p)),
  vaga(a, false, "caido")
]);
