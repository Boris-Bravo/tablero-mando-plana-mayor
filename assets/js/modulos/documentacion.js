/*
 * documentacion.js — Módulo "Seguimiento de Documentación" (colaborativo).
 *
 * Acorta la burocracia real de firmas del regimiento: Radio Operador (correo)
 * y Ayudantía (físico) registran el documento apenas lo reciben —con foto o
 * PDF adjunto si es posible— indicando para quién es (puede ser para varios
 * miembros a la vez). El Comandante y el 2do Comandante dan su proveído
 * directo en la app (sin esperar la firma física) y el documento "avanza" de
 * etapa: Recibido → Proveído del Comandante → Proveído del 2do Cmte →
 * Entregado. Todos ven todo, así que además sirve de base de datos ordenada
 * y buscable para futuros requerimientos.
 */
import { h, limpiar, toast, modal, confirmar, fechaHoy, fechaLarga, idNuevo } from "../ui.js";
import { blobWord, descargar, escapar } from "../export-word.js";
import { puedeEditarCampo, esMando } from "../auth.js";

const TABLA = "documentos";
const CAMPOS_DEF = ["P-1", "P-2", "P-3", "P-4", "P-5", "ayudantia", "radio-operador", "inspectoria", "sof-cmdo", "comp-a", "comp-b", "comp-c"];
const ESTADOS = [
  { id: "pendiente", txt: "Pendiente" },
  { id: "tramite", txt: "En trámite" },
  { id: "cumplido", txt: "Cumplido" },
];
const TIPOS_DOC = { radiograma: "Radiograma", informe: "Informe", plan: "Plan", relacion_nominal: "Relación Nominal", otro: "Otro" };
const ETAPAS = {
  recibido: { txt: "Recibido", cls: "tag--pend" },
  con_proveido_cmte: { txt: "Proveído Cmte.", cls: "", style: "background:rgba(53,227,211,.15);color:var(--cyan)" },
  con_proveido_2do_cmte: { txt: "Proveído 2do Cmte.", cls: "", style: "background:rgba(255,176,46,.15);color:#ffca6e" },
  entregado: { txt: "Entregado", cls: "tag--ok" },
};
// Puestos que actúan como puntos de entrada de correspondencia: pueden registrar para cualquier destinatario.
const PUNTOS_ENTRADA = ["radio-operador", "ayudantia"];

let ctx, cont, perfil, ajustes, lista;
let f = { tipo: "todos", campo: "todos", estado: "todos", tipoDoc: "todos", soloParaMi: false, texto: "" };

export async function documentacionModulo(contenedor, contexto) {
  ctx = contexto; cont = contenedor; perfil = ctx.sesion.perfil;
  await cargar();
  const campoSugerido = ctx.parametroModulo?.campo;
  if (campoSugerido && ajustes.campos.includes(campoSugerido)) f.campo = campoSugerido;
  else f.campo = "todos";
  render();
  return ctx.db.suscribir(TABLA, async () => { await cargar(); render(); });
}

async function cargar() {
  ajustes = await ctx.db.leerAjustes("documentacion", { campos: [...CAMPOS_DEF], diasAlerta: 3 });
  if (!ajustes.campos) ajustes.campos = [...CAMPOS_DEF];
  if (!ajustes.diasAlerta) ajustes.diasAlerta = 3;
  lista = await ctx.db.listar(TABLA);
}

/* ---------- Permisos ---------- */
function esPuntoEntrada(p) { return p.rol === "jefe_campo" && PUNTOS_ENTRADA.includes(p.campo); }
function puedeElegirDestinatarios(p) { return esMando(p) || esPuntoEntrada(p); }
function puedeEditarDoc(d) {
  if (esMando(perfil) || esPuntoEntrada(perfil)) return true;
  return perfil.rol === "jefe_campo" && (d.campos || []).includes(perfil.campo);
}

/* ---------- Plazos ---------- */
function diasAlerta() { return ajustes.diasAlerta || 3; }

function diasRestantes(plazo) {
  if (!plazo) return null;
  const [a, m, d] = plazo.split("-").map(Number);
  const p = new Date(a, m - 1, d);
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  return Math.round((p - hoy) / 86400000);
}

