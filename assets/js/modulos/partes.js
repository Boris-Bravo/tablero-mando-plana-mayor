/*
 * partes.js — Módulo "Partes" (colaborativo).
 *
 * Dos partes de toda la unidad (Cuadros y Tropa, formato oficial, solo
 * mando) más un parte propio por sección (P-1…P-5 y demás puestos), con su
 * propio formato de matriz (columnas/filas libres) y periodicidad Diario /
 * Semanal / Mensual — cada sección arma y reutiliza su propio formato.
 */
import { h, limpiar, toast, modal, confirmar, fechaHoy, fechaLarga, idNuevo } from "../ui.js";
import { blobWord, descargar, escapar } from "../export-word.js";
import { esMando } from "../auth.js";

const TABLA = "partes";
const COLS_DEF = ["Efectivo", "Presentes", "Servicio", "Comisión", "Permiso", "Sanidad", "Arresto", "Otros"];
const FILAS_CUADROS = ["Tte. Coronel", "Mayor", "Capitán", "Teniente", "Subteniente", "Suboficiales", "Sargentos", "EE.CC."];
const COLS_TROPA = ['Comp. "A"', 'Comp. "B"', 'Comp. "C"', 'Comp. "D"', 'Comp. "E"'];
const FILAS_TROPA = ["Efectivo", "Guardia Cuartel", "Servicio Interno", "Comisión", "Francos", "Bajas", "No Forman", "Forman"];
const PERIODICIDADES = { diario: "Diario", semanal: "Semanal", mensual: "Mensual" };
const NOMBRES_TIPO = { cuadros: "Cuadros", tropa: "Tropa", personalizado: "Parte de Sección" };

function ajustesDefecto() {
  return {
    unidad: "", comandante: "", membreteTropa: ["", "", ""],
    cuadros: { columnas: [...COLS_DEF], filas: [...FILAS_CUADROS] },
    tropa: { columnas: [...COLS_TROPA], filas: [...FILAS_TROPA] },
    formatos: {}, // formatos personalizados guardados por sección: { "P-2": { columnas, filas } }
  };
}

let ctx, cont, perfil, ajustes, lista;
let f = { tipo: "todos", campo: "todos", periodicidad: "todos" };

export async function partesModulo(contenedor, contexto) {
  ctx = contexto; cont = contenedor; perfil = ctx.sesion.perfil;
  await cargar();
  const campoSugerido = ctx.parametroModulo?.campo;
  f.campo = (campoSugerido && campoSugerido !== "comando") ? campoSugerido : "todos";
  renderLista();
  return ctx.db.suscribir(TABLA, async () => { await cargar(); renderLista(); });
}

async function cargar() {
  ajustes = await ctx.db.leerAjustes("partes", ajustesDefecto());
  if (!ajustes.formatos) ajustes.formatos = {};
  const filaARow = await ctx.db.listar(TABLA);
  lista = filaARow.map(rowAParte);
}

function puedeEditarParte(p) {
  if (esMando(perfil)) return true;
  return perfil.rol === "jefe_campo" && p.campo && p.campo === perfil.campo;
}

// Traduce entre las columnas snake_case de la tabla y el objeto interno camelCase.
function rowAParte(r) {
  return {
    id: r.id, tipo: r.tipo, campo: r.campo || null, periodicidad: r.periodicidad || "diario",
    fecha: r.fecha, unidad: r.unidad, comandante: r.comandante,
    columnas: r.columnas || [], filas: r.filas || [], observaciones: r.observaciones || "",
    parteAl: r.parte_al || "", lugarFecha: r.lugar_fecha || "", firmas: r.firmas || null,
    creado: r.creado, actualizado: r.actualizado,
  };
}
function parteARow(p) {
  return {
    tipo: p.tipo, campo: p.campo || null, periodicidad: p.periodicidad || "diario",
    fecha: p.fecha, unidad: p.unidad, comandante: p.comandante,
    columnas: p.columnas, filas: p.filas, observaciones: p.observaciones,
    parte_al: p.parteAl || null, lugar_fecha: p.lugarFecha || null, firmas: p.firmas || null,
    actualizado: new Date().toISOString(),
  };
}

