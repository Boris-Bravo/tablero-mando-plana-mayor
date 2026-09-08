/* app.js — Núcleo del Tablero de Mando y Control de la Plana Mayor. */
import * as db from "./db.js";
import { h, limpiar, toast, modal, confirmar } from "./ui.js";
import { sesionActual, pantallaLogin, cerrarSesion, etiquetaRol, esMando } from "./auth.js";
import { panelResumen } from "./resumen.js";
import { documentacionModulo } from "./modulos/documentacion.js";
import { partesModulo } from "./modulos/partes.js";
import { radiogramaModulo } from "./modulos/radiograma.js";
import { calendarioModulo } from "./modulos/calendario.js";
import { coordinacionModulo } from "./modulos/coordinacion.js";
import { memorandumsModulo } from "./modulos/memorandums.js";
import { efectivosModulo } from "./modulos/efectivos.js";
import { vacacionesModulo } from "./modulos/vacaciones.js";
import { faltasModulo } from "./modulos/faltas.js";
import { inteligenciaModulo } from "./modulos/inteligencia.js";
import { logisticaModulo } from "./modulos/logistica.js";
import { civicaModulo } from "./modulos/civica.js";
import { seccionesModulo } from "./modulos/secciones.js";

const MODULOS = [
  { id: "coordinacion", nombre: "Sala de Coordinación", icono: "📡", desc: "Mensajes y disposiciones generales entre toda la Plana Mayor, en vivo.", render: coordinacionModulo },
  { id: "documentacion", nombre: "Seguimiento de Documentación", icono: "🗂️", desc: "Documentación entrante y saliente por sección. Estado, plazos y proveídos, compartido.", render: documentacionModulo },
  { id: "partes", nombre: "Partes Diarios", icono: "📋", desc: "Parte de personal de cuadros y de tropa. Visible para toda la Plana Mayor al instante.", render: partesModulo },
  { id: "radiograma", nombre: "Radiograma y Fotograma", icono: "📨", desc: "Formato oficial de radiograma, mosaico de fotos y envío por WhatsApp.", render: radiogramaModulo },
  { id: "calendario", nombre: "Calendario de Actividades", icono: "📅", desc: "Calendario mensual compartido: actividades y pendientes de la unidad.", render: calendarioModulo },
  { id: "memorandums", nombre: "Memorandums", icono: "🎖️", desc: "Felicitaciones y sanciones, con flujo de emisión y anulación.", render: memorandumsModulo },
  { id: "efectivos", nombre: "Registro de Efectivos", icono: "🧑‍🤝‍🧑", desc: "Hoja de vida básica de cada integrante de la unidad.", render: efectivosModulo },
  { id: "vacaciones", nombre: "Vacaciones y Permisos", icono: "🌴", desc: "Saldo de vacaciones y movimientos de permisos/compensaciones.", render: vacacionesModulo },
  { id: "faltas", nombre: "Falta a Lista / Bajas Médicas", icono: "🏥", desc: "Control de ausencias del personal.", render: faltasModulo },
  { id: "inteligencia", nombre: "Reportes de Inteligencia", icono: "🔎", desc: "Novedades y reportes de la unidad.", render: inteligenciaModulo },
  { id: "logistica", nombre: "Control Logístico", icono: "🚚", desc: "Inventario de armamento, vehículos, equipo y suministros.", render: logisticaModulo },
  { id: "civica", nombre: "Acción Cívica y Op. Ciudadanas", icono: "🤝", desc: "Actividades cívico-militares realizadas.", render: civicaModulo },
  { id: "secciones", nombre: "Gestionar Secciones", icono: "🧩", desc: "Agrega o edita las secciones del Tablero.", render: seccionesModulo, soloMando: true },
];

// Qué herramientas aparecen dentro de cada sección. Si una sección nueva
// (agregada desde "Gestionar Secciones") no está aquí, usa el valor por
// defecto: solo Documentación filtrada por su clave.
const HERRAMIENTAS_POR_SECCION = {
  comando: ["coordinacion", "partes", "radiograma", "calendario", "secciones"],
  "P-1": ["efectivos", "vacaciones", "faltas", "memorandums", "documentacion"],
  "P-2": ["inteligencia", "documentacion"],
  "P-3": ["partes", "calendario", "documentacion"],
  "P-4": ["logistica", "documentacion"],
  "P-5": ["civica", "documentacion"],
  inspectoria: ["documentacion"],
  ayudantia: ["radiograma", "documentacion"],
};
const HERRAMIENTAS_DEFECTO = ["documentacion"];

