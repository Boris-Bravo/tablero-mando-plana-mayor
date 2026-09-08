/*
 * coordinacion.js — Módulo "Sala de Coordinación", formato SIPE.
 *
 * Un solo feed en tiempo real donde cualquier miembro de la Plana Mayor
 * publica mensajes (con Asunto, Prioridad y tipo de Confirmación, igual que
 * SIPE) y adjunta documentos, más "Disposiciones Generales" (con Tipo de
 * documento: Disposición/Radiograma/Comunicado/Oficio) que solo emite el
 * mando. A diferencia de SIPE, la confirmación ("conocimiento y
 * conformidad") es un acuse de recibo real: se ve quién ya confirmó.
 */
import { h, limpiar, toast, modal, confirmar, idNuevo } from "../ui.js";
import { esMando, etiquetaRol } from "../auth.js";

const TABLA = "tablon_mensajes";
const TABLA_CONFIRM = "tablon_confirmaciones";
const PRIORIDADES = { informativa: "Informativa", importante: "Importante", inmediata: "Inmediata" };
const PRIORIDAD_COLOR = { informativa: "var(--cyan)", importante: "#ffb02e", inmediata: "var(--rojo-claro)" };
const TIPOS_DOC = { disposicion: "Disposición", radiograma: "Radiograma", comunicado: "Comunicado", oficio: "Oficio" };

let ctx, cont, perfil, mensajes, perfiles, confirmaciones;

export async function coordinacionModulo(contenedor, contexto) {
  ctx = contexto; cont = contenedor; perfil = ctx.sesion.perfil;
  await cargar();
  render();
  const c1 = ctx.db.suscribir(TABLA, async (payload) => {
    if (payload.eventType === "INSERT" && payload.new.creado_por !== ctx.sesion.user.id) {
      const autor = perfiles.get(payload.new.creado_por);
      const quien = autor ? (autor.nombre || etiquetaRol(autor)) : "alguien";
      toast(payload.new.tipo === "disposicion" ? `📌 Nueva disposición de ${quien}` : `📨 Nuevo mensaje de ${quien}`, "ok");
    }
    await cargar(); render();
  });
  const c2 = ctx.db.suscribir(TABLA_CONFIRM, async () => { await cargar(); render(); });
  return () => { c1(); c2(); };
}

async function cargar() {
  [mensajes, perfiles, confirmaciones] = await Promise.all([
    ctx.db.listar(TABLA), ctx.db.mapaPerfiles(), ctx.db.listar(TABLA_CONFIRM, { orden: "confirmado" }),
  ]);
}