/* ================= LISTA / HISTORIAL ================= */
function renderLista() {
  limpiar(cont);
  const soyMiembroCampo = perfil.rol === "jefe_campo";
  cont.appendChild(h("div", { class: "page-head" },
    h("div", {},
      h("h2", {}, "🗒️ Partes"),
      h("div", { class: "sub" }, "Cuadros y Tropa de toda la unidad, más el parte propio de cada sección — compartido en vivo")),
    h("div", { class: "btn-row" },
      esMando(perfil) ? h("button", { class: "btn btn--primary", onclick: () => editarParte(nuevoParte("cuadros", null, "diario")) }, "＋ Cuadros") : null,
      esMando(perfil) ? h("button", { class: "btn btn--gold", onclick: () => editarParte(nuevoParte("tropa", null, "diario")) }, "＋ Tropa") : null,
      (esMando(perfil) || soyMiembroCampo) ? h("button", { class: "btn btn--ghost", onclick: nuevoParteSeccion }, "＋ Parte de Sección") : null)));

  const chips = h("div", { class: "chips", style: "margin-bottom:10px" });
  for (const [val, txt] of [["todos", "Todos"], ["cuadros", "Cuadros"], ["tropa", "Tropa"], ["personalizado", "De sección"]]) {
    chips.appendChild(h("span", { class: `chip ${f.tipo === val ? "active" : ""}`, onclick: () => { f.tipo = val; renderLista(); } }, txt));
  }
  cont.appendChild(chips);
  const chipsPer = h("div", { class: "chips", style: "margin-bottom:16px" });
  for (const [val, txt] of [["todos", "Toda periodicidad"], ["diario", "Diario"], ["semanal", "Semanal"], ["mensual", "Mensual"]]) {
    chipsPer.appendChild(h("span", { class: `chip ${f.periodicidad === val ? "active" : ""}`, onclick: () => { f.periodicidad = val; renderLista(); } }, txt));
  }
  cont.appendChild(chipsPer);

  const filtrados = lista
    .filter((p) => f.tipo === "todos" || p.tipo === f.tipo)
    .filter((p) => f.campo === "todos" || p.campo === f.campo)
    .filter((p) => f.periodicidad === "todos" || p.periodicidad === f.periodicidad)
    .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "") || new Date(b.creado) - new Date(a.creado));

  if (!filtrados.length) {
    cont.appendChild(h("div", { class: "vacio" },
      h("div", { class: "big" }, "🗒️"),
      h("p", {}, "Aún no hay partes registrados."),
      h("p", { class: "muted" }, "Crea el primero con los botones de arriba.")));
    return;
  }

  const cajaLista = h("div", { class: "list" });
  for (const p of filtrados) {
    const efectivo = totalColumna(p, "Efectivo");
    const presentes = totalColumna(p, "Presentes");
    const puedeEditar = puedeEditarParte(p);
    cajaLista.appendChild(h("div", { class: "list-item" },
      h("div", { class: "list-item__main" },
        h("span", { class: "list-item__title" },
          `${NOMBRES_TIPO[p.tipo]}${p.campo ? " — " + p.campo : ""} — ${fechaLarga(p.fecha)}`,
          h("span", { class: "tag", style: "margin-left:8px" }, PERIODICIDADES[p.periodicidad] || "Diario")),
        h("span", { class: "list-item__meta" }, p.tipo === "personalizado" ? (p.unidad || "Sin unidad indicada") : `${p.unidad || "Unidad no indicada"}  ·  Efectivo: ${efectivo}   Presentes: ${presentes}`)),
      h("div", { class: "list-item__actions" },
        h("button", { class: "btn btn--ghost btn--sm", onclick: () => (puedeEditar ? editarParte(structuredClone(p)) : verSoloLectura(p)) }, puedeEditar ? "✏️ Abrir" : "👁️ Ver"),
        h("button", { class: "btn btn--gold btn--sm", onclick: () => exportarWord(p) }, "📄 Word"),
        puedeEditar ? h("button", { class: "btn btn--danger btn--sm", onclick: () => eliminarParte(p) }, "🗑️") : null)));
  }
  cont.appendChild(cajaLista);
}

