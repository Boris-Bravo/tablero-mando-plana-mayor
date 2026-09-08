/*
 * memorandums.js — Módulo "Memorandums" (formato calcado de SIPE).
 *
 * Felicitaciones: identificación, destinatario, motivo, firma.
 * Sanciones: identificación, destinatario, HECHOS, FUNDAMENTO (reglamento +
 * lista de faltas), SANCIÓN (tipo/duración/lugar/fechas de cumplimiento) y
 * firma — igual que el formulario real de SIPE, pero con flujo de estado
 * Borrador → Emitido → Anulado (SIPE solo tenía "Borrador" estático) y
 * exportación a Word, que SIPE no ofrece.
 */
import { h, limpiar, toast, modal, confirmar, fechaHoy, fechaLarga, idNuevo } from "../ui.js";
import { blobWord, descargar, escapar } from "../export-word.js";
import { esMando, etiquetaRol } from "../auth.js";

const TABLA = "memorandums";
const ESTADOS_TXT = { borrador: "Borrador", emitido: "Emitido", anulado: "Anulado" };
const TIPOS_SANCION = { arresto: "Arresto", llamada_atencion: "Llamada de atención", otra: "Otra medida autorizada" };
const MOTIVO_PLACEHOLDER = "Por haber demostrado profesionalismo, responsabilidad y espíritu de cuerpo...";
const HECHOS_PLACEHOLDER = "Por haber incumplido una disposición del servicio, conforme a los antecedentes demostrativos...";

let ctx, cont, perfil, lista, perfiles;
let filtro = "todos";

export async function memorandumsModulo(contenedor, contexto) {
  ctx = contexto; cont = contenedor; perfil = ctx.sesion.perfil;
  await cargar();
  render();
  return ctx.db.suscribir(TABLA, async (payload) => {
    if (payload.eventType === "INSERT" && payload.new.estado === "emitido" && payload.new.emitido_por !== ctx.sesion.user.id) {
      toast(`🎖️ Nuevo memorándum: ${payload.new.tipo === "felicitacion" ? "felicitación" : "sanción"} para ${payload.new.destinatario_nombre}`, "ok");
    }
    await cargar(); render();
  });
}

async function cargar() {
  [lista, perfiles] = await Promise.all([ctx.db.listar(TABLA), ctx.db.mapaPerfiles()]);
}
function nombreDe(id) { const p = perfiles.get(id); return p ? (p.nombre || etiquetaRol(p)) : "—"; }

/* =================== RENDER =================== */
function render() {
  limpiar(cont);
  cont.appendChild(h("div", { class: "page-head" },
    h("div", {}, h("h2", {}, "🎖️ Memorandums"), h("div", { class: "sub" }, "Felicitaciones y sanciones, visibles para toda la Plana Mayor")),
    esMando(perfil) ? h("div", { class: "btn-row" },
      h("button", { class: "btn btn--primary", onclick: () => abrirEditor(nuevo("felicitacion")) }, "＋ Felicitación"),
      h("button", { class: "btn btn--danger", onclick: () => abrirEditor(nuevo("sancion")) }, "＋ Sanción")) : null));

  const chips = h("div", { class: "chips", style: "margin-bottom:16px" });
  for (const [val, txt] of [["todos", "Todos"], ["felicitacion", "Felicitaciones"], ["sancion", "Sanciones"], ["borrador", "Borradores"]]) {
    chips.appendChild(h("span", { class: `chip ${filtro === val ? "active" : ""}`, onclick: () => { filtro = val; render(); } }, txt));
  }
  cont.appendChild(chips);

  const filtrados = lista
    .filter((m) => filtro === "todos" || m.tipo === filtro || m.estado === filtro)
    .sort((a, b) => new Date(b.creado) - new Date(a.creado));

  if (!filtrados.length) {
    cont.appendChild(h("div", { class: "vacio" }, h("div", { class: "big" }, "🎖️"), h("p", {}, "Aún no hay memorandums registrados.")));
    return;
  }

  const grid = h("div", { class: "list" });
  for (const m of filtrados) {
    grid.appendChild(h("div", { class: `list-item memo-card memo-card--${m.tipo}` },
      h("div", { class: "list-item__main" },
        h("span", { class: "list-item__title" }, m.tipo === "felicitacion" ? "🎖️ Felicitación" : "⚠️ Sanción", " — ", m.destinatario_nombre, m.destinatario_campo ? ` (${m.destinatario_campo})` : ""),
        h("span", { class: "list-item__meta" }, m.tipo === "sancion" ? (m.hechos || m.motivo || "") : m.motivo),
        h("span", { class: "list-item__meta" }, `${m.numero ? `N.° ${m.numero} · ` : ""}Emitido por ${nombreDe(m.emitido_por)} · ${m.fecha ? fechaLarga(m.fecha) : new Date(m.creado).toLocaleDateString("es")}`)),
      h("div", { style: "display:flex;align-items:center;gap:10px" },
        h("span", { class: `tag tag--${m.estado}` }, ESTADOS_TXT[m.estado]),
        accionesMemo(m))));
  }
  cont.appendChild(grid);
}

