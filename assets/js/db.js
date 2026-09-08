/*
 * db.js — Acceso a datos compartidos (Supabase). Reemplaza a storage.js.
 *
 * A diferencia de storage.js (un solo JSON por módulo, un solo usuario),
 * aquí cada módulo trabaja con FILAS de una tabla en Postgres, compartidas
 * por toda la Plana Mayor. Quién puede leer/crear/editar cada fila lo deciden
 * las políticas RLS del lado del servidor (ver sql/schema.sql) — el frontend
 * solo pide, Supabase aplica el permiso real.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const cliente = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Lee todas las filas visibles de una tabla (RLS decide cuáles ve el usuario actual).
export async function listar(tabla, { orden = "creado", ascendente = false } = {}) {
  const { data, error } = await cliente.from(tabla).select("*").order(orden, { ascending: ascendente });
  if (error) throw error;
  return data || [];
}

// Inserta una fila nueva. Devuelve la fila creada (con su id generado).
export async function crear(tabla, obj) {
  const { data, error } = await cliente.from(tabla).insert(obj).select().single();
  if (error) throw error;
  return data;
}

// Actualiza una fila por id. Si el usuario no tiene permiso, RLS lo bloquea con error.
export async function actualizar(tabla, id, cambios) {
  const { data, error } = await cliente.from(tabla).update(cambios).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function eliminar(tabla, id) {
  const { error } = await cliente.from(tabla).delete().eq("id", id);
  if (error) throw error;
}

// Se suscribe a cambios en tiempo real de una tabla. Llama a `onCambio()` cada vez
// que alguien (tú u otro miembro de la Plana Mayor) inserta/edita/borra una fila.
// Devuelve una función para cancelar la suscripción al salir del módulo.
export function suscribir(tabla, onCambio) {
  const canal = cliente
    .channel(`cambios-${tabla}`)
    .on("postgres_changes", { event: "*", schema: "public", table: tabla }, onCambio)
    .subscribe();
  return () => cliente.removeChannel(canal);
}

// Mapa id → perfil, útil para mostrar el nombre/rol de quien creó cada fila.
export async function mapaPerfiles() {
  const filas = await listar("perfiles");
  return new Map(filas.map((p) => [p.id, p]));
}

/* ---------- Ajustes compartidos por módulo (tabla "ajustes", una fila por clave) ---------- */
export async function leerAjustes(clave, porDefecto = {}) {
  const { data, error } = await cliente.from("ajustes").select("valor").eq("clave", clave).maybeSingle();
  if (error) throw error;
  return data ? data.valor : porDefecto;
}

export async function guardarAjustes(clave, valor) {
  const { error } = await cliente.from("ajustes").upsert({ clave, valor, actualizado: new Date().toISOString() });
  if (error) throw error;
}

/* ---------- Archivos adjuntos (bucket "adjuntos" de Supabase Storage) ---------- */
const BUCKET = "adjuntos";

export async function subirArchivo(ruta, file) {
  const { error } = await cliente.storage.from(BUCKET).upload(ruta, file, { upsert: true });
  if (error) throw error;
  const { data } = cliente.storage.from(BUCKET).getPublicUrl(ruta);
  return data.publicUrl;
}