function estadoInfo(d) {
  if (d.estado === "cumplido") return { txt: "Cumplido", cls: "tag--ok", clave: "cumplido" };
  const dr = diasRestantes(d.plazo);
  if (dr !== null && dr < 0) return { txt: `Vencido (${Math.abs(dr)}d)`, cls: "tag--venc", clave: "vencido" };
  if (dr !== null && dr <= diasAlerta()) {
    return { txt: dr === 0 ? "⏰ Vence hoy" : `⏰ Vence en ${dr}d`, cls: "tag--porvencer", clave: "porvencer" };
  }
  if (d.estado === "tramite") return { txt: "En trámite", cls: "tag--pend", clave: "tramite" };
  return { txt: "Pendiente", cls: "tag--pend", clave: "pendiente" };
}

function bannerAlarma() {
  const criticos = lista.filter((d) => { const c = estadoInfo(d).clave; return c === "vencido" || c === "porvencer"; });
  if (!criticos.length) return null;
  const nVenc = criticos.filter((d) => estadoInfo(d).clave === "vencido").length;
  const nProx = criticos.filter((d) => estadoInfo(d).clave === "porvencer").length;
  criticos.sort((a, b) => (diasRestantes(a.plazo) ?? 999) - (diasRestantes(b.plazo) ?? 999));

  const listaEl = h("div", { class: "alarma__lista" });
  criticos.slice(0, 4).forEach((d) => {
    const dr = diasRestantes(d.plazo);
    const cuando = dr < 0 ? `vencido hace ${Math.abs(dr)} día(s)` : dr === 0 ? "vence HOY" : `vence en ${dr} día(s)`;
    listaEl.appendChild(h("div", { class: "alarma__item" },
      h("b", {}, `${(d.campos || []).join(", ")} · ${d.referencia || d.asunto || "documento"}`), ` — ${cuando}`));
  });

  return h("div", { class: "alarma" },
    h("div", { class: "alarma__icono" }, "🚨"),
    h("div", { class: "alarma__texto" },
      h("div", { class: "alarma__titulo" }, "Atención: plazos por cumplir"),
      h("div", { class: "alarma__detalle" }, `${nVenc} vencido(s) y ${nProx} próximo(s) a vencer (≤ ${diasAlerta()} día(s)).`),
      listaEl),
    h("div", { class: "btn-row" },
      h("button", { class: "btn btn--danger btn--sm", onclick: () => { f.estado = "vencido"; render(); } }, "Ver vencidos"),
      h("button", { class: "btn btn--gold btn--sm", onclick: () => { f.estado = "porvencer"; render(); } }, "Ver por vencer")));
}