function accionesMemo(m) {
  const acciones = h("div", { class: "list-item__actions" });
  acciones.appendChild(h("button", { class: "btn btn--ghost btn--sm", onclick: () => verDetalle(m) }, "👁️"));
  if (m.estado === "emitido") acciones.appendChild(h("button", { class: "btn btn--gold btn--sm", title: "Exportar a Word", onclick: () => exportarWord(m) }, "📄"));
  if (!esMando(perfil)) return acciones;
  if (m.estado === "borrador") {
    acciones.appendChild(h("button", { class: "btn btn--gold btn--sm", onclick: () => abrirEditor({ ...m }) }, "✏️"));
    acciones.appendChild(h("button", { class: "btn btn--primary btn--sm", onclick: () => cambiarEstado(m, "emitido") }, "📤 Emitir"));
    acciones.appendChild(h("button", { class: "btn btn--danger btn--sm", onclick: () => eliminarMemo(m) }, "🗑️"));
  } else if (m.estado === "emitido") {
    acciones.appendChild(h("button", { class: "btn btn--danger btn--sm", onclick: () => cambiarEstado(m, "anulado") }, "🚫 Anular"));
  }
  return acciones;
}

function filaDetalle(label, valor) { return valor ? h("p", {}, h("b", {}, label + ": "), valor) : null; }