function nuevoParte(tipo, campoParte, periodicidad) {
  let cfg;
  if (tipo === "personalizado") {
    cfg = ajustes.formatos[campoParte] || { columnas: ["Cantidad"], filas: ["Concepto 1"] };
  } else {
    cfg = ajustes[tipo];
  }
  const base = {
    id: null, tipo, campo: campoParte || null, periodicidad: periodicidad || "diario",
    fecha: fechaHoy(), unidad: ajustes.unidad || "", comandante: ajustes.comandante || "",
    columnas: [...cfg.columnas], filas: cfg.filas.map((nombre) => ({ nombre, valores: {} })),
    observaciones: "", _nuevo: true,
  };
  if (tipo === "tropa") Object.assign(base, {
    parteAl: ajustes.parteAlDef || "", lugarFecha: "",
    firmas: { firma1Nombre: "", firma1Cargo: ajustes.firma1CargoDef || "2do. Comandante", firma2Nombre: "", firma2Cargo: ajustes.firma2CargoDef || "Comandante del Regimiento" },
  });
  return base;
}

// Modal para elegir Campo (si es mando) y Periodicidad antes de crear un parte de sección.
function nuevoParteSeccion() {
  const soyMiembroCampo = perfil.rol === "jefe_campo";
  const campoFijo = soyMiembroCampo ? perfil.campo : null;
  const campoInp = campoFijo
    ? h("input", { type: "text", value: campoFijo, disabled: true })
    : h("input", { type: "text", placeholder: "Ej.: P-2, radio-operador…" });
  const periodicidadSel = h("select", {}, ...Object.entries(PERIODICIDADES).map(([v, t]) => h("option", { value: v }, t)));

  modal({
    titulo: "＋ Nuevo Parte de Sección",
    cuerpo: h("div", {},
      h("div", { class: "form-row" }, h("div", { class: "field" }, h("label", {}, "Sección"), campoInp), h("div", { class: "field" }, h("label", {}, "Periodicidad"), periodicidadSel)),
      h("p", { class: "muted small" }, "Si ya guardaste un formato antes para esta sección, se reutiliza automáticamente.")),
    acciones: [
      { texto: "Cancelar", clase: "btn--ghost", valor: null },
      {
        texto: "Continuar", clase: "btn--primary", valor: "ok",
        onClick: () => {
          const campoVal = (campoFijo || campoInp.value.trim());
          if (!campoVal) { toast("Indica la sección", "err"); return false; }
          editarParte(nuevoParte("personalizado", campoVal, periodicidadSel.value));
        },
      },
    ],
  });
}

async function eliminarParte(p) {
  if (!await confirmar(`¿Eliminar el parte del ${fechaLarga(p.fecha)}?`, { titulo: "Eliminar parte", textoOk: "Eliminar", peligro: true })) return;
  try { await ctx.db.eliminar(TABLA, p.id); toast("Parte eliminado", ""); await cargar(); renderLista(); }
  catch { toast("No se pudo eliminar", "err"); }
}

function verSoloLectura(p) {
  limpiar(cont);
  cont.appendChild(h("div", { class: "page-head" },
    h("div", {}, h("h2", {}, `${NOMBRES_TIPO[p.tipo]}${p.campo ? " — " + p.campo : ""}`), h("div", { class: "sub" }, `${fechaLarga(p.fecha)} · ${PERIODICIDADES[p.periodicidad] || "Diario"}`)),
    h("button", { class: "btn btn--ghost", onclick: renderLista }, "← Volver al historial")));
  const wrap = h("div", { class: "tabla-wrap" });
  const tabla = h("table", { class: "data" });
  wrap.appendChild(tabla);
  cont.appendChild(h("div", { class: "panel" }, h("h3", {}, "Estado de fuerza"), wrap));
  pintarTabla(p, tabla, true);
  if (p.observaciones) cont.appendChild(h("div", { class: "panel" }, h("h3", {}, "Observaciones"), h("p", {}, p.observaciones)));
}

