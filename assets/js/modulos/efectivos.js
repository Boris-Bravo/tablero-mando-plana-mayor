/*
 * efectivos.js — Módulo "Registro de Efectivos y Hojas de Vida" (P-1),
 * formato SIPE: 01-IDENTIFICACIÓN (foto, grado y arma, apellidos, nombres,
 * CI) y 02-ANTECEDENTES (Tipo | Día | Mes | Año | Motivo | Impuesto por).
 *
 * Es la base sobre la que se apoyan Vacaciones/Permisos y Falta a Lista /
 * Bajas Médicas (ambos referencian una persona de esta tabla).
 */
import { h, limpiar, toast, modal, confirmar, idNuevo } from "../ui.js";
import { puedeEditarCampo } from "../auth.js";

const TABLA = "personal";
const TABLA_ANTECEDENTES = "personal_antecedentes";
const CAMPO = "P-1";
const SITUACIONES = { activo: "Activo", baja: "Baja", comision: "En comisión", otro: "Otro" };
const TIPOS_ANTECEDENTE = { merito: "Mérito", demerito: "Demérito", otro: "Otro" };

let ctx, cont, perfil, lista, filtro = { texto: "", situacion: "todos" };

export async function efectivosModulo(contenedor, contexto) {
  ctx = contexto; cont = contenedor; perfil = ctx.sesion.perfil;
  await cargar();
  render();
  return ctx.db.suscribir(TABLA, async () => { await cargar(); render(); });
}

async function cargar() { lista = await ctx.db.listar(TABLA, { orden: "nombre", ascendente: true }); }

function nombreCompleto(p) { return `${p.apellidos ? p.apellidos + " " : ""}${p.nombre}`.trim(); }

function render() {
  limpiar(cont);
  const puedeEscribir = puedeEditarCampo(perfil, CAMPO);
  cont.appendChild(h("div", { class: "page-head" },
    h("div", {}, h("h2", {}, "🧑‍🤝‍🧑 Registro de Efectivos"), h("div", { class: "sub" }, "Hoja de vida de cada integrante de la unidad")),
    puedeEscribir ? h("button", { class: "btn btn--primary", onclick: () => abrirEditor(nuevo(), true) }, "＋ Agregar persona") : null));

  const fila = h("div", { class: "form-row" },
    h("div", { class: "field" }, h("label", {}, "Buscar"),
      h("input", { type: "search", placeholder: "Nombre, grado, arma…", value: filtro.texto, oninput: (e) => { filtro.texto = e.target.value; repintar(); } })),
    h("div", { class: "field", style: "flex:0 0 160px" }, h("label", {}, "Situación"),
      h("select", { onchange: (e) => { filtro.situacion = e.target.value; repintar(); } },
        ...[["todos", "Todos"], ...Object.entries(SITUACIONES)].map(([v, t]) => h("option", { value: v, selected: v === filtro.situacion }, t)))));
  cont.appendChild(h("div", { class: "panel", style: "padding:14px 18px" }, fila));

  cont.appendChild(h("div", { id: "efectivosWrap" }));
  repintar();
}

function filtrados() {
  const t = filtro.texto.trim().toLowerCase();
  return lista
    .filter((p) => filtro.situacion === "todos" || p.situacion === filtro.situacion)
    .filter((p) => !t || [p.nombre, p.apellidos, p.grado, p.arma_especialidad].some((x) => (x || "").toLowerCase().includes(t)));
}

