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
  segundo_comandante: "2do Comandante",
  jefe_plana_mayor: "Jefe de Plana Mayor",
  jefe_campo: "Jefe de Campo",
  staff: "Personal",
};

// Roles que pueden escribir en cualquier campo/módulo compartido (mando).
const ROLES_MANDO = ["comandante", "segundo_comandante", "jefe_plana_mayor"];

export function esMando(perfil) {
  return !!perfil && ROLES_MANDO.includes(perfil.rol);
}

// ¿Puede este usuario editar documentación del campo P-1..P-5 indicado?
export function puedeEditarCampo(perfil, campo) {
  if (esMando(perfil)) return true;
  return perfil && perfil.rol === "jefe_campo" && perfil.campo === campo;
}

export function etiquetaRol(perfil) {
  if (!perfil) return "";
  const base = ROLES[perfil.rol] || perfil.rol;
  return perfil.rol === "jefe_campo" && perfil.campo ? `${base} ${perfil.campo}` : base;
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

export function onCambioSesion(cb) {
  cliente.auth.onAuthStateChange((_evento, session) => cb(session));
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

  contenedor.appendChild(h("div", { class: "login-wrap" },
    h("div", { class: "login-card panel" },
      h("img", { src: "assets/icons/icon.svg", alt: "", style: "width:64px;height:64px" }),
      h("h1", {}, "Tablero de Mando y Control"),
      h("p", { class: "sub" }, "Plana Mayor del Regimiento — acceso con tu cuenta"),
      h("div", { class: "field" }, h("label", {}, "Correo"), email),
      h("div", { class: "field" }, h("label", {}, "Contraseña"), clave),
      btn,
      error)));
}
