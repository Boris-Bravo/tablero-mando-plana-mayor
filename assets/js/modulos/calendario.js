/*
 * calendario.js — Módulo "Calendario de Actividades" (colaborativo).
 *
 * Cuadrícula de mes real, compartida en tiempo real por toda la Plana Mayor.
 * La escritura queda reservada al mando en esta primera fase.
 */
import { h, limpiar, toast, modal, confirmar, fechaHoy, idNuevo } from "../ui.js";
import { esMando } from "../auth.js";

const TABLA = "calendario_items";
const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

let ctx, cont, perfil, items;
let mesRef, diaSel;

export async function calendarioModulo(contenedor, contexto) {
  ctx = contexto; cont = contenedor; perfil = ctx.sesion.perfil;
  await cargar();
  const hoy = new Date();
  mesRef = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  diaSel = fechaHoy();
  render();
  return ctx.db.suscribir(TABLA, async () => { await cargar(); render(); });
}

async function cargar() { items = await ctx.db.listar(TABLA); }

function isoDia(y, m, d) { return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`; }
function itemsDe(fecha) { return items.filter((i) => i.fecha === fecha); }
function fechaLargaSimple(iso) { const [a, m, d] = iso.split("-").map(Number); return `${d} de ${MESES[m - 1]} de ${a}`; }

function nuevoItem(fecha) {
  return { id: null, fecha: fecha || fechaHoy(), hora: "", titulo: "", tipo: "actividad", completado: false, descripcion: "" };
}

/* =================== RENDER =================== */
function render() {
  limpiar(cont);
  cont.appendChild(h("div", { class: "page-head" },
    h("div", {}, h("h2", {}, "📅 Calendario de Actividades"), h("div", { class: "sub" }, "Compartido en tiempo real con la Plana Mayor")),
    esMando(perfil) ? h("button", { class: "btn btn--primary", onclick: () => abrirEditor(nuevoItem(diaSel), true) }, "＋ Agregar") : null));

  cont.appendChild(pintarNav());
  cont.appendChild(pintarGrid());
  cont.appendChild(pintarPanelDia());
}

function pintarNav() {
  return h("div", { class: "cal-nav" },
    h("button", { class: "btn btn--ghost btn--sm", onclick: () => { mesRef = new Date(mesRef.getFullYear(), mesRef.getMonth() - 1, 1); render(); } }, "‹"),
    h("h3", {}, `${MESES[mesRef.getMonth()]} ${mesRef.getFullYear()}`),
    h("div", { class: "btn-row" },
      h("button", { class: "btn btn--ghost btn--sm", onclick: () => { const h2 = new Date(); mesRef = new Date(h2.getFullYear(), h2.getMonth(), 1); diaSel = fechaHoy(); render(); } }, "Hoy"),
      h("button", { class: "btn btn--ghost btn--sm", onclick: () => { mesRef = new Date(mesRef.getFullYear(), mesRef.getMonth() + 1, 1); render(); } }, "›")));
}

const MAX_VISIBLES_DIA = 3;

function pintarGrid() {
  const grid = h("div", { class: "cal-grid" });
  for (const d of DIAS_SEMANA) grid.appendChild(h("div", { class: "cal-dow" }, d));

  const y = mesRef.getFullYear(), m = mesRef.getMonth();
  const primerDiaSemana = (new Date(y, m, 1).getDay() + 6) % 7;
  const diasEnMes = new Date(y, m + 1, 0).getDate();
  const hoy = fechaHoy();

  for (let i = 0; i < primerDiaSemana; i++) grid.appendChild(h("div", { class: "cal-day cal-day--fuera" }));

  for (let d = 1; d <= diasEnMes; d++) {
    const fecha = isoDia(y, m, d);
    const its = itemsDe(fecha).sort((a, b) => (a.hora || "").localeCompare(b.hora || ""));
    const clases = ["cal-day"];
    if (fecha === hoy) clases.push("cal-day--hoy");
    if (fecha === diaSel) clases.push("cal-day--sel");
    const celda = h("div", { class: clases.join(" "), onclick: () => { diaSel = fecha; render(); } }, h("span", { class: "cal-day__num" }, String(d)));
    for (const it of its.slice(0, MAX_VISIBLES_DIA)) {
      const esPendienteActivo = it.tipo === "pendiente" && !it.completado;
      celda.appendChild(h("span", { class: `cal-day__item ${esPendienteActivo ? "cal-day__item--pendiente" : "cal-day__item--actividad"}`, title: it.titulo || "" },
        it.hora ? `${it.hora.slice(0, 5)} ${it.titulo || ""}` : (it.titulo || "Sin título")));
    }
    if (its.length > MAX_VISIBLES_DIA) celda.appendChild(h("span", { class: "cal-day__mas" }, `+${its.length - MAX_VISIBLES_DIA} más`));
    grid.appendChild(celda);
  }
  return grid;
}

function pintarPanelDia() {
  const panel = h("div", { class: "panel", style: "margin-top:16px" });
  const its = itemsDe(diaSel).sort((a, b) => (a.hora || "").localeCompare(b.hora || ""));
  panel.appendChild(h("div", { style: "display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px" },
    h("h3", { style: "margin:0;border:none;padding:0" }, fechaLargaSimple(diaSel)),
    esMando(perfil) ? h("button", { class: "btn btn--primary btn--sm", onclick: () => abrirEditor(nuevoItem(diaSel), true) }, "＋ Agregar aquí") : null));

  if (!its.length) {
    panel.appendChild(h("p", { class: "muted", style: "text-align:center;padding:10px" }, "Sin actividades ni pendientes para este día."));
    return panel;
  }
  const lista = h("div", { class: "list" });
  for (const it of its) {
    lista.appendChild(h("div", { class: "list-item" },
      h("div", { class: "list-item__main" },
        h("span", { class: "list-item__title" }, it.tipo === "pendiente" ? (it.completado ? "✅ " : "🔴 ") : "🔷 ", it.hora ? `${it.hora.slice(0, 5)} — ` : "", it.titulo || "Sin título"),
        it.descripcion ? h("span", { class: "list-item__meta" }, it.descripcion) : null),
      esMando(perfil) ? h("div", { class: "list-item__actions" },
        it.tipo === "pendiente" ? h("button", { class: "btn btn--ghost btn--sm", onclick: () => marcarCompletado(it) }, it.completado ? "↩️" : "✅") : null,
        h("button", { class: "btn btn--gold btn--sm", onclick: () => abrirEditor(structuredClone(it), false) }, "✏️"),
        h("button", { class: "btn btn--danger btn--sm", onclick: () => eliminarItem(it) }, "🗑️")) : null));
  }
  panel.appendChild(lista);
  return panel;
}

/* =================== EDITAR (solo mando) =================== */
function abrirEditor(item, esNueva) {
  const fecha = h("input", { type: "date", value: item.fecha });
  const hora = h("input", { type: "time", value: (item.hora || "").slice(0, 5) });
  const tipo = h("select", {}, h("option", { value: "actividad", selected: item.tipo !== "pendiente" }, "Actividad"), h("option", { value: "pendiente", selected: item.tipo === "pendiente" }, "Pendiente"));
  const titulo = h("input", { type: "text", value: item.titulo || "", placeholder: "Ej.: Instrucción de tiro, entrega de informe…" });
  const desc = h("textarea", { rows: "3", placeholder: "Detalles (opcional)" }, item.descripcion || "");

  const cuerpo = h("div", {},
    h("div", { class: "form-row" }, h("div", { class: "field" }, h("label", {}, "Fecha"), fecha), h("div", { class: "field" }, h("label", {}, "Hora (opcional)"), hora)),
    h("div", { class: "field", style: "margin:12px 0" }, h("label", {}, "Tipo"), tipo),
    h("div", { class: "field", style: "margin-bottom:12px" }, h("label", {}, "Título"), titulo),
    h("div", { class: "field" }, h("label", {}, "Detalles"), desc));

  const acciones = [
    { texto: "Cancelar", clase: "btn--ghost", valor: null },
    {
      texto: "💾 Guardar", clase: "btn--primary", valor: "ok",
      onClick: () => {
        if (!fecha.value) { toast("Indica una fecha", "err"); return false; }
        if (!titulo.value.trim()) { toast("Indica un título", "err"); return false; }
        const cambios = { fecha: fecha.value, hora: hora.value || null, tipo: tipo.value, titulo: titulo.value.trim(), descripcion: desc.value.trim() };
        guardarItem(item, cambios, esNueva);
      },
    },
  ];
  if (!esNueva) acciones.splice(1, 0, { texto: "🗑️ Eliminar", clase: "btn--danger", valor: "del", onClick: () => eliminarItem(item, true) });
  modal({ titulo: esNueva ? "＋ Agregar al calendario" : "✏️ Editar", cuerpo, acciones });
}

async function guardarItem(item, cambios, esNueva) {
  try {
    if (esNueva) await ctx.db.crear(TABLA, { ...cambios, creado_por: ctx.sesion.user.id });
    else await ctx.db.actualizar(TABLA, item.id, cambios);
    diaSel = cambios.fecha;
    const [ay, am] = cambios.fecha.split("-").map(Number);
    mesRef = new Date(ay, am - 1, 1);
    toast("Guardado", "ok");
    await cargar(); render();
  } catch (e) { console.error(e); toast("No se pudo guardar", "err"); }
}

async function marcarCompletado(it) {
  try { await ctx.db.actualizar(TABLA, it.id, { completado: !it.completado }); await cargar(); render(); }
  catch { toast("No se pudo actualizar", "err"); }
}

async function eliminarItem(it, desdeEditor = false) {
  if (!desdeEditor && !await confirmar(`¿Eliminar "${it.titulo || "Sin título"}"?`, { titulo: "Eliminar", textoOk: "Eliminar", peligro: true })) return;
  try { await ctx.db.eliminar(TABLA, it.id); toast("Eliminado", ""); await cargar(); render(); }
  catch { toast("No se pudo eliminar", "err"); }
}