/* ---------- Render principal ---------- */
function render() {
  limpiar(cont);

  const soyMiembroCampo = perfil.rol === "jefe_campo" && !esPuntoEntrada(perfil);
  cont.appendChild(h("div", { class: "page-head" },
    h("div", {},
      h("h2", {}, "🗂️ Seguimiento de Documentación"),
      h("div", { class: "sub" }, soyMiembroCampo ? `Compartido con toda la Plana Mayor — tú administras ${perfil.campo}` : "Entrante y saliente, compartido en vivo — puede ir a varios destinatarios")),
    h("div", { class: "btn-row" },
      h("button", { class: "btn btn--primary", onclick: () => editarDoc(nuevoDoc("entrante")) }, "＋ Entrante"),
      h("button", { class: "btn btn--gold", onclick: () => editarDoc(nuevoDoc("saliente")) }, "＋ Saliente"),
      esMando(perfil) ? h("button", { class: "btn btn--ghost", onclick: gestionarCampos }, "⚙️ Campos") : null)));

  const banner = bannerAlarma();
  if (banner) cont.appendChild(banner);

  const total = lista.length;
  const cont_ = { pendiente: 0, tramite: 0, porvencer: 0, vencido: 0, cumplido: 0 };
  lista.forEach((d) => cont_[estadoInfo(d).clave]++);
  cont.appendChild(h("div", { class: "chips", style: "margin-bottom:14px" },
    resumenChip("📄 Total", total, "var(--cyan)"),
    resumenChip("⏳ Pendientes", cont_.pendiente, "#ffca6e"),
    resumenChip("🔄 En trámite", cont_.tramite, "#ffca6e"),
    resumenChip("⏰ Por vencer", cont_.porvencer, "#ffb02e"),
    resumenChip("⚠️ Vencidos", cont_.vencido, "var(--rojo-claro)"),
    resumenChip("✅ Cumplidos", cont_.cumplido, "#7ff0ad")));

  const panelF = h("div", { class: "panel", style: "padding:14px 18px" });
  const fila = h("div", { class: "form-row", style: "margin:0;align-items:flex-end" });
  fila.appendChild(selectFiltro("Tipo", [["todos", "Todos"], ["entrante", "Entrante"], ["saliente", "Saliente"]], f.tipo, (v) => { f.tipo = v; render(); }));
  fila.appendChild(selectFiltro("Destinatario", [["todos", "Todos"], ...ajustes.campos.map((c) => [c, c])], f.campo, (v) => { f.campo = v; render(); }));
  fila.appendChild(selectFiltro("Documento", [["todos", "Todos"], ...Object.entries(TIPOS_DOC)], f.tipoDoc, (v) => { f.tipoDoc = v; render(); }));
  fila.appendChild(selectFiltro("Estado", [["todos", "Todos"], ["pendiente", "Pendiente"], ["tramite", "En trámite"], ["porvencer", "Por vencer"], ["vencido", "Vencido"], ["cumplido", "Cumplido"]], f.estado, (v) => { f.estado = v; render(); }));
  if (esMando(perfil)) {
    const diasInp = h("input", { type: "number", min: "1", max: "60", value: diasAlerta(),
      onchange: async (e) => { ajustes.diasAlerta = Math.max(1, parseInt(e.target.value) || 3); await ctx.db.guardarAjustes("documentacion", ajustes); render(); } });
    fila.appendChild(h("div", { class: "field", style: "flex:0 0 100px" }, h("label", {}, "Alerta (días)"), diasInp));
  }
  const inp = h("input", { type: "search", placeholder: "Buscar referencia, asunto…", value: f.texto, oninput: (e) => { f.texto = e.target.value; repintarTabla(); } });
  fila.appendChild(h("div", { class: "field" }, h("label", {}, "Buscar"), inp));
  fila.appendChild(h("div", { class: "field", style: "flex:0 0 auto" }, h("label", { style: "visibility:hidden" }, "."),
    h("button", { class: "btn btn--ghost", onclick: exportarWord }, "📄 Exportar a Word")));
  panelF.appendChild(fila);
  if (soyMiembroCampo) {
    panelF.appendChild(h("div", { class: "chips mt" },
      h("span", { class: `chip ${f.soloParaMi ? "active" : ""}`, onclick: () => { f.soloParaMi = !f.soloParaMi; render(); } }, "📌 Solo para mí")));
  }
  cont.appendChild(panelF);

  const wrap = h("div", { id: "docTablaWrap" });
  cont.appendChild(wrap);
  repintarTabla();
}

function resumenChip(txt, n, color) {
  return h("span", { class: "chip", style: `cursor:default;border-left:4px solid ${color}` },
    h("b", { style: `color:${color}` }, String(n)), " " + txt);
}

function selectFiltro(label, opciones, valor, onChange) {
  const sel = h("select", { onchange: (e) => onChange(e.target.value) });
  opciones.forEach(([v, t]) => sel.appendChild(h("option", { value: v, selected: v === valor }, t)));
  return h("div", { class: "field", style: "flex:1 1 130px" }, h("label", {}, label), sel);
}

function docsFiltrados() {
  const t = f.texto.trim().toLowerCase();
  return lista
    .filter((d) => f.tipo === "todos" || d.tipo === f.tipo)
    .filter((d) => f.campo === "todos" || (d.campos || []).includes(f.campo))
    .filter((d) => f.tipoDoc === "todos" || d.tipo_documento === f.tipoDoc)
    .filter((d) => f.estado === "todos" || estadoInfo(d).clave === f.estado)
    .filter((d) => !f.soloParaMi || (d.campos || []).includes(perfil.campo))
    .filter((d) => !t || [d.referencia, d.asunto, d.contraparte, d.proveido, d.proveido_comandante, d.proveido_2do_cmte].some((x) => (x || "").toLowerCase().includes(t)))
    .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "") || new Date(b.creado) - new Date(a.creado));
}

