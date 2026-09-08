/*
 * secciones.js — Panel "Gestionar Secciones" (solo mando).
 *
 * Permite crear/renombrar/reordenar/quitar las secciones que aparecen en el
 * inicio (Comando, P-1...P-5, y las que el 2do Comandante quiera agregar:
 * Capellanía, Comunicaciones, Sanidad, etc.) sin tocar código.
 *
 * Nota: una sección nueva aparece como portal, pero de momento solo mostrará
 * el atajo a "Documentación" filtrada por su clave (agrégala también en
 * Documentación → ⚙️ Campos si quieres que use esa misma etiqueta). Para
 * darle herramientas propias (como P-1…P-5) hay que agregarlas en código.
 */
import { h, limpiar, toast, modal, confirmar } from "../ui.js";

const TABLA = "secciones";
let ctx, cont, lista;

export async function seccionesModulo(contenedor, contexto) {
  ctx = contexto; cont = contenedor;
  await cargar();
  render();
  return ctx.db.suscribir(TABLA, async () => { await cargar(); render(); });
}

async function cargar() { lista = await ctx.db.listar(TABLA, { orden: "orden", ascendente: true }); }

function render() {
  limpiar(cont);
  cont.appendChild(h("div", { class: "page-head" },
    h("div", {}, h("h2", {}, "🧩 Gestionar Secciones"), h("div", { class: "sub" }, "Las secciones que ves en el inicio del Tablero")),
    h("button", { class: "btn btn--primary", onclick: () => abrirEditor(nuevo(), true) }, "＋ Nueva sección")));

  if (!lista.length) {
    cont.appendChild(h("div", { class: "vacio" }, h("div", { class: "big" }, "🧩"), h("p", {}, "No hay secciones todavía.")));
    return;
  }
  const filas = h("div", { class: "list" });
  for (const s of lista) {
    filas.appendChild(h("div", { class: "list-item" },
      h("div", { class: "list-item__main" },
        h("span", { class: "list-item__title" }, `${s.icono || "🧩"} ${s.nombre}`, " ", h("span", { class: "muted small" }, `(${s.clave})`)),
        s.descripcion ? h("span", { class: "list-item__meta" }, s.descripcion) : null),
      h("div", { class: "list-item__actions" },
        h("button", { class: "btn btn--gold btn--sm", onclick: () => abrirEditor(structuredClone(s), false) }, "✏️"),
        h("button", { class: "btn btn--danger btn--sm", onclick: () => eliminar(s) }, "🗑️"))));
  }
  cont.appendChild(filas);
}

function nuevo() { return { id: null, clave: "", nombre: "", icono: "🧩", descripcion: "", orden: lista.length }; }

function abrirEditor(s, esNueva) {
  const clave = h("input", { type: "text", value: s.clave, placeholder: "Ej.: capellania (sin espacios ni tildes)", disabled: !esNueva });
  const nombre = h("input", { type: "text", value: s.nombre, placeholder: "Ej.: Capellanía" });
  const icono = h("input", { type: "text", value: s.icono || "🧩", placeholder: "Un emoji, ej.: ⛪" });
  const descripcion = h("textarea", { rows: "2", placeholder: "Descripción breve (opcional)" }, s.descripcion || "");

  modal({
    titulo: esNueva ? "＋ Nueva sección" : "✏️ Editar sección",
    cuerpo: h("div", {},
      esNueva ? h("p", { class: "muted small", style: "margin:0 0 10px" }, "La \"clave\" identifica la sección internamente (no se puede cambiar después). Úsala también como nombre de campo en Documentación → ⚙️ Campos si quieres que comparta esa etiqueta.") : null,
      h("div", { class: "form-row" }, h("div", { class: "field" }, h("label", {}, "Clave"), clave), h("div", { class: "field", style: "flex:0 0 90px" }, h("label", {}, "Ícono"), icono)),
      h("div", { class: "form-row" }, h("div", { class: "field" }, h("label", {}, "Nombre"), nombre)),
      h("div", { class: "form-row" }, h("div", { class: "field" }, h("label", {}, "Descripción"), descripcion))),
    acciones: [
      { texto: "Cancelar", clase: "btn--ghost", valor: null },
      {
        texto: "💾 Guardar", clase: "btn--primary", valor: "ok",
        onClick: () => {
          if (!nombre.value.trim()) { toast("Indica un nombre", "err"); return false; }
          if (esNueva && !clave.value.trim()) { toast("Indica una clave", "err"); return false; }
          const cambios = { nombre: nombre.value.trim(), icono: icono.value.trim() || "🧩", descripcion: descripcion.value.trim() };
          if (esNueva) cambios.clave = clave.value.trim().toLowerCase().replace(/\s+/g, "_");
          guardar(s, cambios, esNueva);
        },
      },
    ],
  });
}

async function guardar(s, cambios, esNueva) {
  try {
    if (esNueva) await ctx.db.crear(TABLA, { ...cambios, orden: s.orden });
    else await ctx.db.actualizar(TABLA, s.id, cambios);
    toast("Guardado", "ok");
    await cargar(); render();
  } catch (e) {
    console.error(e);
    toast(e.message?.includes("duplicate") ? "Ya existe una sección con esa clave" : "No se pudo guardar", "err");
  }
}

async function eliminar(s) {
  if (!await confirmar(`¿Eliminar la sección "${s.nombre}"? Los datos que ya se cargaron en sus herramientas no se borran, solo deja de aparecer como portal.`, { titulo: "Eliminar sección", textoOk: "Eliminar", peligro: true })) return;
  try { await ctx.db.eliminar(TABLA, s.id); toast("Eliminada", ""); await cargar(); render(); }
  catch { toast("No se pudo eliminar", "err"); }
}