/* ================= EDITOR ================= */
function editarParte(parte) {
  limpiar(cont);
  if (parte.tipo === "tropa") {
    parte.parteAl ??= ""; parte.lugarFecha ??= "";
    parte.firmas ??= { firma1Nombre: "", firma1Cargo: "2do. Comandante", firma2Nombre: "", firma2Cargo: "Comandante del Regimiento" };
  }

  cont.appendChild(h("div", { class: "page-head" },
    h("div", {}, h("h2", {}, `${NOMBRES_TIPO[parte.tipo]}${parte.campo ? " — " + parte.campo : ""}`), h("div", { class: "sub" }, "Completa los datos y las cantidades por estado")),
    h("div", { class: "btn-row" },
      parte.tipo === "tropa" ? h("button", { class: "btn btn--ghost", onclick: () => editarMembrete(parte) }, "🏛️ Membrete") : null,
      h("button", { class: "btn btn--ghost", onclick: renderLista }, "← Volver al historial"))));

  const panelDatos = h("div", { class: "panel" }, h("h3", {}, "Datos del parte"));
  const fUnidad = campoInput("Unidad / Regimiento", "text", parte.unidad, (v) => parte.unidad = v);
  const fFecha = campoInput("Fecha", "date", parte.fecha, (v) => parte.fecha = v);
  const fCmdte = campoInput("Elabora / Firma", "text", parte.comandante, (v) => parte.comandante = v);
  panelDatos.appendChild(h("div", { class: "form-row" }, fUnidad, fFecha, fCmdte));
  if (parte.tipo === "personalizado") {
    const selPer = h("select", {}, ...Object.entries(PERIODICIDADES).map(([v, t]) => h("option", { value: v, selected: v === parte.periodicidad }, t)));
    selPer.addEventListener("change", () => parte.periodicidad = selPer.value);
    panelDatos.appendChild(h("div", { class: "form-row" }, h("div", { class: "field", style: "flex:0 0 160px" }, h("label", {}, "Periodicidad"), selPer)));
  }
  if (parte.tipo === "tropa") {
    panelDatos.appendChild(h("div", { class: "form-row" },
      campoInput("Parte al…", "text", parte.parteAl, (v) => parte.parteAl = v),
      campoInput("Lugar y fecha (pie de firma)", "text", parte.lugarFecha, (v) => parte.lugarFecha = v)));
  }
  cont.appendChild(panelDatos);

  const panelTabla = h("div", { class: "panel" }, h("h3", {}, "Estado de fuerza"));
  const wrap = h("div", { class: "tabla-wrap" });
  const tabla = h("table", { class: "data" });
  wrap.appendChild(tabla);
  panelTabla.appendChild(wrap);
  panelTabla.appendChild(h("div", { class: "btn-row mt" },
    h("button", { class: "btn btn--ghost btn--sm", onclick: () => agregarFila(parte, tabla) }, "＋ Agregar fila"),
    h("button", { class: "btn btn--ghost btn--sm", onclick: () => agregarColumna(parte, tabla) }, "＋ Agregar columna (estado)")));
  cont.appendChild(panelTabla);
  pintarTabla(parte, tabla, false);

  if (parte.tipo === "tropa") {
    const panelFirmas = h("div", { class: "panel" }, h("h3", {}, "Firmas"));
    const fi = parte.firmas;
    panelFirmas.appendChild(h("div", { class: "form-row" }, campoInput("Nombre (firma 1)", "text", fi.firma1Nombre, (v) => fi.firma1Nombre = v), campoInput("Cargo (firma 1)", "text", fi.firma1Cargo, (v) => fi.firma1Cargo = v)));
    panelFirmas.appendChild(h("div", { class: "form-row" }, campoInput("Nombre (firma 2)", "text", fi.firma2Nombre, (v) => fi.firma2Nombre = v), campoInput("Cargo (firma 2)", "text", fi.firma2Cargo, (v) => fi.firma2Cargo = v)));
    cont.appendChild(panelFirmas);
  }

  const panelObs = h("div", { class: "panel" }, h("h3", {}, parte.tipo === "tropa" ? "Novedades (reverso — Demostración)" : "Observaciones"));
  if (parte.tipo === "tropa") panelObs.appendChild(h("p", { class: "muted small", style: "margin:0 0 8px" }, "Escribe aquí quién falta y por qué. Se imprime en la segunda página del Word."));
  const ta = h("textarea", { rows: parte.tipo === "tropa" ? "8" : "3", oninput: (e) => parte.observaciones = e.target.value }, parte.observaciones || "");
  panelObs.appendChild(h("div", { class: "field" }, ta));
  cont.appendChild(panelObs);

  cont.appendChild(h("div", { class: "btn-row" },
    h("button", { class: "btn btn--primary", onclick: () => guardarParte(parte) }, "💾 Guardar parte"),
    h("button", { class: "btn btn--gold", onclick: () => guardarParte(parte, true) }, "📄 Guardar y exportar a Word"),
    h("button", { class: "btn btn--ghost", onclick: renderLista }, "Cancelar")));
}

