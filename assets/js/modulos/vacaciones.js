/*
 * vacaciones.js — Módulo "Vacaciones y Permisos" (P-1), formato SIPE.
 *
 * Por cada persona: Derecho anual (20 días hábiles) · Reserva colectiva
 * (5 días) · Vacación utilizada · Permisos descontados · Saldo disponible —
 * igual que el "Reporte individual de vacaciones" de SIPE — y una tabla de
 * movimientos con columnas Fecha | Tipo | Días | Efecto | Estado.
 */
import { h, limpiar, toast, modal, confirmar } from "../ui.js";
import { puedeEditarCampo } from "../auth.js";

const TABLA = "vacaciones_movimientos";
const CAMPO = "P-1";
const TIPOS = { vacacion: "Vacación", permiso: "Permiso", compensacion: "Compensación" };
const ESTADOS = { pendiente: "Pendiente", aprobado: "Aprobado", rechazado: "Rechazado" };
const EFECTO_DEF = { vacacion: "resta", permiso: "resta", compensacion: "suma" };

let ctx, cont, perfil, personas, movimientos, ajustes, personaSelId;

export async function vacacionesModulo(contenedor, contexto) {
  ctx = contexto; cont = contenedor; perfil = ctx.sesion.perfil;
  await cargar();
  if (!personaSelId && personas.length) personaSelId = personas[0].id;
  render();
  return ctx.db.suscribir(TABLA, async () => { await cargar(); render(); });
}

async function cargar() {
  [personas, movimientos, ajustes] = await Promise.all([
    ctx.db.listar("personal", { orden: "nombre", ascendente: true }),
    ctx.db.listar(TABLA),
    ctx.db.leerAjustes("personal", { derechoAnual: 20, reservaColectiva: 5 }),
  ]);
}

function movimientosDe(id) { return movimientos.filter((m) => m.personal_id === id).sort((a, b) => new Date(b.creado) - new Date(a.creado)); }

function resumenDe(id) {
  const anio = new Date().getFullYear();
  const deEsteAnio = (tipo, efecto) => movimientos
    .filter((m) => m.personal_id === id && m.tipo === tipo && m.efecto === efecto && m.estado === "aprobado" && new Date(m.creado).getFullYear() === anio)
    .reduce((s, m) => s + Number(m.dias || 0), 0);
  const derechoAnual = ajustes.derechoAnual || 20;
  const reservaColectiva = ajustes.reservaColectiva || 5;
  const vacacionUtilizada = deEsteAnio("vacacion", "resta");
  const permisosDescontados = deEsteAnio("permiso", "resta");
  const compensaciones = deEsteAnio("compensacion", "suma");
  const saldo = derechoAnual - reservaColectiva - vacacionUtilizada - permisosDescontados + compensaciones;
  return { derechoAnual, reservaColectiva, vacacionUtilizada, permisosDescontados, compensaciones, saldo };
}

function render() {
  limpiar(cont);
  const puedeEscribir = puedeEditarCampo(perfil, CAMPO);
  cont.appendChild(h("div", { class: "page-head" },
    h("div", {}, h("h2", {}, "🌴 Vacaciones y Permisos"), h("div", { class: "sub" }, "Reporte individual — mismo formato que usa la unidad"))));

  if (!personas.length) {
    cont.appendChild(h("div", { class: "vacio" }, h("div", { class: "big" }, "🌴"), h("p", {}, "Primero registra personas en “Registro de Efectivos”.")));
    return;
  }

  const sel = h("select", { onchange: (e) => { personaSelId = e.target.value; render(); } },
    ...personas.map((p) => h("option", { value: p.id, selected: p.id === personaSelId }, `${p.apellidos ? p.apellidos + " " : ""}${p.nombre}${p.grado ? " — " + p.grado : ""}`)));
  cont.appendChild(h("div", { class: "panel", style: "padding:14px 18px" }, h("div", { class: "field" }, h("label", {}, "Persona"), sel)));

  const persona = personas.find((p) => p.id === personaSelId);
  if (!persona) return;
  const r = resumenDe(persona.id);

  cont.appendChild(h("div", { class: "chips", style: "margin-bottom:14px" },
    resumenChip("Derecho anual", `${r.derechoAnual} días hábiles`, "var(--cyan)"),
    resumenChip("Reserva colectiva", `${r.reservaColectiva} días reservados`, "#ffca6e"),
    resumenChip("Vacación utilizada", `${r.vacacionUtilizada} días`, "#ffb02e"),
    resumenChip("Permisos descontados", `${r.permisosDescontados} a cuenta`, "#ffb02e"),
    resumenChip("Saldo disponible", `${r.saldo} días para programar`, r.saldo > 0 ? "var(--verde-ok)" : "var(--rojo-claro)")));

  if (puedeEscribir) {
    cont.appendChild(h("div", { class: "btn-row", style: "margin-bottom:14px" },
      h("button", { class: "btn btn--primary btn--sm", onclick: () => abrirEditor(persona, "vacacion") }, "＋ Registrar vacación"),
      h("button", { class: "btn btn--gold btn--sm", onclick: () => abrirEditor(persona, "permiso") }, "＋ Registrar permiso"),
      h("button", { class: "btn btn--ghost btn--sm", onclick: () => abrirEditor(persona, "compensacion") }, "＋ Registrar compensación")));
  }

  const historial = movimientosDe(persona.id);
  if (!historial.length) {
    cont.appendChild(h("p", { class: "muted", style: "text-align:center;padding:14px" }, "Sin movimientos registrados."));
    return;
  }

  const tabla = h("table", { class: "data" });
  tabla.appendChild(h("thead", {}, h("tr", {}, h("th", {}, "Fecha"), h("th", {}, "Tipo"), h("th", { class: "num" }, "Días"), h("th", {}, "Efecto"), h("th", {}, "Estado"), h("th", {}, "Acciones"))));
  const tbody = h("tbody");
  for (const m of historial) {
    tbody.appendChild(h("tr", {},
      h("td", {}, `${m.fecha_inicio || "—"}${m.fecha_fin ? " al " + m.fecha_fin : ""}`),
      h("td", {}, TIPOS[m.tipo], m.motivo ? h("div", { class: "muted small" }, m.motivo) : null),
      h("td", { class: "num" }, String(m.dias)),
      h("td", {}, h("span", { class: "tag", style: m.efecto === "suma" ? "background:rgba(70,209,127,.15);color:#7ff0ad" : "background:rgba(255,91,82,.15);color:var(--rojo-claro)" }, m.efecto === "suma" ? "➕ Suma" : "➖ Resta")),
      h("td", {}, puedeEscribir
        ? h("select", { onchange: (e) => cambiarEstado(m, e.target.value) }, ...Object.entries(ESTADOS).map(([v, t]) => h("option", { value: v, selected: v === m.estado }, t)))
        : h("span", { class: `tag ${m.estado === "aprobado" ? "tag--ok" : m.estado === "rechazado" ? "tag--venc" : "tag--pend"}` }, ESTADOS[m.estado])),
      h("td", {}, puedeEscribir ? h("button", { class: "btn btn--danger btn--sm", onclick: () => eliminar(m) }, "🗑️") : "—")));
  }
  tabla.appendChild(tbody);
  cont.appendChild(h("div", { class: "tabla-wrap" }, tabla));
}