const vista = document.getElementById("view");
const btnBack = document.getElementById("btnBack");
const rolPill = document.getElementById("rolPill");

let sesion = null;
let secciones = [];
let seccionActual = null; // clave, o null si estamos en el inicio
let moduloActual = null;
let parametroModuloActual = null;
let cancelarSuscripcionActual = null;

const ctx = {
  db, h, limpiar, toast, modal, confirmar, irInicio, verModulo,
  get sesion() { return sesion; },
  get parametroModulo() { return parametroModuloActual; },
};

/* ---------------- Emblemas (estáticos, opcionales) ---------------- */
const EXT_EMBLEMA = ["jpg", "jpeg", "png", "webp", "svg"];
function cargarImagen(url) {
  return new Promise((res) => { const im = new Image(); im.onload = () => res(true); im.onerror = () => res(false); im.src = url; });
}
async function probarDefault(k) {
  for (const ext of EXT_EMBLEMA) { const url = `assets/icons/${k}.${ext}`; if (await cargarImagen(url)) return url; }
  return null;
}
async function aplicarEmblemas() {
  const ej = document.getElementById("emblemaEjercito");
  const ec = document.getElementById("emblemaEceme");
  const fb = document.getElementById("brandFallback");
  const urlEj = await probarDefault("ejercito");
  const urlEc = await probarDefault("eceme");
  if (urlEj) { ej.src = urlEj; ej.hidden = false; }
  if (urlEc) { ec.src = urlEc; ec.hidden = false; }
  if (fb) fb.hidden = !!(urlEj || urlEc);
}

/* ---------------- Navegación ---------------- */
function limpiarSuscripcion() {
  if (cancelarSuscripcionActual) { cancelarSuscripcionActual(); cancelarSuscripcionActual = null; }
}

function irInicio() {
  if (!sesion) return;
  limpiarSuscripcion();
  moduloActual = null;
  seccionActual = null;
  btnBack.hidden = true;
  location.hash = "";
  renderInicio();
}

function volver() {
  if (moduloActual && seccionActual) { verSeccion(seccionActual); }
  else irInicio();
}

function herramientasDe(clave) {
  const ids = HERRAMIENTAS_POR_SECCION[clave] || HERRAMIENTAS_DEFECTO;
  return ids.map((id) => MODULOS.find((m) => m.id === id)).filter(Boolean);
}

function verSeccion(clave) {
  const s = secciones.find((x) => x.clave === clave);
  if (!s) return irInicio();
  limpiarSuscripcion();
  seccionActual = clave;
  moduloActual = null;
  btnBack.hidden = false;
  location.hash = `seccion:${clave}`;
  limpiar(vista);

  vista.appendChild(h("div", { class: "hero" },
    h("h1", {}, `${s.icono || "🧩"} ${s.nombre}`),
    s.descripcion ? h("p", {}, s.descripcion) : null));

  const herramientas = herramientasDe(clave).filter((m) => !m.soloMando || esMando(sesion.perfil));
  const grid = h("div", { class: "grid-modulos" });
  for (const m of herramientas) {
    grid.appendChild(h("div", {
      class: "modulo-card",
      onclick: () => verModulo(m.id, m.id === "documentacion" ? { campo: clave } : null),
    },
      h("div", { class: "modulo-card__icon" }, m.icono),
      h("h3", { class: "modulo-card__title" }, m.nombre),
      h("p", { class: "modulo-card__desc" }, m.desc)));
  }
  vista.appendChild(grid);
}

function verModulo(id, parametro = null) {
  const m = MODULOS.find((x) => x.id === id);
  if (!m) return irInicio();
  limpiarSuscripcion();
  moduloActual = id;
  parametroModuloActual = parametro;
  btnBack.hidden = false;
  location.hash = id;
  limpiar(vista);
  try {
    const posibleCancelar = m.render(vista, ctx);
    if (typeof posibleCancelar === "function") cancelarSuscripcionActual = posibleCancelar;
    else Promise.resolve(posibleCancelar)
      .then((c) => { if (typeof c === "function") cancelarSuscripcionActual = c; })
      .catch((e) => mostrarErrorModulo(id, e));
  } catch (e) {
    mostrarErrorModulo(id, e);
  }
}