function campoInput(label, tipo, valor, onInput) {
  const input = h("input", { type: tipo, value: valor ?? "", oninput: (e) => onInput(e.target.value) });
  return h("div", { class: "field" }, h("label", {}, label), input);
}

function pintarTabla(parte, tabla, soloLectura) {
  limpiar(tabla);
  const thead = h("thead");
  const trh = h("tr");
  trh.appendChild(h("th", {}, parte.tipo === "cuadros" ? "Grado" : parte.tipo === "tropa" ? "Subunidad" : "Concepto"));
  parte.columnas.forEach((c) => {
    trh.appendChild(h("th", { class: "num" },
      h("div", { style: "display:flex;flex-direction:column;align-items:center;gap:2px" },
        h("span", {}, c),
        (!soloLectura && parte.columnas.length > 1) ? h("span", { style: "cursor:pointer;color:#f7d9d9;font-size:11px", title: "Quitar columna", onclick: () => quitarColumna(parte, tabla, c) }, "✕ quitar") : null)));
  });
  thead.appendChild(trh);
  tabla.appendChild(thead);

  const tbody = h("tbody");
  parte.filas.forEach((fila, i) => {
    const tr = h("tr");
    const tdNombre = h("td");
    if (soloLectura) tdNombre.textContent = fila.nombre;
    else tdNombre.appendChild(h("div", { style: "display:flex;align-items:center;gap:6px" },
      h("input", { class: "cell", style: "width:150px;text-align:left", value: fila.nombre, oninput: (e) => fila.nombre = e.target.value }),
      h("span", { style: "cursor:pointer;color:#b23", title: "Quitar fila", onclick: () => { parte.filas.splice(i, 1); pintarTabla(parte, tabla, soloLectura); } }, "✕")));
    tr.appendChild(tdNombre);
    const calculada = esFilaCalculada(parte, fila);
    parte.columnas.forEach((c) => {
      const td = h("td", { class: "num" });
      if (calculada || soloLectura) {
        td.textContent = String(calculada ? valorCalculadoFila(parte, fila, c) : (fila.valores[c] ?? 0));
        if (calculada) { td.dataset.calc = fila.nombre.trim().toLowerCase(); td.dataset.col = c; td.style.opacity = "0.85"; td.title = "Calculado automáticamente"; }
      } else {
        td.appendChild(h("input", { class: "cell", type: "number", min: "0", inputmode: "numeric", value: fila.valores[c] ?? "",
          oninput: (e) => { fila.valores[c] = e.target.value === "" ? "" : Math.max(0, parseInt(e.target.value) || 0); actualizarTotales(parte, tabla); } }));
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  tabla.appendChild(tbody);

  const tfoot = h("tfoot");
  const trf = h("tr");
  trf.appendChild(h("td", {}, "TOTAL"));
  parte.columnas.forEach((c) => trf.appendChild(h("td", { class: "num", dataset: { total: c } }, String(parte.tipo === "tropa" ? totalColumnaTropa(parte, c) : totalColumna(parte, c)))));
  tfoot.appendChild(trf);
  tabla.appendChild(tfoot);
}

function actualizarTotales(parte, tabla) {
  parte.columnas.forEach((c) => {
    const td = tabla.querySelector(`tfoot td[data-total="${cssEsc(c)}"]`);
    if (td) td.textContent = String(parte.tipo === "tropa" ? totalColumnaTropa(parte, c) : totalColumna(parte, c));
  });
  if (parte.tipo === "tropa") {
    parte.columnas.forEach((c) => {
      const tdNoForman = tabla.querySelector(`tbody td[data-calc="no forman"][data-col="${cssEsc(c)}"]`);
      if (tdNoForman) tdNoForman.textContent = String(noFormanValor(parte, c));
      const tdForman = tabla.querySelector(`tbody td[data-calc="forman"][data-col="${cssEsc(c)}"]`);
      if (tdForman) tdForman.textContent = String(formanValor(parte, c));
    });
  }
}
function cssEsc(s) { return String(s).replace(/"/g, '\\"'); }

function totalColumna(parte, col) { return (parte.filas || []).reduce((s, f) => s + (parseInt(f.valores?.[col]) || 0), 0); }
function totalFila(parte, fila) { return parte.columnas.reduce((s, c) => s + (parseInt(fila.valores?.[c]) || 0), 0); }

function esNombreFila(fila, nombre) { return (fila?.nombre || "").trim().toLowerCase() === nombre; }
function filaPorNombre(parte, nombre) { return (parte.filas || []).find((f) => esNombreFila(f, nombre)); }
function esFilaCalculada(parte, fila) { return parte.tipo === "tropa" && (esNombreFila(fila, "no forman") || esNombreFila(fila, "forman")); }
function noFormanValor(parte, col) {
  return (parte.filas || []).reduce((s, f) => {
    if (esNombreFila(f, "efectivo") || esNombreFila(f, "no forman") || esNombreFila(f, "forman")) return s;
    return s + (parseInt(f.valores?.[col]) || 0);
  }, 0);
}
function efectivoValor(parte, col) { const f = filaPorNombre(parte, "efectivo"); return f ? (parseInt(f.valores?.[col]) || 0) : 0; }
function formanValor(parte, col) { return Math.max(0, efectivoValor(parte, col) - noFormanValor(parte, col)); }
function valorCalculadoFila(parte, fila, col) {
  if (esNombreFila(fila, "no forman")) return noFormanValor(parte, col);
  if (esNombreFila(fila, "forman")) return formanValor(parte, col);
  return parseInt(fila.valores?.[col]) || 0;
}
function totalColumnaTropa(parte, col) { return efectivoValor(parte, col); }

async function agregarFila(parte, tabla) { parte.filas.push({ nombre: "Nuevo concepto", valores: {} }); pintarTabla(parte, tabla, false); }
async function agregarColumna(parte, tabla) {
  const nombre = await pedirTexto("Nombre del nuevo estado / columna", "Ej.: Licencia, Comisión, Hospital…");
  if (!nombre) return;
  if (parte.columnas.includes(nombre)) { toast("Esa columna ya existe", "err"); return; }
  parte.columnas.push(nombre); pintarTabla(parte, tabla, false);
}
async function quitarColumna(parte, tabla, col) {
  if (!await confirmar(`¿Quitar la columna "${col}"?`, { titulo: "Quitar columna", textoOk: "Quitar", peligro: true })) return;
  parte.columnas = parte.columnas.filter((c) => c !== col);
  parte.filas.forEach((f) => { delete f.valores[col]; });
  pintarTabla(parte, tabla, false);
}

async function editarMembrete(parte) {
  const m = ajustes.membreteTropa || ["", "", ""];
  const l1 = h("input", { type: "text", value: m[0] || "", placeholder: 'Ej.: OCTAVA DIVISIÓN DEL EJÉRCITO' });
  const l2 = h("input", { type: "text", value: m[1] || "", placeholder: 'Ej.: RPM-2 "TTE. AMEZAGA"' });
  const l3 = h("input", { type: "text", value: m[2] || "", placeholder: "Ej.: BOLIVIA" });
  const r = await modal({
    titulo: "🏛️ Membrete de la unidad",
    cuerpo: h("div", {},
      h("p", { class: "muted small", style: "margin:0 0 10px" }, "Se imprime arriba a la izquierda del Parte de Tropa exportado a Word."),
      h("div", { class: "field" }, h("label", {}, "Línea 1"), l1),
      h("div", { class: "field" }, h("label", {}, "Línea 2"), l2),
      h("div", { class: "field" }, h("label", {}, "Línea 3"), l3)),
    acciones: [{ texto: "Cancelar", clase: "btn--ghost", valor: null }, { texto: "💾 Guardar", clase: "btn--primary", valor: "__ok__" }],
  });
  if (r === "__ok__") {
    ajustes.membreteTropa = [l1.value.trim(), l2.value.trim(), l3.value.trim()];
    await ctx.db.guardarAjustes("partes", ajustes);
    toast("Membrete guardado", "ok");
  }
}

async function pedirTexto(titulo, placeholder) {
  const input = h("input", { type: "text", class: "cell", style: "width:100%;text-align:left;padding:10px", placeholder });
  const r = await modal({ titulo, cuerpo: h("div", { class: "field" }, input), acciones: [{ texto: "Cancelar", clase: "btn--ghost", valor: null }, { texto: "Agregar", clase: "btn--primary", valor: "__ok__" }] });
  return r === "__ok__" ? input.value.trim() : null;
}

async function guardarParte(parte, exportar = false) {
  if (!parte.fecha) { toast("Indica la fecha del parte", "err"); return; }
  ajustes.unidad = parte.unidad || ajustes.unidad;
  ajustes.comandante = parte.comandante || ajustes.comandante;
  if (parte.tipo === "personalizado" && parte.campo) {
    ajustes.formatos[parte.campo] = { columnas: [...parte.columnas], filas: parte.filas.map((f) => f.nombre) };
  } else {
    ajustes[parte.tipo] = { columnas: [...parte.columnas], filas: parte.filas.map((f) => f.nombre) };
  }
  if (parte.tipo === "tropa") {
    ajustes.parteAlDef = parte.parteAl || ajustes.parteAlDef;
    ajustes.firma1CargoDef = parte.firmas.firma1Cargo || ajustes.firma1CargoDef;
    ajustes.firma2CargoDef = parte.firmas.firma2Cargo || ajustes.firma2CargoDef;
  }
  await ctx.db.guardarAjustes("partes", ajustes);

  try {
    const row = parteARow(parte);
    if (parte.id) await ctx.db.actualizar(TABLA, parte.id, row);
    else await ctx.db.crear(TABLA, { ...row, creado_por: ctx.sesion.user.id });
    toast("Parte guardado", "ok");
    await cargar();
    if (exportar) await exportarWord(parte);
    else renderLista();
  } catch (e) { console.error(e); toast("No se pudo guardar el parte", "err"); }
}

/* ================= EXPORTAR A WORD ================= */
function construirCuerpoWord(p) {
  const titulo = p.tipo === "cuadros" ? "PARTE DE PERSONAL DE CUADROS" : p.tipo === "tropa" ? "PARTE DE PERSONAL DE TROPA" : `PARTE ${(PERIODICIDADES[p.periodicidad] || "").toUpperCase()} — ${(p.campo || "").toUpperCase()}`;
  let filas = "";
  p.filas.forEach((f) => {
    const celdas = p.columnas.map((c) => `<td class="num">${f.valores[c] ?? 0}</td>`).join("");
    filas += `<tr><td>${escapar(f.nombre)}</td>${celdas}<td class="num">${totalFila(p, f)}</td></tr>`;
  });
  const totalesCols = p.columnas.map((c) => `<td class="num">${totalColumna(p, c)}</td>`).join("");
  const totalGeneral = p.columnas.reduce((s, c) => s + totalColumna(p, c), 0);
  const encColumnas = p.columnas.map((c) => `<th class="num">${escapar(c)}</th>`).join("");
  return `
  <div class="encabezado"><div class="unidad">${escapar(p.unidad || "")}</div><h2>${titulo}</h2><div>Fecha: ${escapar(fechaLarga(p.fecha))}</div></div>
  <table><thead><tr><th>${p.tipo === "cuadros" ? "GRADO" : p.tipo === "tropa" ? "SUBUNIDAD" : "CONCEPTO"}</th>${encColumnas}<th class="num">TOTAL</th></tr></thead>
  <tbody>${filas}</tbody><tfoot><tr><td>TOTAL</td>${totalesCols}<td class="num">${totalGeneral}</td></tr></tfoot></table>
  ${p.observaciones ? `<div class="obs"><b>Observaciones:</b><br>${escapar(p.observaciones).replace(/\n/g, "<br>")}</div>` : ""}
  <div class="firma"><div class="linea"></div><div>${escapar(p.comandante || "")}</div><div class="small">2do Comandante</div></div>`;
}

const OPTS_TROPA = { size: "21.59cm 27.94cm", margin: "0.75cm 2cm 1cm 2.75cm", font: '"Arial", sans-serif', fontSize: "10pt" };

function firmaBloque(nombre, cargo) {
  return `<td style="border:none;text-align:center;width:50%;padding-top:0"><div style="border-top:1px solid #000;width:190pt;margin:0 auto 3pt"></div><div style="font-weight:bold">${escapar(nombre || "")}</div><div class="small">${escapar(cargo)}</div></td>`;
}

function construirCuerpoWordTropaOficial(p) {
  const m = ajustes.membreteTropa || ["", "", ""];
  let filas = "";
  p.filas.forEach((f) => {
    const celdas = p.columnas.map((c) => `<td class="num">${valorCalculadoFila(p, f, c)}</td>`).join("");
    const totalF = p.columnas.reduce((s, c) => s + valorCalculadoFila(p, f, c), 0);
    filas += `<tr><td>${escapar(f.nombre)}</td>${celdas}<td class="num">${totalF}</td></tr>`;
  });
  const totalesCols = p.columnas.map((c) => `<td class="num">${totalColumnaTropa(p, c)}</td>`).join("");
  const totalGeneral = p.columnas.reduce((s, c) => s + totalColumnaTropa(p, c), 0);
  const encColumnas = p.columnas.map((c) => `<th class="num">${escapar(c)}</th>`).join("");
  const fi = p.firmas || {};
  return `
  <div style="font-weight:bold;font-size:10pt;line-height:1.15">${m.map((l) => l ? `<div>${escapar(l)}</div>` : "").join("")}</div>
  <h1 style="margin-top:10pt">PARTE DE RELEVO</h1>
  ${p.parteAl ? `<div style="text-align:center">${escapar(p.parteAl)}</div>` : ""}
  <table style="margin-top:12pt"><thead><tr><th>DETALLE</th>${encColumnas}<th class="num">TOTAL</th></tr></thead>
  <tbody>${filas}</tbody><tfoot><tr><td>TOTAL</td>${totalesCols}<td class="num">${totalGeneral}</td></tr></tfoot></table>
  ${p.lugarFecha ? `<div style="text-align:center;margin-top:20pt">${escapar(p.lugarFecha)}</div>` : ""}
  <table style="border:none;width:100%;margin-top:40pt"><tr>${firmaBloque(fi.firma1Nombre, fi.firma1Cargo || "")}${firmaBloque(fi.firma2Nombre, fi.firma2Cargo || "")}</tr></table>
  <div style="page-break-before:always"><h2>DEMOSTRACIÓN</h2><div>${p.observaciones ? escapar(p.observaciones).replace(/\n/g, "<br>") : '<span class="small">Sin novedades.</span>'}</div></div>`;
}

async function exportarWord(p) {
  const nombreArchivo = `Parte_${p.tipo}${p.campo ? "_" + p.campo : ""}_${p.fecha}.doc`;
  const tituloDoc = `Parte ${p.tipo}${p.campo ? " " + p.campo : ""} ${p.fecha}`;
  const blob = p.tipo === "tropa" ? blobWord(tituloDoc, construirCuerpoWordTropaOficial(p), OPTS_TROPA) : blobWord(tituloDoc, construirCuerpoWord(p));
  descargar(blob, nombreArchivo);
  toast("Word exportado", "ok");
}
