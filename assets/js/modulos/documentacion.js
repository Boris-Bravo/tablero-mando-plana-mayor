/*
 * documentacion.js — Módulo "Seguimiento de Documentación" (colaborativo).
 *
 * Documentación ENTRANTE y SALIENTE por campos de la conducción (P-1…P-5),
 * compartida en tiempo real por toda la Plana Mayor. Un jefe_campo solo puede
 * crear/editar documentos de su propio campo (reforzado por RLS en el
 * servidor); el mando (Comandante/2do Comandante/Jefe de Plana Mayor) puede
 * con cualquiera. Todos ven todo.
 */
import { h, limpiar, toast, modal, confirmar, fechaHoy, fechaLarga, idNuevo } from "../ui.js";
import { blobWord, descargar, escapar } from "../export-word.js";
import { puedeEditarCampo, esMando } from "../auth.js";

const TABLA = "documentos";
const CAMPOS_DEF = ["P-1", "P-2", "P-3", "P-4", "P-5"];
const ESTADOS = [
  { id: "pendiente", txt: "Pendiente" },
  { id: "tramite", txt: "En trámite" },
  { id: "cumplido", txt: "Cumplido" },
];

let ctx, cont, perfil, ajustes, lista;
let f = { tipo: "todos", campo: "todos", estado: "todos", texto: "" };

export async function documentacionModulo(contenedor, contexto) {
  ctx = contexto; cont = contenedor; perfil = ctx.sesion.perfil;
  await cargar();
  // Si se abrió desde el portal de una sección (ej. P-2), preseleccionar ese campo.
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
      h("b", {}, `${d.campo} · ${d.referencia || d.asunto || "documento"}`), ` — ${cuando}`));
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

  const campoPropio = perfil.rol === "jefe_campo" ? perfil.campo : null;
  cont.appendChild(h("div", { class: "page-head" },
    h("div", {},
      h("h2", {}, "🗂️ Seguimiento de Documentación"),
      h("div", { class: "sub" }, campoPropio ? `Compartido con toda la Plana Mayor — tú administras ${campoPropio}` : "Entrante y saliente por campos de la conducción, compartido en vivo")),
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
  fila.appendChild(selectFiltro("Campo", [["todos", "Todos"], ...ajustes.campos.map((c) => [c, c])], f.campo, (v) => { f.campo = v; render(); }));
  fila.appendChild(selectFiltro("Estado", [["todos", "Todos"], ["pendiente", "Pendiente"], ["tramite", "En trámite"], ["porvencer", "Por vencer"], ["vencido", "Vencido"], ["cumplido", "Cumplido"]], f.estado, (v) => { f.estado = v; render(); }));
  if (esMando(perfil)) {
    const diasInp = h("input", { type: "number", min: "1", max: "60", value: diasAlerta(),
      onchange: async (e) => { ajustes.diasAlerta = Math.max(1, parseInt(e.target.value) || 3); await ctx.db.guardarAjustes("documentacion", ajustes); render(); } });
    fila.appendChild(h("div", { class: "field", style: "flex:0 0 110px" }, h("label", {}, "Alerta (días)"), diasInp));
  }
  const inp = h("input", { type: "search", placeholder: "Buscar referencia, asunto…", value: f.texto, oninput: (e) => { f.texto = e.target.value; repintarTabla(); } });
  fila.appendChild(h("div", { class: "field" }, h("label", {}, "Buscar"), inp));
  fila.appendChild(h("div", { class: "field", style: "flex:0 0 auto" }, h("label", { style: "visibility:hidden" }, "."),
    h("button", { class: "btn btn--ghost", onclick: exportarWord }, "📄 Exportar a Word")));
  panelF.appendChild(fila);
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
    .filter((d) => f.campo === "todos" || d.campo === f.campo)
    .filter((d) => f.estado === "todos" || estadoInfo(d).clave === f.estado)
    .filter((d) => !t || [d.referencia, d.asunto, d.contraparte, d.proveido].some((x) => (x || "").toLowerCase().includes(t)))
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
    h("th", {}, "Tipo"), h("th", {}, "Campo"), h("th", {}, "Referencia"),
    h("th", {}, "Fecha"), h("th", {}, "Origen / Destino"), h("th", {}, "Asunto"),
    h("th", {}, "Plazo"), h("th", {}, "Estado"), h("th", {}, "Acciones"))));
  const tbody = h("tbody");
  for (const d of filtrados) {
    const est = estadoInfo(d);
    const puedeEditar = puedeEditarCampo(perfil, d.campo);
    tbody.appendChild(h("tr", {},
      h("td", {}, h("span", { class: "tag", style: d.tipo === "entrante" ? "background:rgba(59,74,40,.15);color:var(--verde-700)" : "background:rgba(212,175,55,.2);color:#8a6d12" }, d.tipo === "entrante" ? "⬇ Entrante" : "⬆ Saliente")),
      h("td", {}, d.campo || "—"),
      h("td", {}, d.referencia || "—"),
      h("td", {}, d.fecha ? fechaCorta(d.fecha) : "—"),
      h("td", {}, d.contraparte || "—"),
      h("td", { style: "max-width:220px" }, d.asunto || "—"),
      h("td", {}, d.plazo ? fechaCorta(d.plazo) : "—"),
      h("td", {}, h("span", { class: `tag ${est.cls}` }, est.txt)),
      h("td", {}, puedeEditar ? h("div", { style: "display:flex;gap:6px" },
        h("button", { class: "btn btn--ghost btn--sm", title: "Ver / editar", onclick: () => editarDoc(structuredClone(d)) }, "✏️"),
        h("button", { class: "btn btn--danger btn--sm", title: "Eliminar", onclick: () => eliminarDoc(d) }, "🗑️")) : h("span", { class: "muted small" }, "—"))));
  }
  tabla.appendChild(tbody);
  wrap.appendChild(h("div", { class: "tabla-wrap" }, tabla));
}