function nombreDe(id) {
  const p = perfiles.get(id);
  return p ? (p.nombre || etiquetaRol(p)) : "—";
}
function fechaHora(iso) {
  return new Date(iso).toLocaleString("es", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function confirmacionesDe(mensajeId) { return confirmaciones.filter((c) => c.mensaje_id === mensajeId); }
function yoConfirme(mensajeId) { return confirmaciones.some((c) => c.mensaje_id === mensajeId && c.perfil_id === ctx.sesion.user.id); }

/* =================== RENDER =================== */
function render() {
  limpiar(cont);
  cont.appendChild(h("div", { class: "page-head" },
    h("div", {}, h("h2", {}, "📡 Sala de Coordinación"), h("div", { class: "sub" }, "Mensajes y disposiciones de toda la Plana Mayor, en vivo"))));

  const disposiciones = mensajes.filter((m) => m.tipo === "disposicion").sort((a, b) => new Date(b.creado) - new Date(a.creado));
  for (const d of disposiciones) cont.appendChild(tarjetaDisposicion(d));

  cont.appendChild(panelComposer());

  const feed = h("div", { class: "feed" });
  const soloMensajes = mensajes.filter((m) => m.tipo === "mensaje").sort((a, b) => new Date(b.creado) - new Date(a.creado));
  if (!soloMensajes.length) {
    feed.appendChild(h("div", { class: "vacio" }, h("div", { class: "big" }, "📡"), h("p", {}, "Aún no hay mensajes."), h("p", { class: "muted" }, "Sé el primero en escribir algo para la Plana Mayor.")));
  } else {
    for (const m of soloMensajes) feed.appendChild(tarjetaMensaje(m));
  }
  cont.appendChild(feed);
}

function badgePrioridad(m) {
  return h("span", { class: "tag", style: `background:transparent;border:1px solid ${PRIORIDAD_COLOR[m.prioridad]};color:${PRIORIDAD_COLOR[m.prioridad]}` }, PRIORIDADES[m.prioridad] || "Informativa");
}

function bloqueConfirmacion(m) {
  if (m.confirmacion !== "conocimiento_conformidad") return null;
  const confs = confirmacionesDe(m.id);
  const yo = yoConfirme(m.id);
  return h("div", { class: "btn-row mt", style: "align-items:center" },
    yo
      ? h("span", { class: "tag tag--ok" }, "✅ Confirmaste conocimiento")
      : h("button", { class: "btn btn--gold btn--sm", onclick: () => confirmar_(m) }, "✅ Dar por enterado / conforme"),
    h("span", { class: "muted small", style: "cursor:pointer", onclick: () => verConfirmaciones(m, confs) }, `👁️ ${confs.length} confirmaron`));
}

function verConfirmaciones(m, confs) {
  modal({
    titulo: "Confirmaciones de conocimiento y conformidad",
    cuerpo: confs.length
      ? h("div", { class: "list" }, ...confs.map((c) => h("div", { class: "list-item", style: "padding:8px 12px" },
        h("span", {}, nombreDe(c.perfil_id)), h("span", { class: "muted small" }, fechaHora(c.confirmado)))))
      : h("p", { class: "muted" }, "Nadie ha confirmado todavía."),
    acciones: [{ texto: "Cerrar", clase: "btn--ghost", valor: null }],
  });
}

async function confirmar_(m) {
  try { await ctx.db.crear(TABLA_CONFIRM, { mensaje_id: m.id, perfil_id: ctx.sesion.user.id }); toast("Confirmado", "ok"); await cargar(); render(); }
  catch (e) { console.error(e); toast("No se pudo confirmar", "err"); }
}

function tarjetaDisposicion(d) {
  return h("div", { class: "disposicion" },
    h("div", { class: "disposicion__cab" }, "📌 ",
      h("b", {}, d.titulo || "Disposición General"),
      d.tipo_documento ? h("span", { class: "tag", style: "margin-left:6px" }, TIPOS_DOC[d.tipo_documento]) : null,
      badgePrioridad(d),
      h("span", { class: "feed__fecha" }, ` · ${nombreDe(d.creado_por)} · ${fechaHora(d.creado)}`)),
    d.asunto ? h("div", { style: "font-weight:700;color:var(--verde-800);margin-bottom:4px" }, d.asunto) : null,
    h("div", { class: "feed__cuerpo" }, d.contenido),
    d.adjunto_url ? adjuntoEl(d.adjunto_url) : null,
    bloqueConfirmacion(d),
    esMando(perfil) ? h("div", { class: "btn-row mt" }, h("button", { class: "btn btn--ghost btn--sm", onclick: () => eliminarMensaje(d) }, "🗑️ Quitar")) : null);
}

function tarjetaMensaje(m) {
  return h("div", { class: "feed__msg" },
    h("div", { class: "feed__cab" },
      h("span", { class: "feed__autor" }, nombreDe(m.creado_por)),
      badgePrioridad(m),
      h("span", { class: "feed__fecha" }, fechaHora(m.creado))),
    m.asunto ? h("div", { style: "font-weight:700;color:var(--verde-800);margin-bottom:4px" }, m.asunto) : null,
    h("div", { class: "feed__cuerpo" }, m.contenido),
    m.adjunto_url ? adjuntoEl(m.adjunto_url) : null,
    bloqueConfirmacion(m),
    (esMando(perfil) || m.creado_por === ctx.sesion.user.id) ? h("div", { class: "btn-row mt" }, h("button", { class: "btn btn--ghost btn--sm", onclick: () => eliminarMensaje(m) }, "🗑️")) : null);
}

function adjuntoEl(url) {
  const esImagen = /\.(png|jpe?g|gif|webp)$/i.test(url);
  return h("div", { class: "feed__adjunto" },
    esImagen ? h("img", { src: url, style: "max-width:260px;border-radius:8px;border:1px solid var(--linea);cursor:pointer", onclick: () => window.open(url, "_blank") })
      : h("a", { href: url, target: "_blank", class: "btn btn--ghost btn--sm" }, "📎 Ver adjunto"));
}

/* =================== COMPOSER =================== */
function panelComposer() {
  const asunto = h("input", { type: "text", placeholder: "Asunto" });
  const texto = h("textarea", { rows: "3", placeholder: "Escribe un mensaje para toda la Plana Mayor…" });
  const prioridad = h("select", {}, ...Object.entries(PRIORIDADES).map(([v, t]) => h("option", { value: v }, t)));
  const confirmacion = h("select", {},
    h("option", { value: "solo_conocimiento" }, "Solo conocimiento"),
    h("option", { value: "conocimiento_conformidad" }, "Conocimiento y conformidad"));
  const archivo = h("input", { type: "file", style: "display:none" });
  const nombreArchivo = h("span", { class: "muted small" }, "");
  archivo.addEventListener("change", () => { nombreArchivo.textContent = archivo.files[0] ? `📎 ${archivo.files[0].name}` : ""; });

  const btnEnviar = h("button", { class: "btn btn--primary", onclick: () => publicar({ asunto, texto, archivo, prioridad, confirmacion, tipo: "mensaje" }, btnEnviar) }, "📨 Publicar mensaje");
  const acciones = h("div", { class: "btn-row", style: "align-items:center;flex-wrap:wrap" },
    h("label", { class: "btn btn--ghost btn--sm", style: "cursor:pointer" }, "📎 Adjuntar", archivo),
    nombreArchivo, btnEnviar);
  if (esMando(perfil)) acciones.appendChild(h("button", { class: "btn btn--gold btn--sm", onclick: () => publicarDisposicion() }, "📌 Publicar disposición general"));

  return h("div", { class: "panel" }, h("h3", {}, "Nuevo mensaje"),
    h("div", { class: "form-row" },
      h("div", { class: "field" }, h("label", {}, "Asunto"), asunto),
      h("div", { class: "field", style: "flex:0 0 150px" }, h("label", {}, "Prioridad"), prioridad),
      h("div", { class: "field", style: "flex:0 0 220px" }, h("label", {}, "Confirmación"), confirmacion)),
    h("div", { class: "field" }, texto), acciones);
}

async function subirAdjuntoSiHay(archivoInput) {
  const file = archivoInput.files[0];
  if (!file) return null;
  const ruta = `coordinacion/${idNuevo()}-${file.name}`;
  return ctx.db.subirArchivo(ruta, file);
}

async function publicar({ asunto, texto, archivo, prioridad, confirmacion, tipo }, btn) {
  const contenido = texto.value.trim();
  if (!contenido) { toast("Escribe un mensaje", "err"); return; }
  btn.disabled = true;
  try {
    const adjunto_url = await subirAdjuntoSiHay(archivo);
    await ctx.db.crear(TABLA, {
      tipo, contenido, adjunto_url, creado_por: ctx.sesion.user.id,
      asunto: asunto.value.trim() || null, prioridad: prioridad.value, confirmacion: confirmacion.value,
    });
    toast("Mensaje publicado", "ok");
    await cargar(); render();
  } catch (e) { console.error(e); toast("No se pudo publicar", "err"); btn.disabled = false; }
}

function publicarDisposicion() {
  const tipoDoc = h("select", {}, ...Object.entries(TIPOS_DOC).map(([v, t]) => h("option", { value: v, selected: v === "disposicion" }, t)));
  const asunto = h("input", { type: "text", placeholder: "Asunto" });
  const titulo = h("input", { type: "text", placeholder: "Ej.: Formación general, cambio de horario…" });
  const texto = h("textarea", { rows: "4", placeholder: "Contenido de la disposición" });
  const prioridad = h("select", {}, ...Object.entries(PRIORIDADES).map(([v, t]) => h("option", { value: v, selected: v === "importante" }, t)));
  const confirmacion = h("select", {},
    h("option", { value: "solo_conocimiento" }, "Solo conocimiento"),
    h("option", { value: "conocimiento_conformidad", selected: true }, "Conocimiento y conformidad"));

  modal({
    titulo: "📌 Nueva Disposición General",
    cuerpo: h("div", {},
      h("div", { class: "form-row" },
        h("div", { class: "field" }, h("label", {}, "Tipo de documento"), tipoDoc),
        h("div", { class: "field" }, h("label", {}, "Prioridad"), prioridad)),
      h("div", { class: "form-row" }, h("div", { class: "field" }, h("label", {}, "Título"), titulo), h("div", { class: "field" }, h("label", {}, "Asunto"), asunto)),
      h("div", { class: "field", style: "margin-bottom:12px" }, h("label", {}, "Contenido"), texto),
      h("div", { class: "field" }, h("label", {}, "Confirmación requerida"), confirmacion)),
    acciones: [
      { texto: "Cancelar", clase: "btn--ghost", valor: null },
      {
        texto: "📌 Publicar", clase: "btn--gold", valor: "ok",
        onClick: async () => {
          if (!texto.value.trim()) { toast("Escribe el contenido", "err"); return false; }
          try {
            await ctx.db.crear(TABLA, {
              tipo: "disposicion", fijado: true, titulo: titulo.value.trim(), contenido: texto.value.trim(),
              tipo_documento: tipoDoc.value, asunto: asunto.value.trim() || null, prioridad: prioridad.value,
              confirmacion: confirmacion.value, creado_por: ctx.sesion.user.id,
            });
            toast("Disposición publicada", "ok");
            await cargar(); render();
          } catch (e) { console.error(e); toast("No se pudo publicar", "err"); }
        },
      },
    ],
  });
}

async function eliminarMensaje(m) {
  if (!await confirmar("¿Eliminar esta publicación?", { titulo: "Eliminar", textoOk: "Eliminar", peligro: true })) return;
  try { await ctx.db.eliminar(TABLA, m.id); toast("Eliminado", ""); await cargar(); render(); }
  catch { toast("No se pudo eliminar", "err"); }
}
