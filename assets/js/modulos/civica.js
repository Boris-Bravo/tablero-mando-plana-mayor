/*
 * civica.js — Módulo "Actividades Cívico-Militares" (P-5).
 */
import { h, limpiar, toast, modal, confirmar, fechaHoy, fechaLarga } from "../ui.js";
import { puedeEditarCampo } from "../auth.js";

const TABLA = "actividades_civicas";
const CAMPO = "P-5";
const TIPOS = { salud: "Salud", educacion: "Educación", infraestructura: "Infraestructura", donacion: "Donación", otro: "Otro" };

let ctx, cont, perfil, lista;

export async function civicaModulo(contenedor, contexto) {
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
    h("div", {}, h("h2", {}, "🤝 Acción Cívica y Operaciones Ciudadanas"), h("div", { class: "sub" }, "Actividades cívico-militares realizadas")),
    puedeEscribir ? h("button", { class: "btn btn--primary", onclick: () => abrirEditor() }, "＋ Registrar actividad") : null));

  const total = lista.length;
  const beneficiarios = lista.reduce((s, a) => s + (a.beneficiarios || 0), 0);
  cont.appendChild(h("div", { class: "chips", style: "margin-bottom:16px" },
    h("span", { class: "chip", style: "cursor:default" }, h("b", {}, String(total)), " actividades"),
    h("span", { class: "chip", style: "cursor:default" }, h("b", {}, String(beneficiarios)), " beneficiarios en total")));

  const ordenadas = [...lista].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  if (!ordenadas.length) {
    cont.appendChild(h("div", { class: "vacio" }, h("div", { class: "big" }, "🤝"), h("p", {}, "Aún no hay actividades registradas.")));
    return;
  }
  const lista_ = h("div", { class: "list" });
  for (const a of ordenadas) {
    lista_.appendChild(h("div", { class: "list-item" },
      h("div", { class: "list-item__main" },
        h("span", { class: "list-item__title" }, TIPOS[a.tipo] || a.tipo, " — ", a.descripcion),
        h("span", { class: "list-item__meta" }, `${fechaLarga(a.fecha)}${a.lugar ? " · " + a.lugar : ""}${a.beneficiarios ? " · " + a.beneficiarios + " beneficiarios" : ""}`)),
      puedeEscribir ? h("div", { class: "list-item__actions" }, h("button", { class: "btn btn--danger btn--sm", onclick: () => eliminar(a) }, "🗑️")) : null));
  }
  cont.appendChild(lista_);
}

function abrirEditor() {
  const fecha = h("input", { type: "date", value: fechaHoy() });
  const lugar = h("input", { type: "text", placeholder: "Lugar" });
  const tipo = h("select", {}, ...Object.entries(TIPOS).map(([v, t]) => h("option", { value: v }, t)));
  const descripcion = h("input", { type: "text", placeholder: "Descripción breve" });
  const beneficiarios = h("input", { type: "number", min: "0", value: "0" });

  modal({
    titulo: "＋ Registrar actividad cívico-militar",
    cuerpo: h("div", {},
      h("div", { class: "form-row" }, h("div", { class: "field" }, h("label", {}, "Fecha"), fecha), h("div", { class: "field" }, h("label", {}, "Lugar"), lugar)),
      h("div", { class: "form-row" }, h("div", { class: "field", style: "flex:0 0 160px" }, h("label", {}, "Tipo"), tipo), h("div", { class: "field" }, h("label", {}, "Descripción"), descripcion)),
      h("div", { class: "form-row" }, h("div", { class: "field", style: "flex:0 0 160px" }, h("label", {}, "Beneficiarios (aprox.)"), beneficiarios))),
    acciones: [
      { texto: "Cancelar", clase: "btn--ghost", valor: null },
      {
        texto: "💾 Guardar", clase: "btn--primary", valor: "ok",
        onClick: async () => {
          if (!descripcion.value.trim()) { toast("Indica una descripción", "err"); return false; }
          try {
            await ctx.db.crear(TABLA, { fecha: fecha.value, lugar: lugar.value.trim(), tipo: tipo.value, descripcion: descripcion.value.trim(), beneficiarios: parseInt(beneficiarios.value) || 0, creado_por: ctx.sesion.user.id });
            toast("Actividad registrada", "ok");
            await cargar(); render();
          } catch (e) { console.error(e); toast("No se pudo guardar", "err"); }
        },
      },
    ],
  });
}

async function eliminar(a) {
  if (!await confirmar("¿Eliminar esta actividad?", { titulo: "Eliminar", textoOk: "Eliminar", peligro: true })) return;
  try { await ctx.db.eliminar(TABLA, a.id); toast("Eliminado", ""); await cargar(); render(); }
  catch { toast("No se pudo eliminar", "err"); }
}
