/*
 * auth.js — Sesión, perfil y rol del usuario actual.
 *
 * Las cuentas no se auto-registran: el 2do Comandante las crea desde el panel
 * de Supabase (Authentication → Users) y les asigna una fila en `perfiles`
 * con su rol. Aquí solo se maneja el login y la lectura de ese rol.
 */
import { cliente } from "./db.js";
import { h, toast } from "./ui.js";

export const ROLES = {
  comandante: "Comandante",
  segundo_comandante: "2do Comandante / Jefe de Plana Mayor",
  jefe_campo: "Miembro de Plana Mayor",
};

// Los puestos de Plana Mayor (además de Comandante y 2do Comandante), que se
// guardan en perfiles.campo cuando rol = 'jefe_campo'. Coinciden con las
// claves de la tabla `secciones` (el mando puede agregar más desde
// "Gestionar Secciones" sin tocar código).
export const NOMBRES_CAMPO = {
  "P-1": "P-1 Personal",
  "P-2": "P-2 Inteligencia",
  "P-3": "P-3 Operaciones",
  "P-4": "P-4 Logística",
  "P-5": "P-5 Acción Cívica y Op. Ciudadanas",
  ayudantia: "Ayudantía",
  "radio-operador": "Radio Operador",
  inspectoria: "Inspectoría",
  "sof-cmdo": "Suboficial de Comando",
  "comp-a": "Cmte. Compañía A",
  "comp-b": "Cmte. Compañía B",
  "comp-c": "Cmte. Compañía C",
};

// "Mando" = Comandante y 2do Comandante, MÁS Radio Operador y Ayudantía: los
// 4 puestos con acceso irrestricto a toda la app. El resto de jefe_campo solo
// administra su propio campo y ve el resto en modo lectura. Debe coincidir
// con la función es_mando() de sql/schema.sql (esto solo controla qué botones
// se muestran en la app; el permiso real siempre lo aplica la base de datos).
const ROLES_MANDO = ["comandante", "segundo_comandante"];
const CAMPOS_MANDO = ["radio-operador", "ayudantia"];

export function esMando(perfil) {
  if (!perfil) return false;
  if (ROLES_MANDO.includes(perfil.rol)) return true;
  return perfil.rol === "jefe_campo" && CAMPOS_MANDO.includes(perfil.campo);
}

// ¿Puede este usuario editar documentación del campo/puesto indicado?
export function puedeEditarCampo(perfil, campo) {
  if (esMando(perfil)) return true;
  return perfil && perfil.rol === "jefe_campo" && perfil.campo === campo;
}

export function etiquetaRol(perfil) {
  if (!perfil) return "";
  if (perfil.rol === "jefe_campo" && perfil.campo) return NOMBRES_CAMPO[perfil.campo] || perfil.campo;
  return ROLES[perfil.rol] || perfil.rol;
}

/* ---------- Sesión ---------- */

export async function sesionActual() {
  const { data: { session } } = await cliente.auth.getSession();
  if (!session) return null;
  const perfil = await cargarPerfil(session.user.id);
  return { user: session.user, perfil };
}

async function cargarPerfil(userId) {
  const { data, error } = await cliente.from("perfiles").select("*").eq("id", userId).single();
  if (error) return null;
  return data;
}