function repintar() {
  const wrap = document.getElementById("efectivosWrap");
  if (!wrap) return;
  limpiar(wrap);
  const filas = filtrados();
  if (!filas.length) {
    wrap.appendChild(h("div", { class: "vacio" }, h("div", { class: "big" }, "🧑‍🤝‍🧑"), h("p", {}, lista.length ? "Nadie coincide con el filtro." : "Aún no hay personal registrado.")));
    return;
  }
  const puedeEscribir = puedeEditarCampo(perfil, CAMPO);
  const tabla = h("table", { class: "data" });
  tabla.appendChild(h("thead", {}, h("tr", {}, h("th", {}, "Apellidos y nombres"), h("th", {}, "Grado"), h("th", {}, "Arma / Especialidad"), h("th", {}, "Situación"), h("th", {}, "Acciones"))));
  const tbody = h("tbody");
  for (const p of filas) {
    tbody.appendChild(h("tr", {},
      h("td", {}, nombreCompleto(p)), h("td", {}, p.grado || "—"), h("td", {}, p.arma_especialidad || "—"),
      h("td", {}, h("span", { class: `tag ${p.situacion === "activo" ? "tag--ok" : p.situacion === "baja" ? "tag--venc" : "tag--pend"}` }, SITUACIONES[p.situacion] || p.situacion)),
      h("td", {}, h("div", { style: "display:flex;gap:6px" },
        h("button", { class: "btn btn--ghost btn--sm", onclick: () => verHoja(p) }, "🪖 Hoja de vida"),
        puedeEscribir ? h("button", { class: "btn btn--gold btn--sm", onclick: () => abrirEditor(structuredClone(p), false) }, "✏️") : null,
        puedeEscribir ? h("button", { class: "btn btn--danger btn--sm", onclick: () => eliminar(p) }, "🗑️") : null))));
  }
  tabla.appendChild(tbody);
  wrap.appendChild(h("div", { class: "tabla-wrap" }, tabla));
}

function nuevo() { return { id: null, apellidos: "", nombre: "", grado: "", arma_especialidad: "", ci: "", fecha_nacimiento: "", fecha_alta: "", situacion: "activo", telefono: "", direccion: "", notas: "", foto_url: "" }; }

/* ---------- Hoja de Vida: 01-Identificación / 02-Antecedentes ---------- */
async function verHoja(p) {
  const puedeEscribir = puedeEditarCampo(perfil, CAMPO);
  let antecedentes = [];
  try { antecedentes = (await ctx.db.listar(TABLA_ANTECEDENTES)).filter((a) => a.personal_id === p.id); } catch (e) { console.error(e); }

  const cuerpo = h("div", {});
  cuerpo.appendChild(h("h3", { style: "margin:0 0 10px;font-size:13px;color:var(--cyan)" }, "01 — Identificación"));
  const filaFoto = h("div", { style: "display:flex;gap:16px;align-items:flex-start;margin-bottom:10px" });
  filaFoto.appendChild(h("img", { src: p.foto_url || "assets/icons/icon.svg", alt: "", style: "width:84px;height:84px;object-fit:cover;border-radius:10px;border:1px solid var(--linea);background:var(--panel-2)" }));
  filaFoto.appendChild(h("div", {},
    h("p", { style: "margin:0 0 4px" }, h("b", {}, "Grado y arma: "), `${p.grado || "—"}${p.arma_especialidad ? " / " + p.arma_especialidad : ""}`),
    h("p", { style: "margin:0 0 4px" }, h("b", {}, "Apellidos: "), p.apellidos || "—"),
    h("p", { style: "margin:0 0 4px" }, h("b", {}, "Nombres: "), p.nombre || "—"),
    h("p", { style: "margin:0" }, h("b", {}, "Cédula de identidad: "), p.ci || "—")));
  cuerpo.appendChild(filaFoto);
  cuerpo.appendChild(h("p", { class: "muted small", style: "margin:0 0 14px" },
    `Fecha de nacimiento: ${p.fecha_nacimiento || "—"} · Fecha de alta: ${p.fecha_alta || "—"} · Situación: ${SITUACIONES[p.situacion] || p.situacion}`));

  cuerpo.appendChild(h("h3", { style: "margin:14px 0 10px;font-size:13px;color:var(--cyan)" }, "02 — Antecedentes"));
  const wrapAnt = h("div", {});
  function pintarAntecedentes() {
    limpiar(wrapAnt);
    if (!antecedentes.length) { wrapAnt.appendChild(h("p", { class: "muted small" }, "Sin antecedentes registrados.")); return; }
    const tabla = h("table", { class: "data" });
    tabla.appendChild(h("thead", {}, h("tr", {}, h("th", {}, "Tipo"), h("th", {}, "Fecha"), h("th", {}, "Motivo o detalle"), h("th", {}, "Impuesto por"), puedeEscribir ? h("th", {}, "") : null)));
    const tbody = h("tbody");
    for (const a of antecedentes.sort((x, y) => new Date(y.fecha) - new Date(x.fecha))) {
      tbody.appendChild(h("tr", {},
        h("td", {}, h("span", { class: `tag ${a.tipo === "merito" ? "tag--ok" : a.tipo === "demerito" ? "tag--venc" : "tag--pend"}` }, TIPOS_ANTECEDENTE[a.tipo])),
        h("td", {}, a.fecha), h("td", {}, a.motivo), h("td", {}, a.impuesto_por || "—"),
        puedeEscribir ? h("td", {}, h("button", { class: "btn btn--danger btn--sm", onclick: async () => { await ctx.db.eliminar(TABLA_ANTECEDENTES, a.id); antecedentes = antecedentes.filter((x) => x.id !== a.id); pintarAntecedentes(); } }, "🗑️")) : null));
    }
    tabla.appendChild(tbody);
    wrapAnt.appendChild(h("div", { class: "tabla-wrap" }, tabla));
  }
  pintarAntecedentes();
  cuerpo.appendChild(wrapAnt);

  if (puedeEscribir) {
    cuerpo.appendChild(h("div", { class: "btn-row mt" },
      h("button", { class: "btn btn--ghost btn--sm", onclick: () => abrirEditorAntecedente(p, antecedentes, pintarAntecedentes) }, "＋ Añadir antecedente")));
  }

  await modal({ titulo: `🪖 Hoja de Vida — ${nombreCompleto(p)}`, cuerpo, acciones: [{ texto: "Cerrar", clase: "btn--ghost", valor: null }] });
}