function repintarTabla() {
  const wrap = document.getElementById("docTablaWrap");
  if (!wrap) return;
  limpiar(wrap);
  const filtrados = docsFiltrados();

  if (!filtrados.length) {
    wrap.appendChild(h("div", { class: "vacio" },
      h("div", { class: "big" }, "🗂️"),
      h("p", {}, lista.length ? "No hay documentos que coincidan con el filtro." : "Aún no hay documentos registrados."),
      h("p", { class: "muted" }, "Agrega uno con los botones “Entrante” o “Saliente”.")));
    return;
  }

  const tabla = h("table", { class: "data" });
  tabla.appendChild(h("thead", {}, h("tr", {},
    h("th", {}, "Tipo"), h("th", {}, "Doc."), h("th", {}, "Destinatarios"), h("th", {}, "Referencia"),
    h("th", {}, "Fecha"), h("th", {}, "Origen / Destino"), h("th", {}, "Asunto"),
    h("th", {}, "Plazo"), h("th", {}, "Estado"), h("th", {}, "Etapa"), h("th", {}, "Envío"), h("th", {}, "Acciones"))));
  const tbody = h("tbody");
  for (const d of filtrados) {
    const est = estadoInfo(d);
    const etapa = ETAPAS[d.etapa] || ETAPAS.recibido;
    const puedeEditar = puedeEditarDoc(d);
    tbody.appendChild(h("tr", {},
      h("td", {}, h("span", { class: "tag", style: d.tipo === "entrante" ? "background:rgba(59,74,40,.15);color:var(--verde-700)" : "background:rgba(212,175,55,.2);color:#8a6d12" }, d.tipo === "entrante" ? "⬇ Entrante" : "⬆ Saliente")),
      h("td", {}, d.tipo_documento ? TIPOS_DOC[d.tipo_documento] : "—"),
      h("td", {}, (d.campos || []).join(", ") || "—"),
      h("td", {}, d.referencia || "—", d.adjunto_url ? h("div", {}, adjuntoLink(d.adjunto_url)) : null),
      h("td", {}, d.fecha ? fechaCorta(d.fecha) : "—", d.creado ? h("div", { class: "muted small", title: "Hora exacta en que quedó registrado en el sistema" }, `⏱ ${horaCorta(d.creado)}`) : null),
      h("td", {}, d.contraparte || "—"),
      h("td", { style: "max-width:200px" }, d.asunto || "—"),
      h("td", {}, d.plazo ? fechaCorta(d.plazo) : "—"),
      h("td", {}, h("span", { class: `tag ${est.cls}` }, est.txt)),
      h("td", {}, h("span", { class: `tag ${etapa.cls}`, style: etapa.style || "" }, etapa.txt)),
      h("td", {}, celdaEnvio(d)),
      h("td", {}, h("div", { style: "display:flex;gap:6px;flex-wrap:wrap" },
        botonEtapa(d),
        puedeEditar ? h("button", { class: "btn btn--ghost btn--sm", title: "Ver / editar", onclick: () => editarDoc(structuredClone(d)) }, "✏️") : null,
        puedeEditar ? h("button", { class: "btn btn--danger btn--sm", title: "Eliminar", onclick: () => eliminarDoc(d) }, "🗑️") : null))));
  }
  tabla.appendChild(tbody);
  wrap.appendChild(h("div", { class: "tabla-wrap" }, tabla));
}

// Confirmación de envío: la da Ayudantía o Radio Operador (o el mando), como
// segundo visto bueno distinto de quien elaboró/respondió el documento.
function celdaEnvio(d) {
  if (d.confirmado_envio_por) {
    return h("span", { class: "tag tag--ok", title: `Confirmado ${d.confirmado_envio_en ? new Date(d.confirmado_envio_en).toLocaleString("es") : ""}` }, "✅ Confirmado");
  }
  if (d.adjunto_envio_url) {
    return h("div", {},
      adjuntoLink(d.adjunto_envio_url),
      (esMando(perfil) || esPuntoEntrada(perfil)) ? h("div", { class: "mt" }, h("button", { class: "btn btn--gold btn--sm", onclick: () => confirmarEnvio(d) }, "✅ Confirmar")) : null);
  }
  return h("span", { class: "muted small" }, "—");
}