function verDetalle(m) {
  const cuerpo = h("div", {},
    h("p", { class: "muted small" }, `${m.seccion_emisora || ""}${m.numero ? ` N.° ${m.numero}` : ""}${m.gestion ? `/${m.gestion}` : ""}`),
    filaDetalle("Lugar y fecha", `${m.lugar || "—"}, ${m.fecha ? fechaLarga(m.fecha) : "—"}`),
    filaDetalle("Destinatario", `${m.destinatario_grado ? m.destinatario_grado + " " : ""}${m.destinatario_nombre}${m.cargo_destinatario ? " — " + m.cargo_destinatario : ""}`),
    filaDetalle("Campo / Unidad", m.destinatario_campo),
    m.tipo === "sancion" ? filaDetalle("Hechos", m.hechos) : filaDetalle("Motivo", m.motivo),
    m.tipo === "sancion" ? filaDetalle("Reglamento", m.reglamento) : null,
    m.tipo === "sancion" && m.faltas?.length ? h("div", {},
      h("b", {}, "Faltas:"),
      h("ul", { style: "margin:4px 0 10px" }, ...m.faltas.map((f) => h("li", {}, `Art. ${f.articulo || "—"} num. ${f.numeral || "—"} — ${f.descripcion || ""}`)))) : null,
    m.tipo === "sancion" ? filaDetalle("Sanción", `${TIPOS_SANCION[m.tipo_sancion] || "—"}${m.duracion ? " · " + m.duracion : ""}`) : null,
    m.tipo === "sancion" ? filaDetalle("Lugar de cumplimiento", m.lugar_cumplimiento) : null,
    m.tipo === "sancion" && (m.cumplimiento_inicio || m.cumplimiento_fin) ? filaDetalle("Cumplimiento", `${m.cumplimiento_inicio ? new Date(m.cumplimiento_inicio).toLocaleString("es") : "—"} a ${m.cumplimiento_fin ? new Date(m.cumplimiento_fin).toLocaleString("es") : "—"}`) : null,
    filaDetalle("Detalle", m.detalle),
    h("p", {}, h("b", {}, "Estado: "), ESTADOS_TXT[m.estado]),
    h("p", { class: "muted small" }, `Emitido por ${nombreDe(m.emitido_por)} el ${new Date(m.creado).toLocaleString("es")}`));

  modal({
    titulo: m.tipo === "felicitacion" ? "🎖️ Memorándum de Felicitación" : "⚠️ Memorándum de Sanción",
    cuerpo,
    acciones: [
      m.estado === "emitido" ? { texto: "📄 Exportar a Word", clase: "btn--gold", valor: "word", onClick: () => { exportarWord(m); return false; } } : null,
      { texto: "Cerrar", clase: "btn--ghost", valor: null },
    ].filter(Boolean),
  });
}

function nuevo(tipo) {
  return {
    id: null, tipo, seccion_emisora: "", numero: "", gestion: String(new Date().getFullYear()), lugar: "", fecha: fechaHoy(),
    destinatario_nombre: "", destinatario_grado: "", cargo_destinatario: "", destinatario_campo: "",
    motivo: "", detalle: "", hechos: "", reglamento: "Reglamento N.º 23", faltas: [],
    tipo_sancion: "arresto", duracion: "", lugar_cumplimiento: "", cumplimiento_inicio: "", cumplimiento_fin: "",
    estado: "borrador",
  };
}

