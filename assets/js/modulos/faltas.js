/*
 * faltas.js — Módulo "Falta a Lista y Bajas Médicas" (P-1).
 */
import { h, limpiar, toast, modal, confirmar } from "../ui.js";
import { puedeEditarCampo } from "../auth.js";

const TABLA = "faltas_medicas";
const CAMPO = "P-1";
const TIPOS = { falta: "Falta a lista", baja_medica: "Baja médica" };

let ctx, cont, perfil, personas, registros, filtroTipo = "todos";

export async function faltasModulo(contenedor, contexto) {
  ctx = contexto; cont = contenedor; perfil = ctx.sesion.perfil;
  await cargar();
  render();
  return ctx.db.suscribir(TABLA, async () => { await cargar(); render(); });
}

async function cargar() {
  [personas, registros] = await Promise.all([
    ctx.db.listar("personal", { orden: "nombre", ascendente: true }),
    ctx.db.listar(TABLA),
  ]);
}
function nombreDe(id) { const p = personas.find((x) => x.id === id); return p ? p.nombre : "—"; }

function render() {
  limpiar(cont);
  const puedeEscribir = puedeEditarCampo(perfil, CAMPO);
  cont.appendChild(h("div", { class: "page-head" },
    h("div", {}, h("h2", {}, "🏥 Falta a Lista y Bajas Médicas"), h("div", { class: "sub" }, "Control de ausencias del personal")),
    puedeEscribir ? h("button", { class: "btn btn--primary", onclick: () => abrirEditor() }, "＋ Registrar") : null));

  if (!personas.length) {
    cont.appendChild(h("div", { class: "vacio" }, h("div", { class: "big" }, "🏥"), h("p", {}, "Primero registra personas en “Registro de Efectivos”.")));
    return;
  }

  const chips = h("div", { class: "chips", style: "margin-bottom:16px" });
  for (const [val, txt] of [["todos", "Todos"], ["falta", "Faltas"], ["baja_medica", "Bajas médicas"]]) {
    chips.appendChild(h("span", { class: `chip ${filtroTipo === val ? "active" : ""}`, onclick: () => { filtroTipo = val; render(); } }, txt));
  }
  cont.appendChild(chips);

  const filtrados = registros.filter((r) => filtroTipo === "todos" || r.tipo === filtroTipo).sort((a, b) => new Date(b.fecha_inicio) - new Date(a.fecha_inicio));
  if (!filtrados.length) {
    cont.appendChild(h("p", { class: "muted", style: "text-align:center;padding:14px" }, "Sin registros."));
    return;
  }
  const lista = h("div", { class: "list" });
  for (const r of filtrados) {
    const activa = !r.fecha_fin || new Date(r.fecha_fin) >= new Date(new Date().toDateString());
    lista.appendChild(h("div", { class: "list-item" },
      h("div", { class: "list-item__main" },
        h("span", { class: "list-item__title" }, h("span", { class: `tag ${r.tipo === "baja_medica" ? "tag--venc" : "tag--pend"}` }, TIPOS[r.tipo]), " ", nombreDe(r.personal_id)),
        h("span", { class: "list-item__meta" }, `${r.fecha_inicio} ${r.fecha_fin ? "al " + r.fecha_fin : "(en curso)"}${r.motivo ? " · " + r.motivo : ""}`)),
      puedeEscribir ? h("div", { class: "list-item__actions" }, h("button", { class: "btn btn--danger btn--sm", onclick: () => eliminar(r) }, "🗑️")) : null));
  }
  cont.appendChild(lista);
}

function abrirEditor() {
  const persona = h("select", {}, ...personas.map((p) => h("option", { value: p.id }, p.nombre)));
  const tipo = h("select", {}, ...Object.entries(TIPOS).map(([v, t]) => h("option", { value: v }, t)));
  const inicio = h("input", { type: "date" });
  const fin = h("input", { type: "date" });
  const motivo = h("textarea", { rows: "2", placeholder: "Motivo" });

  modal({
    titulo: "＋ Registrar falta o baja médica",
    cuerpo: h("div", {},
      h("div", { class: "form-row" }, h("div", { class: "field" }, h("label", {}, "Persona"), persona), h("div", { class: "field" }, h("label", {}, "Tipo"), tipo)),
      h("div", { class: "form-row" }, h("div", { class: "field" }, h("label", {}, "Desde"), inicio), h("div", { class: "field" }, h("label", {}, "Hasta (opcional)"), fin)),
      h("div", { class: "form-row" }, h("div", { class: "field" }, h("label", {}, "Motivo"), motivo))),
    acciones: [
      { texto: "Cancelar", clase: "btn--ghost", valor: null },
      {
        texto: "💾 Guardar", clase: "btn--primary", valor: "ok",
        onClick: async () => {
          if (!inicio.value) { toast("Indica la fecha de inicio", "err"); return false; }
          try {
            await ctx.db.crear(TABLA, { personal_id: persona.value, tipo: tipo.value, fecha_inicio: inicio.value, fecha_fin: fin.value || null, motivo: motivo.value.trim(), creado_por: ctx.sesion.user.id });
            toast("Registrado", "ok");
            await cargar(); render();
          } catch (e) { console.error(e); toast("No se pudo registrar", "err"); }
        },
      },
    ],
  });
}

async function eliminar(r) {
  if (!await confirmar("¿Eliminar este registro?", { titulo: "Eliminar", textoOk: "Eliminar", peligro: true })) return;
  try { await ctx.db.eliminar(TABLA, r.id); toast("Eliminado", ""); await cargar(); render(); }
  catch { toast("No se pudo eliminar", "err"); }
}