async function confirmarEnvio(d) {
  if (!await confirmar("¿Confirmas que este documento fue efectivamente enviado/transmitido?", { titulo: "Confirmar envío", textoOk: "Confirmar" })) return;
  try {
    await ctx.db.actualizar(TABLA, d.id, { confirmado_envio_por: ctx.sesion.user.id, confirmado_envio_en: new Date().toISOString() });
    toast("Envío confirmado", "ok");
    await cargar(); render();
  } catch (e) { console.error(e); toast("No se pudo confirmar", "err"); }
}

function adjuntoLink(url) {
  const esImagen = /\.(png|jpe?g|gif|webp)$/i.test(url);
  return esImagen
    ? h("img", { src: url, style: "width:40px;height:40px;object-fit:cover;border-radius:4px;cursor:pointer", onclick: () => window.open(url, "_blank") })
    : h("a", { href: url, target: "_blank" }, "📎 adjunto");
}

/* ---------- Botón de avance de etapa (solo mando) ---------- */
function botonEtapa(d) {
  if (!esMando(perfil)) return null;
  if (d.etapa === "recibido") return h("button", { class: "btn btn--gold btn--sm", onclick: () => pedirProveido(d, "comandante") }, "🖋️ Cmte.");
  if (d.etapa === "con_proveido_cmte") return h("button", { class: "btn btn--gold btn--sm", onclick: () => pedirProveido(d, "2do_cmte") }, "🖋️ 2do Cmte.");
  if (d.etapa === "con_proveido_2do_cmte") return h("button", { class: "btn btn--primary btn--sm", onclick: () => marcarEntregado(d) }, "📬 Entregar");
  return null;
}

function pedirProveido(d, quien) {
  const texto = h("textarea", { rows: "3", placeholder: "Proveído / instrucción…" });
  modal({
    titulo: quien === "comandante" ? "🖋️ Proveído del Comandante" : "🖋️ Proveído del 2do Comandante",
    cuerpo: h("div", { class: "field" }, texto),
    acciones: [
      { texto: "Cancelar", clase: "btn--ghost", valor: null },
      {
        texto: "💾 Guardar", clase: "btn--primary", valor: "ok",
        onClick: async () => {
          if (!texto.value.trim()) { toast("Escribe el proveído", "err"); return false; }
          const ahora = new Date().toISOString();
          const cambios = quien === "comandante"
            ? { proveido_comandante: texto.value.trim(), proveido_comandante_por: ctx.sesion.user.id, proveido_comandante_en: ahora, etapa: "con_proveido_cmte" }
            : { proveido_2do_cmte: texto.value.trim(), proveido_2do_cmte_por: ctx.sesion.user.id, proveido_2do_cmte_en: ahora, etapa: "con_proveido_2do_cmte" };
          try { await ctx.db.actualizar(TABLA, d.id, cambios); toast("Proveído agregado", "ok"); await cargar(); render(); }
          catch (e) { console.error(e); toast("No se pudo guardar", "err"); }
        },
      },
    ],
  });
}

async function marcarEntregado(d) {
  try { await ctx.db.actualizar(TABLA, d.id, { etapa: "entregado" }); toast("Marcado como entregado", "ok"); await cargar(); render(); }
  catch { toast("No se pudo actualizar", "err"); }
}

function fechaCorta(iso) { const [a, m, d] = iso.split("-"); return `${d}/${m}/${a}`; }
// Hora exacta de un timestamp (queda como prueba fáctica de cuándo se registró/proveyó algo).
function horaCorta(iso) { return new Date(iso).toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }

/* ---------- Crear / editar ---------- */
function nuevoDoc(tipo) {
  const campoDef = perfil.rol === "jefe_campo" && !esPuntoEntrada(perfil) ? [perfil.campo] : [];
  return {
    id: null, tipo, campos: campoDef, tipo_documento: null,
    referencia: "", fecha: fechaHoy(), contraparte: "", asunto: "",
    plazo: "", estado: "pendiente", proveido: "", observaciones: "", adjunto_url: null,
  };
}