export async function iniciarSesion(email, password) {
  const { error } = await cliente.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function cerrarSesion() {
  await cliente.auth.signOut();
}

// Envía el correo de "recuperar contraseña". El enlace del correo trae de
// vuelta a esta misma app y dispara el evento PASSWORD_RECOVERY (ver abajo).
export async function recuperarPassword(email) {
  const { error } = await cliente.auth.resetPasswordForEmail(email, {
    redirectTo: location.origin + location.pathname,
  });
  if (error) throw error;
}

export async function actualizarPassword(nuevaClave) {
  const { error } = await cliente.auth.updateUser({ password: nuevaClave });
  if (error) throw error;
}

export function onCambioSesion(cb) {
  cliente.auth.onAuthStateChange((evento, session) => cb(evento, session));
}

/* ---------- Pantalla de acceso ---------- */

export function pantallaLogin(contenedor, onListo) {
  contenedor.innerHTML = "";
  const email = h("input", { type: "email", placeholder: "tu-correo@ejemplo.com", autocomplete: "username" });
  const clave = h("input", { type: "password", placeholder: "Contraseña", autocomplete: "current-password" });
  const error = h("div", { class: "error" });
  const btn = h("button", { class: "btn btn--primary" }, "Ingresar");

  async function intentar() {
    if (!email.value || !clave.value) { error.textContent = "Completa correo y contraseña."; return; }
    btn.disabled = true; btn.textContent = "Ingresando…"; error.textContent = "";
    try {
      await iniciarSesion(email.value.trim(), clave.value);
      const s = await sesionActual();
      if (!s || !s.perfil) {
        error.textContent = "Tu cuenta no tiene un perfil/rol asignado. Contacta al 2do Comandante.";
        await cerrarSesion();
        btn.disabled = false; btn.textContent = "Ingresar";
        return;
      }
      onListo(s);
    } catch (e) {
      error.textContent = "Correo o contraseña incorrectos.";
      btn.disabled = false; btn.textContent = "Ingresar";
    }
  }
  btn.addEventListener("click", intentar);
  clave.addEventListener("keydown", (e) => { if (e.key === "Enter") intentar(); });

  const olvido = h("a", { href: "#", style: "display:inline-block;margin-top:14px;font-size:12.5px;color:var(--cyan)",
    onclick: (e) => { e.preventDefault(); abrirRecuperar(email.value.trim()); } }, "¿Olvidaste tu contraseña?");

  contenedor.appendChild(h("div", { class: "login-wrap" },
    h("div", { class: "login-card panel" },
      h("img", { src: "assets/icons/icon.svg", alt: "", style: "width:64px;height:64px" }),
      h("h1", {}, "Tablero de Mando y Control"),
      h("p", { class: "sub" }, "Plana Mayor del Regimiento — acceso con tu cuenta"),
      h("div", { class: "field" }, h("label", {}, "Correo"), email),
      h("div", { class: "field" }, h("label", {}, "Contraseña"), clave),
      btn,
      error,
      olvido)));
}

function abrirRecuperar(correoPrevio) {
  const email = h("input", { type: "email", value: correoPrevio || "", placeholder: "tu-correo@ejemplo.com" });
  modalRecuperar({
    titulo: "Recuperar contraseña",
    cuerpo: h("div", {},
      h("p", { class: "muted small", style: "margin:0 0 12px" }, "Te enviaremos un correo con un enlace para elegir una contraseña nueva."),
      h("div", { class: "field" }, h("label", {}, "Correo"), email)),
    onEnviar: async () => {
      if (!email.value.trim()) { toast("Indica tu correo", "err"); return false; }
      try {
        await recuperarPassword(email.value.trim());
        toast("Correo enviado. Revisa tu bandeja de entrada.", "ok");
        return true;
      } catch (e) {
        toast("No se pudo enviar el correo", "err");
        return false;
      }
    },
  });
}

// Modal mínimo, independiente de ui.js, para no depender de que ese módulo
// esté disponible antes de iniciar sesión (mismo patrón visual que el resto).
function modalRecuperar({ titulo, cuerpo, onEnviar }) {
  const back = h("div", { class: "modal-back" });
  const cerrar = () => back.remove();
  const box = h("div", { class: "modal", style: "max-width:380px" },
    h("div", { class: "modal__head" }, h("h3", {}, titulo), h("button", { class: "iconbtn", style: "background:#eee;color:#333;border:none", onclick: cerrar }, "✕")),
    h("div", { class: "modal__body" }, cuerpo),
    h("div", { class: "modal__foot" },
      h("button", { class: "btn btn--ghost", onclick: cerrar }, "Cancelar"),
      h("button", { class: "btn btn--primary", onclick: async (e) => { const ok = await onEnviar(); if (ok) cerrar(); } }, "Enviar")));
  back.appendChild(box);
  back.addEventListener("click", (e) => { if (e.target === back) cerrar(); });
  document.body.appendChild(back);
}

/* ---------- Pantalla de nueva contraseña (tras el enlace de recuperación) ---------- */

export function pantallaNuevaClave(contenedor, onListo) {
  contenedor.innerHTML = "";
  const clave = h("input", { type: "password", placeholder: "Nueva contraseña", autocomplete: "new-password" });
  const clave2 = h("input", { type: "password", placeholder: "Repite la contraseña", autocomplete: "new-password" });
  const error = h("div", { class: "error" });
  const btn = h("button", { class: "btn btn--primary" }, "Guardar nueva contraseña");

  async function guardar() {
    if (!clave.value || clave.value.length < 6) { error.textContent = "La contraseña debe tener al menos 6 caracteres."; return; }
    if (clave.value !== clave2.value) { error.textContent = "Las contraseñas no coinciden."; return; }
    btn.disabled = true; btn.textContent = "Guardando…"; error.textContent = "";
    try {
      await actualizarPassword(clave.value);
      toast("Contraseña actualizada", "ok");
      onListo();
    } catch (e) {
      error.textContent = "No se pudo actualizar la contraseña.";
      btn.disabled = false; btn.textContent = "Guardar nueva contraseña";
    }
  }
  btn.addEventListener("click", guardar);
  clave2.addEventListener("keydown", (e) => { if (e.key === "Enter") guardar(); });

  contenedor.appendChild(h("div", { class: "login-wrap" },
    h("div", { class: "login-card panel" },
      h("img", { src: "assets/icons/icon.svg", alt: "", style: "width:64px;height:64px" }),
      h("h1", {}, "Nueva contraseña"),
      h("p", { class: "sub" }, "Elige tu nueva contraseña para entrar al Tablero"),
      h("div", { class: "field" }, h("label", {}, "Nueva contraseña"), clave),
      h("div", { class: "field" }, h("label", {}, "Repetir contraseña"), clave2),
      btn,
      error)));
}