function abrirEditorAntecedente(persona, antecedentes, refrescar) {
  const tipo = h("select", {}, ...Object.entries(TIPOS_ANTECEDENTE).map(([v, t]) => h("option", { value: v }, t)));
  const fecha = h("input", { type: "date" });
  const motivo = h("input", { type: "text", placeholder: "Motivo o detalle" });
  const impuestoPor = h("input", { type: "text", placeholder: "Quién lo impuso (opcional)" });
  modal({
    titulo: "＋ Añadir antecedente",
    cuerpo: h("div", {},
      h("div", { class: "form-row" }, h("div", { class: "field" }, h("label", {}, "Tipo"), tipo), h("div", { class: "field" }, h("label", {}, "Fecha"), fecha)),
      h("div", { class: "form-row" }, h("div", { class: "field" }, h("label", {}, "Motivo o detalle"), motivo)),
      h("div", { class: "form-row" }, h("div", { class: "field" }, h("label", {}, "Impuesto por"), impuestoPor))),
    acciones: [
      { texto: "Cancelar", clase: "btn--ghost", valor: null },
      {
        texto: "💾 Guardar", clase: "btn--primary", valor: "ok",
        onClick: async () => {
          if (!fecha.value || !motivo.value.trim()) { toast("Indica fecha y motivo", "err"); return false; }
          try {
            const creado = await ctx.db.crear(TABLA_ANTECEDENTES, {
              personal_id: persona.id, tipo: tipo.value, fecha: fecha.value, motivo: motivo.value.trim(),
              impuesto_por: impuestoPor.value.trim(), creado_por: ctx.sesion.user.id,
            });
            antecedentes.push(creado);
            toast("Antecedente registrado", "ok");
            refrescar();
          } catch (e) { console.error(e); toast("No se pudo registrar", "err"); }
        },
      },
    ],
  });
}