function resumenChip(txt, valor, color) {
  return h("span", { class: "chip", style: `cursor:default;border-left:4px solid ${color};flex-direction:column;align-items:flex-start;gap:2px` },
    h("span", { class: "muted small" }, txt), h("b", { style: `color:${color}` }, valor));
}

function abrirEditor(persona, tipo) {
  const dias = h("input", { type: "number", min: "0", step: "0.5", value: "1" });
  const inicio = h("input", { type: "date" });
  const fin = h("input", { type: "date" });
  const motivo = h("input", { type: "text", placeholder: "Motivo (opcional)" });
  const efecto = h("select", {},
    h("option", { value: "resta", selected: EFECTO_DEF[tipo] === "resta" }, "➖ Resta del saldo"),
    h("option", { value: "suma", selected: EFECTO_DEF[tipo] === "suma" }, "➕ Suma al saldo"));
  const estado = h("select", {},
    ...Object.entries(ESTADOS).map(([v, t]) => h("option", { value: v, selected: v === "aprobado" }, t)));

  modal({
    titulo: `＋ ${TIPOS[tipo]} — ${persona.apellidos ? persona.apellidos + " " : ""}${persona.nombre}`,
    cuerpo: h("div", {},
      h("div", { class: "form-row" }, h("div", { class: "field" }, h("label", {}, "Fecha inicio"), inicio), h("div", { class: "field" }, h("label", {}, "Fecha fin"), fin)),
      h("div", { class: "form-row" },
        h("div", { class: "field" }, h("label", {}, "Días"), dias),
        h("div", { class: "field" }, h("label", {}, "Efecto"), efecto),
        h("div", { class: "field" }, h("label", {}, "Estado"), estado)),
      h("div", { class: "form-row" }, h("div", { class: "field" }, h("label", {}, "Motivo"), motivo))),
    acciones: [
      { texto: "Cancelar", clase: "btn--ghost", valor: null },
      {
        texto: "💾 Guardar", clase: "btn--primary", valor: "ok",
        onClick: async () => {
          const n = parseFloat(dias.value);
          if (!n || n <= 0) { toast("Indica cuántos días", "err"); return false; }
          try {
            await ctx.db.crear(TABLA, {
              personal_id: persona.id, tipo, dias: n, fecha_inicio: inicio.value || null, fecha_fin: fin.value || null,
              motivo: motivo.value.trim(), efecto: efecto.value, estado: estado.value, creado_por: ctx.sesion.user.id,
            });
            toast("Registrado", "ok");
            await cargar(); render();
          } catch (e) { console.error(e); toast("No se pudo registrar", "err"); }
        },
      },
    ],
  });
}

async function cambiarEstado(m, estado) {
  try { await ctx.db.actualizar(TABLA, m.id, { estado }); await cargar(); render(); }
  catch { toast("No se pudo actualizar", "err"); }
}

async function eliminar(m) {
  if (!await confirmar("¿Eliminar este movimiento?", { titulo: "Eliminar", textoOk: "Eliminar", peligro: true })) return;
  try { await ctx.db.eliminar(TABLA, m.id); toast("Eliminado", ""); await cargar(); render(); }
  catch { toast("No se pudo eliminar", "err"); }
}