function mostrarErrorModulo(id, e) {
  console.error(e);
  if (moduloActual !== id) return; // el usuario ya navegó a otro lado, no pisar esa vista
  limpiar(vista);
  vista.appendChild(h("div", { class: "construccion" },
    h("div", { class: "emoji" }, "⚠️"),
    h("h2", {}, "Error al abrir el módulo"),
    h("p", {}, String(e.message || e))));
}

/* ---------------- Tablero de inicio ---------------- */
let tokenInicio = 0;
async function renderInicio() {
  limpiar(vista);
  const idInicio = ++tokenInicio; // evita pintar un panorama viejo si el usuario navega rápido
  vista.appendChild(h("div", { class: "hero" },
    h("h1", {}, "Tablero de Mando y Control"),
    h("p", {}, `${etiquetaRol(sesion.perfil)} — Plana Mayor del Regimiento, en tiempo real`)));

  const resumen = await panelResumen(ctx);
  secciones = await db.listar("secciones", { orden: "orden", ascendente: true });
  if (idInicio !== tokenInicio) return; // el usuario ya cambió de vista
  if (resumen) vista.appendChild(resumen);

  const grid = h("div", { class: "grid-modulos" });
  for (const s of secciones) {
    grid.appendChild(h("div", { class: "modulo-card", onclick: () => verSeccion(s.clave) },
      h("div", { class: "modulo-card__icon" }, s.icono || "🧩"),
      h("h3", { class: "modulo-card__title" }, s.nombre),
      h("p", { class: "modulo-card__desc" }, s.descripcion || "")));
  }
  vista.appendChild(grid);
}

/* ---------------- Arranque ---------------- */
async function mostrarApp() {
  rolPill.hidden = false;
  rolPill.querySelector(".rol-pill__texto").textContent = `${sesion.perfil.nombre || sesion.user.email} · ${etiquetaRol(sesion.perfil)}`;
  await aplicarEmblemas();
  try {
    secciones = await db.listar("secciones", { orden: "orden", ascendente: true });
  } catch (e) {
    console.error(e);
    limpiar(vista);
    vista.appendChild(h("div", { class: "construccion" },
      h("div", { class: "emoji" }, "⚠️"),
      h("h2", {}, "Falta actualizar la base de datos"),
      h("p", {}, "No se pudo leer la tabla “secciones”. Vuelve a ejecutar sql/schema.sql completo en el SQL Editor de Supabase (es seguro repetirlo) y recarga esta página."),
      h("p", { class: "muted small" }, String(e.message || e))));
    return;
  }
  const hash = location.hash.replace("#", "");
  if (hash.startsWith("seccion:")) verSeccion(hash.slice("seccion:".length));
  else if (hash && MODULOS.some((m) => m.id === hash)) verModulo(hash);
  else irInicio();
}

async function arrancar() {
  document.getElementById("btnBack").addEventListener("click", volver);
  document.getElementById("brandHome").addEventListener("click", irInicio);
  document.getElementById("btnSalir").addEventListener("click", async () => {
    if (!await confirmar("¿Cerrar tu sesión?", { titulo: "Cerrar sesión" })) return;
    limpiarSuscripcion();
    await cerrarSesion();
    sesion = null;
    rolPill.hidden = true;
    btnBack.hidden = true;
    pantallaLogin(vista, async (s) => { sesion = s; await mostrarApp(); });
  });

  sesion = await sesionActual();
  if (!sesion) {
    pantallaLogin(vista, async (s) => { sesion = s; await mostrarApp(); });
  } else {
    await mostrarApp();
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

window.addEventListener("hashchange", () => {
  if (!sesion) return;
  const hash = location.hash.replace("#", "");
  if (!hash) { if (moduloActual || seccionActual) irInicio(); }
  else if (hash.startsWith("seccion:")) verSeccion(hash.slice("seccion:".length));
  else if (hash !== moduloActual && MODULOS.some((m) => m.id === hash)) verModulo(hash);
});

arrancar();