function fechaCorta(iso) { const [a, m, d] = iso.split("-"); return `${d}/${m}/${a}`; }

/* ---------- Crear / editar ---------- */
function nuevoDoc(tipo) {
  const campoDef = perfil.rol === "jefe_campo" ? perfil.campo : (ajustes.campos[0] || "P-1");
  return {
    id: null, tipo, campo: campoDef,
    referencia: "", fecha: fechaHoy(), contraparte: "", asunto: "",
    plazo: "", estado: "pendiente", proveido: "", observaciones: "",
  };
}

function editarDoc(d) {
  const esEntrante = d.tipo === "entrante";
  const cuerpo = h("div", {});
  const soloSuCampo = perfil.rol === "jefe_campo" ? perfil.campo : null;
  const opcionesCampo = soloSuCampo ? [soloSuCampo] : ajustes.campos;

  const filaTipoCampo = h("div", { class: "form-row" });
  const selTipo = h("select", {}, ...[["entrante", "Entrante"], ["saliente", "Saliente"]].map(([v, t]) => h("option", { value: v, selected: v === d.tipo }, t)));
  filaTipoCampo.appendChild(h("div", { class: "field" }, h("label", {}, "Tipo"), selTipo));
  const selCampo = h("select", { disabled: !!soloSuCampo }, ...opcionesCampo.map((c) => h("option", { value: c, selected: c === d.campo }, c)));
  filaTipoCampo.appendChild(h("div", { class: "field" }, h("label", {}, "Campo"), selCampo));
  cuerpo.appendChild(filaTipoCampo);

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

  const provInp = h("textarea", { rows: "2", placeholder: "Proveído / decreto / instrucción dada" }, d.proveido || "");
  cuerpo.appendChild(h("div", { class: "form-row" }, h("div", { class: "field" }, h("label", {}, "Proveído"), provInp)));

  const obsInp = h("textarea", { rows: "2", placeholder: "Observaciones" }, d.observaciones || "");
  cuerpo.appendChild(h("div", { class: "form-row" }, h("div", { class: "field" }, h("label", {}, "Observaciones"), obsInp)));

  modal({
    titulo: d.id ? "Editar documento" : "Nuevo documento",
    cuerpo,
    acciones: [
      { texto: "Cancelar", clase: "btn--ghost", valor: null },
      {
        texto: "💾 Guardar", clase: "btn--primary", valor: "ok",
        onClick: () => {
          const asunto = asuntoInp.value.trim();
          const ref = refInp.value.trim();
          if (!asunto && !ref) { toast("Indica al menos la referencia o el asunto", "err"); return false; }
          const cambios = {
            tipo: selTipo.value, campo: selCampo.value, referencia: ref, fecha: fechaInp.value || null,
            contraparte: contraInp.value.trim(), asunto, plazo: plazoInp.value || null,
            estado: selEstado.value, proveido: provInp.value.trim(), observaciones: obsInp.value.trim(),
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
    toast("No se pudo guardar (revisa tus permisos sobre ese campo)", "err");
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
              const enUso = lista.some((d) => d.campo === c);
              if (enUso && !await confirmar(`El campo "${c}" tiene documentos asociados. ¿Quitarlo igualmente? (los documentos conservan la etiqueta)`, { titulo: "Quitar campo", textoOk: "Quitar", peligro: true })) return;
              ajustes.campos.splice(i, 1); await ctx.db.guardarAjustes("documentacion", ajustes); pintar();
            }
          }, "🗑️"))));
    });
  }
  pintar();
  const nuevo = h("input", { type: "text", placeholder: "Ej.: P-6, Comando, Inteligencia…", style: "flex:1" });
  const agregar = h("button", {
    class: "btn btn--primary", onclick: async () => {
      const v = nuevo.value.trim(); if (!v) return;
      if (ajustes.campos.includes(v)) { toast("Ese campo ya existe", "err"); return; }
      ajustes.campos.push(v); nuevo.value = ""; await ctx.db.guardarAjustes("documentacion", ajustes); pintar();
    }
  }, "＋ Agregar");
  cuerpo.append(listaEl, h("div", { class: "form-row mt", style: "align-items:center" }, nuevo, agregar));

  modal({ titulo: "⚙️ Campos de la conducción", cuerpo, acciones: [{ texto: "Cerrar", clase: "btn--ghost", valor: null, onClick: () => { render(); } }] });
}