function editarDoc(d) {
  const esEntrante = d.tipo === "entrante";
  const cuerpo = h("div", {});
  const puedeElegir = puedeElegirDestinatarios(perfil);

  const selTipo = h("select", {}, ...[["entrante", "Entrante"], ["saliente", "Saliente"]].map(([v, t]) => h("option", { value: v, selected: v === d.tipo }, t)));
  const selTipoDoc = h("select", {}, h("option", { value: "" }, "— Tipo de documento —"), ...Object.entries(TIPOS_DOC).map(([v, t]) => h("option", { value: v, selected: v === d.tipo_documento }, t)));
  cuerpo.appendChild(h("div", { class: "form-row" },
    h("div", { class: "field" }, h("label", {}, "Tipo"), selTipo),
    h("div", { class: "field" }, h("label", {}, "Tipo de documento"), selTipoDoc)));

  // Destinatarios (multi-selección con checkboxes).
  const camposDoc = d.campos || [];
  const checks = ajustes.campos.map((c) => h("input", { type: "checkbox", value: c, checked: camposDoc.includes(c), disabled: !puedeElegir && c !== perfil.campo }));
  const cajaDestinatarios = h("div", { class: "chips" }, ...ajustes.campos.map((c, i) =>
    h("label", { style: "display:flex;align-items:center;gap:5px;background:rgba(255,255,255,.05);border:1px solid var(--linea);border-radius:999px;padding:5px 11px;cursor:pointer" }, checks[i], c)));
  cuerpo.appendChild(h("div", { class: "field", style: "margin-bottom:12px" }, h("label", {}, "Destinatarios (puede ser más de uno)"), cajaDestinatarios));

  const refInp = h("input", { type: "text", value: d.referencia, placeholder: "N.° / referencia del documento" });
  const fechaInp = h("input", { type: "date", value: d.fecha });
  cuerpo.appendChild(h("div", { class: "form-row" },
    h("div", { class: "field" }, h("label", {}, "Referencia"), refInp),
    h("div", { class: "field" }, h("label", {}, "Fecha"), fechaInp)));

  const contraLabel = h("label", {}, esEntrante ? "Origen (remite)" : "Destino");
  const contraInp = h("input", { type: "text", value: d.contraparte, placeholder: esEntrante ? "¿Quién lo envía?" : "¿A quién va dirigido?" });
  selTipo.addEventListener("change", () => { contraLabel.textContent = selTipo.value === "entrante" ? "Origen (remite)" : "Destino"; });
  cuerpo.appendChild(h("div", { class: "form-row" }, h("div", { class: "field" }, contraLabel, contraInp)));

  const asuntoInp = h("input", { type: "text", value: d.asunto, placeholder: "Asunto del documento" });
  cuerpo.appendChild(h("div", { class: "form-row" }, h("div", { class: "field" }, h("label", {}, "Asunto"), asuntoInp)));

  const plazoInp = h("input", { type: "date", value: d.plazo || "" });
  const selEstado = h("select", {}, ...ESTADOS.map((e) => h("option", { value: e.id, selected: e.id === d.estado }, e.txt)));
  cuerpo.appendChild(h("div", { class: "form-row" },
    h("div", { class: "field" }, h("label", {}, "Plazo (vencimiento)"), plazoInp),
    h("div", { class: "field" }, h("label", {}, "Estado"), selEstado)));

  // Adjunto (foto / PDF / Word) para adelantar el contenido.
  const archivo = h("input", { type: "file", accept: "image/*,.pdf,.doc,.docx", style: "display:none" });
  const nombreArchivo = h("span", { class: "muted small" }, d.adjunto_url ? "Ya tiene un adjunto guardado" : "");
  archivo.addEventListener("change", () => { nombreArchivo.textContent = archivo.files[0] ? `📎 ${archivo.files[0].name}` : ""; });
  cuerpo.appendChild(h("div", { class: "form-row", style: "align-items:center" },
    h("label", { class: "btn btn--ghost btn--sm", style: "cursor:pointer" }, "📎 Adjuntar foto / PDF / Word", archivo),
    nombreArchivo, d.adjunto_url ? h("a", { href: d.adjunto_url, target: "_blank", class: "btn btn--ghost btn--sm" }, "👁️ Ver actual") : null));

  // Comprobante de envío: quien elabora/responde sube la foto o captura de lo ya enviado.
  const archivoEnvio = h("input", { type: "file", accept: "image/*,.pdf,.doc,.docx", style: "display:none" });
  const nombreArchivoEnvio = h("span", { class: "muted small" }, d.adjunto_envio_url ? "Ya tiene comprobante guardado" : "");
  archivoEnvio.addEventListener("change", () => { nombreArchivoEnvio.textContent = archivoEnvio.files[0] ? `📎 ${archivoEnvio.files[0].name}` : ""; });
  cuerpo.appendChild(h("div", { class: "form-row", style: "align-items:center" },
    h("label", { class: "btn btn--gold btn--sm", style: "cursor:pointer" }, "📤 Comprobante de envío (foto/captura)", archivoEnvio),
    nombreArchivoEnvio, d.adjunto_envio_url ? h("a", { href: d.adjunto_envio_url, target: "_blank", class: "btn btn--ghost btn--sm" }, "👁️ Ver actual") : null));
  if (d.confirmado_envio_por) cuerpo.appendChild(h("p", { class: "muted small" }, `✅ Envío ya confirmado el ${new Date(d.confirmado_envio_en).toLocaleString("es")}`));

  const provInp = h("textarea", { rows: "2", placeholder: "Proveído / decreto / instrucción dada" }, d.proveido || "");
  cuerpo.appendChild(h("div", { class: "form-row" }, h("div", { class: "field" }, h("label", {}, "Proveído (libre)"), provInp)));

  const obsInp = h("textarea", { rows: "2", placeholder: "Observaciones" }, d.observaciones || "");
  cuerpo.appendChild(h("div", { class: "form-row" }, h("div", { class: "field" }, h("label", {}, "Observaciones"), obsInp)));

  if (d.proveido_comandante || d.proveido_2do_cmte) {
    cuerpo.appendChild(h("div", { class: "panel", style: "margin:12px 0 0;box-shadow:none" },
      h("h3", {}, "Trámite"),
      d.proveido_comandante ? h("p", {}, h("b", {}, "Proveído del Comandante: "), d.proveido_comandante,
        d.proveido_comandante_en ? h("span", { class: "muted small" }, ` (${horaCorta(d.proveido_comandante_en)})`) : null) : null,
      d.proveido_2do_cmte ? h("p", {}, h("b", {}, "Proveído del 2do Comandante: "), d.proveido_2do_cmte,
        d.proveido_2do_cmte_en ? h("span", { class: "muted small" }, ` (${horaCorta(d.proveido_2do_cmte_en)})`) : null) : null,
      h("p", { class: "muted small", style: "margin-top:8px" }, `Registrado en el sistema: ${d.creado ? horaCorta(d.creado) : "—"}`)));
  }

  modal({
    titulo: d.id ? "Editar documento" : "Nuevo documento",
    cuerpo,
    acciones: [
      { texto: "Cancelar", clase: "btn--ghost", valor: null },
      {
        texto: "💾 Guardar", clase: "btn--primary", valor: "ok",
        onClick: async () => {
          const asunto = asuntoInp.value.trim();
          const ref = refInp.value.trim();
          if (!asunto && !ref) { toast("Indica al menos la referencia o el asunto", "err"); return false; }
          const campos = checks.filter((c) => c.checked).map((c) => c.value);
          if (!campos.length) { toast("Elige al menos un destinatario", "err"); return false; }
          let adjunto_url = d.adjunto_url || null;
          if (archivo.files[0]) {
            try { adjunto_url = await ctx.db.subirArchivo(`documentos/${idNuevo()}-${archivo.files[0].name}`, archivo.files[0]); }
            catch (e) { console.error(e); toast("No se pudo subir el adjunto, se guarda sin él", ""); }
          }
          let adjunto_envio_url = d.adjunto_envio_url || null;
          if (archivoEnvio.files[0]) {
            try { adjunto_envio_url = await ctx.db.subirArchivo(`documentos/envio-${idNuevo()}-${archivoEnvio.files[0].name}`, archivoEnvio.files[0]); }
            catch (e) { console.error(e); toast("No se pudo subir el comprobante, se guarda sin él", ""); }
          }
          const cambios = {
            tipo: selTipo.value, tipo_documento: selTipoDoc.value || null, campos, referencia: ref, fecha: fechaInp.value || null,
            contraparte: contraInp.value.trim(), asunto, plazo: plazoInp.value || null,
            estado: selEstado.value, proveido: provInp.value.trim(), observaciones: obsInp.value.trim(), adjunto_url, adjunto_envio_url,
            actualizado: new Date().toISOString(),
          };
          guardarDoc(d, cambios);
        },
      },
    ],
  });
}

