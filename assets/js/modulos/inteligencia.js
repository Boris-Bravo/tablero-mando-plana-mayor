/*
 * inteligencia.js — Módulo "Reportes de Inteligencia" (P-2).
 */
import { h, limpiar, toast, modal, confirmar, fechaHoy } from "../ui.js";
import { puedeEditarCampo } from "../auth.js";

const TABLA = "reportes_inteligencia";
const CAMPO = "P-2";
const CLASES = { rutinario: { txt: "Rutinario", cls: "tag--pend" }, importante: { txt: "Importante", cls: "tag--porvencer" }, urgente: { txt: "Urgente", cls: "tag--venc" } };

let ctx, cont, perfil, lista, filtro = "todos";

export async function inteligenciaModulo(contenedor, contexto) {
  ctx = contexto; cont = contenedor; perfil = ctx.sesion.perfil;
  await cargar();
  render();
  return ctx.db.suscribir(TABLA, async () => { await cargar(); render(); });
}

async function cargar() { lista = await ctx.db.listar(TABLA); }

function render() {
  limpiar(cont);
  const puedeEscribir = puedeEditarCampo(perfil, CAMPO);
  cont.appendChild(h("div", { class: "page-head" },
    h("div", {}, h("h2", {}, "🔎 Reportes de Inteligencia"), h("div", { class: "sub" }, "Novedades y reportes de la unidad")),
    puedeEscribir ? h("button", { class: "btn btn--primary", onclick: () => abrirEditor() }, "＋ Nuevo reporte") : null));

  const chips = h("div", { class: "chips", style: "margin-bottom:16px" });
  for (const [val, txt] of [["todos", "Todos"], ["rutinario", "Rutinario"], ["importante", "Importante"], ["urgente", "Urgente"]]) {
    chips.appendChild(h("span", { class: `chip ${filtro === val ? "active" : ""}`, onclick: () => { filtro = val; render(); } }, txt));
  }
  cont.appendChild(chips);

  const filtrados = lista.filter((r) => filtro === "todos" || r.clasificacion === filtro).sort((a, b) => new Date(b.creado) - new Date(a.creado));
  if (!filtrados.length) {
    cont.appendChild(h("div", { class: "vacio" }, h("div", { class: "big" }, "🔎"), h("p", {}, "Sin reportes registrados.")));
    return;
  }
  const lista_ = h("div", { class: "list" });
  for (const r of filtrados) {
    const c = CLASES[r.clasificacion] || CLASES.rutinario;
    lista_.appendChild(h("div", { class: "list-item" },
      h("div", { class: "list-item__main" },
        h("span", { class: "list-item__title" }, h("span", { class: `tag ${c.cls}` }, c.txt), " ", r.asunto),
        h("span", { class: "list-item__meta" }, `${r.fecha}${r.fuente ? " · Fuente: " + r.fuente : ""}`),
        r.contenido ? h("span", { class: "list-item__meta" }, r.contenido) : null),
      puedeEscribir ? h("div", { class: "list-item__actions" }, h("button", { class: "btn btn--danger btn--sm", onclick: () => eliminar(r) }, "🗑️")) : null));
  }
  cont.appendChild(lista_);
}

function abrirEditor() {
  const fecha = h("input", { type: "date", value: fechaHoy() });
  const fuente = h("input", { type: "text", placeholder: "Fuente (opcional)" });
  const asunto = h("input", { type: "text", placeholder: "Asunto del reporte" });
  const clasificacion = h("select", {}, ...Object.entries(CLASES).map(([v, c]) => h("option", { value: v }, c.txt)));
  const contenido = h("textarea", { rows: "5", placeholder: "Detalle del reporte" });

  modal({
    titulo: "＋ Nuevo Reporte de Inteligencia",
    cuerpo: h("div", {},
      h("div", { class: "form-row" }, h("div", { class: "field" }, h("label", {}, "Fecha"), fecha), h("div", { class: "field" }, h("label", {}, "Fuente"), fuente)),
      h("div", { class: "form-row" }, h("div", { class: "field" }, h("label", {}, "Asunto"), asunto), h("div", { class: "field", style: "flex:0 0 160px" }, h("label", {}, "Clasificación"), clasificacion)),
      h("div", { class: "form-row" }, h("div", { class: "field" }, h("label", {}, "Contenido"), contenido))),
    acciones: [
      { texto: "Cancelar", clase: "btn--ghost", valor: null },
      {
        texto: "💾 Guardar", clase: "btn--primary", valor: "ok",
        onClick: async () => {
          if (!asunto.value.trim()) { toast("Indica el asunto", "err"); return false; }
          try {
            await ctx.db.crear(TABLA, { fecha: fecha.value, fuente: fuente.value.trim(), asunto: asunto.value.trim(), clasificacion: clasificacion.value, contenido: contenido.value.trim(), creado_por: ctx.sesion.user.id });
            toast("Reporte guardado", "ok");
            await cargar(); render();
          } catch (e) { console.error(e); toast("No se pudo guardar", "err"); }
        },
      },
    ],
  });
}

async function eliminar(r) {
  if (!await confirmar("¿Eliminar este reporte?", { titulo: "Eliminar", textoOk: "Eliminar", peligro: true })) return;
  try { await ctx.db.eliminar(TABLA, r.id); toast("Eliminado", ""); await cargar(); render(); }
  catch { toast("No se pudo eliminar", "err"); }
}