/* ---------- Crear / editar persona ---------- */
function abrirEditor(p, esNueva) {
  const apellidos = h("input", { type: "text", value: p.apellidos || "", placeholder: "Apellidos" });
  const nombre = h("input", { type: "text", value: p.nombre, placeholder: "Nombres" });
  const grado = h("input", { type: "text", value: p.grado || "", placeholder: "Ej.: Capitán" });
  const arma = h("input", { type: "text", value: p.arma_especialidad || "", placeholder: "Ej.: Infantería, Comunicaciones…" });
  const ci = h("input", { type: "text", value: p.ci || "" });
  const nacimiento = h("input", { type: "date", value: p.fecha_nacimiento || "" });
  const alta = h("input", { type: "date", value: p.fecha_alta || "" });
  const situacion = h("select", {}, ...Object.entries(SITUACIONES).map(([v, t]) => h("option", { value: v, selected: v === p.situacion }, t)));
  const telefono = h("input", { type: "text", value: p.telefono || "" });
  const direccion = h("input", { type: "text", value: p.direccion || "" });
  const notas = h("textarea", { rows: "3" }, p.notas || "");
  const foto = h("input", { type: "file", accept: "image/*", style: "display:none" });
  const fotoPrev = h("img", { src: p.foto_url || "assets/icons/icon.svg", style: "width:56px;height:56px;object-fit:cover;border-radius:8px;border:1px solid var(--linea)" });
  let fotoFile = null;
  foto.addEventListener("change", () => { fotoFile = foto.files[0] || null; if (fotoFile) fotoPrev.src = URL.createObjectURL(fotoFile); });

  const cuerpo = h("div", {},
    h("div", { class: "form-row", style: "align-items:center" }, fotoPrev, h("label", { class: "btn btn--ghost btn--sm", style: "cursor:pointer" }, "📷 Foto", foto)),
    h("div", { class: "form-row" }, h("div", { class: "field" }, h("label", {}, "Apellidos"), apellidos), h("div", { class: "field" }, h("label", {}, "Nombres"), nombre)),
    h("div", { class: "form-row" }, h("div", { class: "field" }, h("label", {}, "Grado"), grado), h("div", { class: "field" }, h("label", {}, "Arma / Especialidad"), arma)),
    h("div", { class: "form-row" }, h("div", { class: "field" }, h("label", {}, "CI"), ci)),
    h("div", { class: "form-row" }, h("div", { class: "field" }, h("label", {}, "Fecha de nacimiento"), nacimiento), h("div", { class: "field" }, h("label", {}, "Fecha de alta"), alta)),
    h("div", { class: "form-row" }, h("div", { class: "field" }, h("label", {}, "Situación"), situacion)),
    h("div", { class: "form-row" }, h("div", { class: "field" }, h("label", {}, "Teléfono"), telefono), h("div", { class: "field" }, h("label", {}, "Dirección"), direccion)),
    h("div", { class: "form-row" }, h("div", { class: "field" }, h("label", {}, "Notas"), notas)));

  modal({
    titulo: esNueva ? "＋ Nueva persona" : "✏️ Editar persona",
    cuerpo,
    acciones: [
      { texto: "Cancelar", clase: "btn--ghost", valor: null },
      {
        texto: "💾 Guardar", clase: "btn--primary", valor: "ok",
        onClick: async () => {
          if (!nombre.value.trim()) { toast("Indica el nombre", "err"); return false; }
          let foto_url = p.foto_url || null;
          if (fotoFile) {
            try { foto_url = await ctx.db.subirArchivo(`personal/${idNuevo()}-${fotoFile.name}`, fotoFile); }
            catch (e) { console.error(e); toast("No se pudo subir la foto, se guarda sin ella", ""); }
          }
          const cambios = {
            apellidos: apellidos.value.trim(), nombre: nombre.value.trim(), grado: grado.value.trim(), arma_especialidad: arma.value.trim(), ci: ci.value.trim(),
            fecha_nacimiento: nacimiento.value || null, fecha_alta: alta.value || null, situacion: situacion.value,
            telefono: telefono.value.trim(), direccion: direccion.value.trim(), notas: notas.value.trim(), foto_url,
          };
          guardar(p, cambios);
        },
      },
    ],
  });
}

async function guardar(p, cambios) {
  try {
    if (p.id) await ctx.db.actualizar(TABLA, p.id, { ...cambios, actualizado: new Date().toISOString() });
    else await ctx.db.crear(TABLA, { ...cambios, creado_por: ctx.sesion.user.id });
    toast("Guardado", "ok");
    await cargar(); render();
  } catch (e) { console.error(e); toast("No se pudo guardar", "err"); }
}

async function eliminar(p) {
  if (!await confirmar(`¿Eliminar a "${nombreCompleto(p)}"? También se perderá su historial de vacaciones y faltas.`, { titulo: "Eliminar persona", textoOk: "Eliminar", peligro: true })) return;
  try { await ctx.db.eliminar(TABLA, p.id); toast("Eliminado", ""); await cargar(); render(); }
  catch { toast("No se pudo eliminar", "err"); }
}