async function guardarDoc(d, cambios) {
  try {
    if (d.id) await ctx.db.actualizar(TABLA, d.id, cambios);
    else await ctx.db.crear(TABLA, { ...cambios, creado_por: ctx.sesion.user.id });
    toast("Documento guardado", "ok");
    await cargar(); render();
  } catch (e) {
    console.error(e);
    toast("No se pudo guardar (revisa tus permisos sobre esos destinatarios)", "err");
  }
}

async function eliminarDoc(d) {
  if (!await confirmar(`¿Eliminar el documento ${d.referencia ? `“${d.referencia}”` : "seleccionado"}?`, { titulo: "Eliminar documento", textoOk: "Eliminar", peligro: true })) return;
  try {
    await ctx.db.eliminar(TABLA, d.id);
    toast("Documento eliminado", "");
    await cargar(); render();
  } catch (e) { toast("No se pudo eliminar", "err"); }
}

/* ---------- Gestionar campos (solo mando) ---------- */
function gestionarCampos() {
  const cuerpo = h("div", {});
  const listaEl = h("div", { class: "list" });
  function pintar() {
    limpiar(listaEl);
    ajustes.campos.forEach((c, i) => {
      listaEl.appendChild(h("div", { class: "list-item", style: "padding:8px 12px" },
        h("span", { class: "list-item__title" }, c),
        h("div", { class: "list-item__actions" },
          h("button", {
            class: "btn btn--danger btn--sm", onclick: async () => {
              const enUso = lista.some((d) => (d.campos || []).includes(c));
              if (enUso && !await confirmar(`El destinatario "${c}" tiene documentos asociados. ¿Quitarlo igualmente? (los documentos conservan la etiqueta)`, { titulo: "Quitar", textoOk: "Quitar", peligro: true })) return;
              ajustes.campos.splice(i, 1); await ctx.db.guardarAjustes("documentacion", ajustes); pintar();
            }
          }, "🗑️"))));
    });
  }
  pintar();
  const nuevo = h("input", { type: "text", placeholder: "Ej.: capellania, sanidad…", style: "flex:1" });
  const agregar = h("button", {
    class: "btn btn--primary", onclick: async () => {
      const v = nuevo.value.trim(); if (!v) return;
      if (ajustes.campos.includes(v)) { toast("Ese destinatario ya existe", "err"); return; }
      ajustes.campos.push(v); nuevo.value = ""; await ctx.db.guardarAjustes("documentacion", ajustes); pintar();
    }
  }, "＋ Agregar");
  cuerpo.append(listaEl, h("div", { class: "form-row mt", style: "align-items:center" }, nuevo, agregar));

  modal({ titulo: "⚙️ Destinatarios disponibles", cuerpo, acciones: [{ texto: "Cerrar", clase: "btn--ghost", valor: null, onClick: () => { render(); } }] });
}