/* =================== EDITOR =================== */
function abrirEditor(m) {
  const esSancion = m.tipo === "sancion";
  const seccion = h("input", { type: "text", value: m.seccion_emisora || "" });
  const numero = h("input", { type: "text", value: m.numero || "" });
  const gestion = h("input", { type: "text", value: m.gestion || String(new Date().getFullYear()), style: "max-width:100px" });
  const lugar = h("input", { type: "text", value: m.lugar || "", placeholder: "Ej.: La Paz" });
  const fecha = h("input", { type: "date", value: m.fecha || fechaHoy() });

  const dGrado = h("input", { type: "text", value: m.destinatario_grado || "", placeholder: "Ej.: Capitán" });
  const dNombre = h("input", { type: "text", value: m.destinatario_nombre || "", placeholder: "Apellidos y nombres" });
  const dCargo = h("input", { type: "text", value: m.cargo_destinatario || "", placeholder: "Cargo que ocupa" });
  const dCampo = h("input", { type: "text", value: m.destinatario_campo || "", placeholder: "Ej.: P-1, Compañía A…" });

  const cuerpo = h("div", {},
    h("h3", { style: "margin:0 0 10px;font-size:14px;color:var(--cyan)" }, "01 — Identificación"),
    h("div", { class: "form-row" },
      h("div", { class: "field" }, h("label", {}, "Sección emisora"), seccion),
      h("div", { class: "field" }, h("label", {}, "N.°"), numero),
      h("div", { class: "field", style: "flex:0 0 100px" }, h("label", {}, "Gestión"), gestion)),
    h("div", { class: "form-row" },
      h("div", { class: "field" }, h("label", {}, "Lugar"), lugar),
      h("div", { class: "field" }, h("label", {}, "Fecha"), fecha)),
    h("h3", { style: "margin:16px 0 10px;font-size:14px;color:var(--cyan)" }, "02 — Destinatario"),
    h("div", { class: "form-row" },
      h("div", { class: "field" }, h("label", {}, "Grado"), dGrado),
      h("div", { class: "field" }, h("label", {}, "Apellidos y nombres"), dNombre)),
    h("div", { class: "form-row" },
      h("div", { class: "field" }, h("label", {}, "Cargo"), dCargo),
      h("div", { class: "field" }, h("label", {}, "Campo / Unidad"), dCampo)));

  let motivo, hechos, reglamento, listaFaltas, faltas, tipoSancion, duracion, lugarCump, cumpInicio, cumpFin, detalle;

  if (!esSancion) {
    cont2("h3", "03 — Motivo");
    motivo = h("textarea", { rows: "3", placeholder: MOTIVO_PLACEHOLDER }, m.motivo || "");
    cuerpo.appendChild(h("div", { class: "form-row" }, h("div", { class: "field" }, motivo)));
  } else {
    cont2("h3", "03 — Hechos");
    hechos = h("textarea", { rows: "3", placeholder: HECHOS_PLACEHOLDER }, m.hechos || "");
    cuerpo.appendChild(h("div", { class: "form-row" }, h("div", { class: "field" }, hechos)));

    cont2("h3", "04 — Fundamento");
    reglamento = h("input", { type: "text", value: m.reglamento || "Reglamento N.º 23" });
    cuerpo.appendChild(h("div", { class: "form-row" }, h("div", { class: "field" }, h("label", {}, "Reglamento"), reglamento)));
    faltas = (m.faltas || []).map((f) => ({ ...f }));
    listaFaltas = h("div", { class: "list", style: "margin-bottom:8px" });
    function pintarFaltas() {
      limpiar(listaFaltas);
      faltas.forEach((f, i) => {
        const art = h("input", { type: "text", value: f.articulo || "", placeholder: "Artículo", style: "width:90px", oninput: (e) => f.articulo = e.target.value });
        const num = h("input", { type: "text", value: f.numeral || "", placeholder: "Numeral", style: "width:90px", oninput: (e) => f.numeral = e.target.value });
        const desc = h("input", { type: "text", value: f.descripcion || "", placeholder: "Descripción de la falta", style: "flex:1", oninput: (e) => f.descripcion = e.target.value });
        listaFaltas.appendChild(h("div", { class: "list-item", style: "padding:8px 10px;gap:8px" }, art, num, desc,
          h("button", { class: "btn btn--danger btn--sm", onclick: () => { faltas.splice(i, 1); pintarFaltas(); } }, "✕")));
      });
    }
    pintarFaltas();
    cuerpo.append(listaFaltas, h("div", { class: "btn-row", style: "margin-bottom:12px" },
      h("button", { class: "btn btn--ghost btn--sm", onclick: () => { faltas.push({ articulo: "", numeral: "", descripcion: "" }); pintarFaltas(); } }, "＋ Añadir falta")));

    cont2("h3", "05 — Sanción");
    tipoSancion = h("select", {}, ...Object.entries(TIPOS_SANCION).map(([v, t]) => h("option", { value: v, selected: v === m.tipo_sancion }, t)));
    duracion = h("input", { type: "text", value: m.duracion || "", placeholder: "Ej.: 3 días" });
    lugarCump = h("input", { type: "text", value: m.lugar_cumplimiento || "", placeholder: "Ej.: Cuartel, domicilio…" });
    cumpInicio = h("input", { type: "datetime-local", value: m.cumplimiento_inicio ? m.cumplimiento_inicio.slice(0, 16) : "" });
    cumpFin = h("input", { type: "datetime-local", value: m.cumplimiento_fin ? m.cumplimiento_fin.slice(0, 16) : "" });
    cuerpo.append(
      h("div", { class: "form-row" }, h("div", { class: "field" }, h("label", {}, "Tipo"), tipoSancion), h("div", { class: "field" }, h("label", {}, "Duración"), duracion)),
      h("div", { class: "form-row" }, h("div", { class: "field" }, h("label", {}, "Lugar de cumplimiento"), lugarCump)),
      h("div", { class: "form-row" },
        h("div", { class: "field" }, h("label", {}, "Inicio de cumplimiento"), cumpInicio),
        h("div", { class: "field" }, h("label", {}, "Conclusión"), cumpFin)));
  }

  function cont2(tag, txt) { cuerpo.appendChild(h(tag, { style: "margin:16px 0 10px;font-size:14px;color:var(--cyan)" }, txt)); }

  detalle = h("textarea", { rows: "2", placeholder: "Notas adicionales (opcional)" }, m.detalle || "");
  cuerpo.appendChild(h("div", { class: "form-row" }, h("div", { class: "field" }, h("label", {}, "Detalle / notas"), detalle)));

  function leer() {
    const base = {
      tipo: m.tipo, seccion_emisora: seccion.value.trim(), numero: numero.value.trim(), gestion: gestion.value.trim(),
      lugar: lugar.value.trim(), fecha: fecha.value || null,
      destinatario_grado: dGrado.value.trim(), destinatario_nombre: dNombre.value.trim(), cargo_destinatario: dCargo.value.trim(),
      destinatario_campo: dCampo.value.trim(), detalle: detalle.value.trim(),
    };
    if (!esSancion) return { ...base, motivo: motivo.value.trim() };
    return {
      ...base, motivo: (hechos.value.trim() || "").slice(0, 200), hechos: hechos.value.trim(), reglamento: reglamento.value.trim(),
      faltas: faltas.filter((f) => f.descripcion || f.articulo), tipo_sancion: tipoSancion.value, duracion: duracion.value.trim(),
      lugar_cumplimiento: lugarCump.value.trim(),
      cumplimiento_inicio: cumpInicio.value ? new Date(cumpInicio.value).toISOString() : null,
      cumplimiento_fin: cumpFin.value ? new Date(cumpFin.value).toISOString() : null,
    };
  }
  async function validarYGuardar(estadoDestino) {
    const cambios = leer();
    if (!cambios.destinatario_nombre) { toast("Indica el destinatario", "err"); return false; }
    if (!esSancion && !cambios.motivo) { toast("Indica el motivo", "err"); return false; }
    if (esSancion && !cambios.hechos) { toast("Describe los hechos", "err"); return false; }
    await guardarMemo(m, { ...cambios, estado: estadoDestino });
  }

  modal({
    titulo: (m.id ? "Editar " : "Nuevo ") + (esSancion ? "memorándum de sanción" : "memorándum de felicitación"),
    cuerpo,
    acciones: [
      { texto: "Cancelar", clase: "btn--ghost", valor: null },
      { texto: "💾 Guardar borrador", clase: "btn--ghost", valor: "borrador", onClick: () => validarYGuardar("borrador") },
      { texto: "📤 Guardar y emitir", clase: "btn--primary", valor: "emitido", onClick: () => validarYGuardar("emitido") },
    ],
  });
}