/* ---------- Exportar a Word ---------- */
async function exportarWord() {
  const filtrados = docsFiltrados();
  if (!filtrados.length) { toast("No hay documentos para exportar", "err"); return; }
  const filas = filtrados.map((d) => {
    const est = estadoInfo(d);
    return `<tr>
      <td>${d.tipo === "entrante" ? "Entrante" : "Saliente"}</td>
      <td>${escapar(d.campo)}</td>
      <td>${escapar(d.referencia || "")}</td>
      <td>${d.fecha ? escapar(fechaCorta(d.fecha)) : ""}</td>
      <td>${escapar(d.contraparte || "")}</td>
      <td>${escapar(d.asunto || "")}</td>
      <td>${d.plazo ? escapar(fechaCorta(d.plazo)) : ""}</td>
      <td>${est.txt}</td>
      <td>${escapar(d.proveido || "")}</td>
    </tr>`;
  }).join("");

  const cuerpo = `
    <div class="encabezado"><h2>SEGUIMIENTO DE DOCUMENTACIÓN</h2>
    <div>Emitido: ${escapar(fechaLarga(fechaHoy()))}</div></div>
    <table>
      <thead><tr><th>Tipo</th><th>Campo</th><th>Referencia</th><th>Fecha</th><th>Origen/Destino</th><th>Asunto</th><th>Plazo</th><th>Estado</th><th>Proveído</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>`;
  const blob = blobWord("Seguimiento de Documentación", cuerpo);
  descargar(blob, `Documentacion_${fechaHoy()}.doc`);
  toast("Documento exportado", "ok");
}