/* ---------- Exportar a Word ---------- */
async function exportarWord() {
  const filtrados = docsFiltrados();
  if (!filtrados.length) { toast("No hay documentos para exportar", "err"); return; }
  const filas = filtrados.map((d) => {
    const est = estadoInfo(d);
    return `<tr>
      <td>${d.tipo === "entrante" ? "Entrante" : "Saliente"}</td>
      <td>${escapar((d.campos || []).join(", "))}</td>
      <td>${escapar(d.referencia || "")}</td>
      <td>${d.fecha ? escapar(fechaCorta(d.fecha)) : ""}</td>
      <td>${escapar(d.contraparte || "")}</td>
      <td>${escapar(d.asunto || "")}</td>
      <td>${d.plazo ? escapar(fechaCorta(d.plazo)) : ""}</td>
      <td>${est.txt}</td>
      <td>${escapar(d.proveido_comandante || d.proveido || "")}</td>
    </tr>`;
  }).join("");

  const cuerpo = `
    <div class="encabezado"><h2>SEGUIMIENTO DE DOCUMENTACIÓN</h2>
    <div>Emitido: ${escapar(fechaLarga(fechaHoy()))}</div></div>
    <table>
      <thead><tr><th>Tipo</th><th>Destinatarios</th><th>Referencia</th><th>Fecha</th><th>Origen/Destino</th><th>Asunto</th><th>Plazo</th><th>Estado</th><th>Proveído</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>`;
  const blob = blobWord("Seguimiento de Documentación", cuerpo);
  descargar(blob, `Documentacion_${fechaHoy()}.doc`);
  toast("Documento exportado", "ok");
}