async function guardarMemo(m, cambios) {
  try {
    if (m.id) await ctx.db.actualizar(TABLA, m.id, { ...cambios, actualizado: new Date().toISOString() });
    else await ctx.db.crear(TABLA, { ...cambios, emitido_por: ctx.sesion.user.id });
    toast(cambios.estado === "emitido" ? "Memorándum emitido" : "Borrador guardado", "ok");
    await cargar(); render();
  } catch (e) { console.error(e); toast("No se pudo guardar", "err"); }
}

async function cambiarEstado(m, estado) {
  const verbo = estado === "emitido" ? "emitir" : "anular";
  if (!await confirmar(`¿Seguro que quieres ${verbo} este memorándum?`, { titulo: verbo === "anular" ? "Anular memorándum" : "Emitir memorándum", textoOk: verbo === "anular" ? "Anular" : "Emitir", peligro: estado === "anulado" })) return;
  try { await ctx.db.actualizar(TABLA, m.id, { estado, actualizado: new Date().toISOString() }); toast("Actualizado", "ok"); await cargar(); render(); }
  catch { toast("No se pudo actualizar", "err"); }
}

async function eliminarMemo(m) {
  if (!await confirmar("¿Eliminar este borrador?", { titulo: "Eliminar", textoOk: "Eliminar", peligro: true })) return;
  try { await ctx.db.eliminar(TABLA, m.id); toast("Eliminado", ""); await cargar(); render(); }
  catch { toast("No se pudo eliminar", "err"); }
}

