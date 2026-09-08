/*
 * logistica.js — Módulo "Control Logístico" (P-4).
 */
import { h, limpiar, toast, modal, confirmar } from "../ui.js";
import { puedeEditarCampo } from "../auth.js";

const TABLA = "logistica_items";
const CAMPO = "P-4";
const CATEGORIAS = { armamento: "Armamento", vehiculo: "Vehículo", municion: "Munición", equipo: "Equipo", combustible: "Combustible", otro: "Otro" };
const ESTADOS = { operativo: { txt: "Operativo", cls: "tag--ok" }, mantenimiento: { txt: "Mantenimiento", cls: "tag--pend" }, baja: { txt: "Baja", cls: "tag--venc" } };

let ctx, cont, perfil, lista, filtro = { categoria: "todos", estado: "todos" };

export async function logisticaModulo(contenedor, contexto) {
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
    h("div", {}, h("h2", {}, "🚚 Control Logístico"), h("div", { class: "sub" }, "Inventario de armamento, vehículos, equipo y suministros")),
    puedeEscribir ? h("button", { class: "btn btn--primary", onclick: () => abrirEditor(nuevo(), true) }, "＋ Agregar ítem") : null));

  const fila = h("div", { class: "form-row" },
    selectFiltro("Categoría", [["todos", "Todos"], ...Object.entries(CATEGORIAS)], filtro.categoria, (v) => { filtro.categoria = v; render(); }),
    selectFiltro("Estado", [["todos", "Todos"], ...Object.entries(ESTADOS).map(([v, e]) => [v, e.txt])], filtro.estado, (v) => { filtro.estado = v; render(); }));
  cont.appendChild(h("div", { class: "panel", style: "padding:14px 18px" }, fila));

  const filtrados = lista
    .filter((i) => filtro.categoria === "todos" || i.categoria === filtro.categoria)
    .filter((i) => filtro.estado === "todos" || i.estado === filtro.estado);
  if (!filtrados.length) {
    cont.appendChild(h("div", { class: "vacio" }, h("div", { class: "big" }, "🚚"), h("p", {}, lista.length ? "Nada coincide con el filtro." : "Aún no hay ítems registrados.")));
    return;
  }
  const tabla = h("table", { class: "data" });
  tabla.appendChild(h("thead", {}, h("tr", {}, h("th", {}, "Categoría"), h("th", {}, "Descripción"), h("th", { class: "num" }, "Cantidad"), h("th", {}, "Estado"), h("th", {}, "Acciones"))));
  const tbody = h("tbody");
  for (const i of filtrados) {
    const est = ESTADOS[i.estado] || ESTADOS.operativo;
    tbody.appendChild(h("tr", {},
      h("td", {}, CATEGORIAS[i.categoria] || i.categoria), h("td", {}, i.descripcion), h("td", { class: "num" }, String(i.cantidad)),
      h("td", {}, h("span", { class: `tag ${est.cls}` }, est.txt)),
      h("td", {}, puedeEscribir ? h("div", { style: "display:flex;gap:6px" },
        h("button", { class: "btn btn--gold btn--sm", onclick: () => abrirEditor(structuredClone(i), false) }, "✏️"),
        h("button", { class: "btn btn--danger btn--sm", onclick: () => eliminar(i) }, "🗑️")) : h("span", { class: "muted small" }, "—"))));
  }
  tabla.appendChild(tbody);
  cont.appendChild(h("div", { class: "tabla-wrap" }, tabla));
}

function selectFiltro(label, opciones, valor, onChange) {
  const sel = h("select", { onchange: (e) => onChange(e.target.value) });
  opciones.forEach(([v, t]) => sel.appendChild(h("option", { value: v, selected: v === valor }, t)));
  return h("div", { class: "field" }, h("label", {}, label), sel);
}

function nuevo() { return { id: null, categoria: "equipo", descripcion: "", cantidad: 1, estado: "operativo", observaciones: "" }; }

function abrirEditor(i, esNueva) {
  const categoria = h("select", {}, ...Object.entries(CATEGORIAS).map(([v, t]) => h("option", { value: v, selected: v === i.categoria }, t)));
  const descripcion = h("input", { type: "text", value: i.descripcion, placeholder: "Ej.: Fusil FAL, Camión 6x6…" });
  const cantidad = h("input", { type: "number", min: "0", step: "1", value: i.cantidad });
  const estado = h("select", {}, ...Object.entries(ESTADOS).map(([v, e]) => h("option", { value: v, selected: v === i.estado }, e.txt)));
  const observaciones = h("textarea", { rows: "3" }, i.observaciones || "");

  modal({
    titulo: esNueva ? "＋ Nuevo ítem" : "✏️ Editar ítem",
    cuerpo: h("div", {},
      h("div", { class: "form-row" }, h("div", { class: "field" }, h("label", {}, "Categoría"), categoria), h("div", { class: "field", style: "flex:0 0 140px" }, h("label", {}, "Cantidad"), cantidad)),
      h("div", { class: "form-row" }, h("div", { class: "field" }, h("label", {}, "Descripción"), descripcion), h("div", { class: "field", style: "flex:0 0 160px" }, h("label", {}, "Estado"), estado)),
      h("div", { class: "form-row" }, h("div", { class: "field" }, h("label", {}, "Observaciones"), observaciones))),
    acciones: [
      { texto: "Cancelar", clase: "btn--ghost", valor: null },
      {
        texto: "💾 Guardar", clase: "btn--primary", valor: "ok",
        onClick: () => {
          if (!descripcion.value.trim()) { toast("Indica una descripción", "err"); return false; }
          const cambios = { categoria: categoria.value, descripcion: descripcion.value.trim(), cantidad: parseFloat(cantidad.value) || 0, estado: estado.value, observaciones: observaciones.value.trim() };
          guardar(i, cambios);
        },
      },
    ],
  });
}

async function guardar(i, cambios) {
  try {
    if (i.id) await ctx.db.actualizar(TABLA, i.id, { ...cambios, actualizado: new Date().toISOString() });
    else await ctx.db.crear(TABLA, { ...cambios, creado_por: ctx.sesion.user.id });
    toast("Guardado", "ok");
    await cargar(); render();
  } catch (e) { console.error(e); toast("No se pudo guardar", "err"); }
}

async function eliminar(i) {
  if (!await confirmar(`¿Eliminar "${i.descripcion}"?`, { titulo: "Eliminar ítem", textoOk: "Eliminar", peligro: true })) return;
  try { await ctx.db.eliminar(TABLA, i.id); toast("Eliminado", ""); await cargar(); render(); }
  catch { toast("No se pudo eliminar", "err"); }
}