/* =================== EXPORTAR A WORD =================== */
function exportarWord(m) {
  const titulo = m.tipo === "felicitacion" ? "MEMORÁNDUM DE FELICITACIÓN" : "MEMORÁNDUM DE SANCIÓN";
  const encabezado = `
    <div class="encabezado">
      <div class="unidad">${escapar(m.seccion_emisora || "")}</div>
      <h2>${titulo}</h2>
      <div>${m.numero ? `N.° ${escapar(m.numero)}${m.gestion ? "/" + escapar(m.gestion) : ""}` : ""}</div>
      <div>${escapar(m.lugar || "")}${m.lugar && m.fecha ? ", " : ""}${m.fecha ? escapar(fechaLarga(m.fecha)) : ""}</div>
    </div>`;
  const destinatario = `
    <p><b>Destinatario:</b> ${escapar(m.destinatario_grado || "")} ${escapar(m.destinatario_nombre || "")}${m.cargo_destinatario ? " — " + escapar(m.cargo_destinatario) : ""}</p>`;
  let cuerpo;
  if (m.tipo === "felicitacion") {
    cuerpo = `<p style="text-align:justify">${escapar(m.motivo || "").replace(/\n/g, "<br>")}</p>`;
  } else {
    const faltasHtml = (m.faltas || []).length
      ? `<ul>${m.faltas.map((f) => `<li>Art. ${escapar(f.articulo || "—")} num. ${escapar(f.numeral || "—")} — ${escapar(f.descripcion || "")}</li>`).join("")}</ul>`
      : "";
    cuerpo = `
      <p><b>HECHOS:</b></p><p style="text-align:justify">${escapar(m.hechos || "").replace(/\n/g, "<br>")}</p>
      <p><b>FUNDAMENTO:</b> ${escapar(m.reglamento || "")}</p>${faltasHtml}
      <p><b>SANCIÓN:</b> ${escapar(TIPOS_SANCION[m.tipo_sancion] || "")}${m.duracion ? " — " + escapar(m.duracion) : ""}</p>
      ${m.lugar_cumplimiento ? `<p><b>Lugar de cumplimiento:</b> ${escapar(m.lugar_cumplimiento)}</p>` : ""}
      ${(m.cumplimiento_inicio || m.cumplimiento_fin) ? `<p><b>Cumplimiento:</b> ${m.cumplimiento_inicio ? escapar(new Date(m.cumplimiento_inicio).toLocaleString("es")) : "—"} a ${m.cumplimiento_fin ? escapar(new Date(m.cumplimiento_fin).toLocaleString("es")) : "—"}</p>` : ""}`;
  }
  const firma = `<div class="firma"><div class="linea"></div><div class="small">Autoridad firmante</div></div>`;
  const blob = blobWord(titulo, encabezado + destinatario + cuerpo + firma);
  descargar(blob, `Memorandum_${m.tipo}_${(m.numero || fechaHoy()).replace(/[^\w.-]+/g, "_")}.doc`);
  toast("Memorándum exportado a Word", "ok");
}
