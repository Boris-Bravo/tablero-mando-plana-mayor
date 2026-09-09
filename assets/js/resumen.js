/*
 * resumen.js — Panorama de inicio, distinto según el rol de quien entra.
 *
 * Esto es lo que en SIPE eran "niveles de acceso" (portales separados por
 * rol), pero en vivo: en vez de tarjetas estáticas, cada quien ve de entrada
 * el estado real de lo que le corresponde vigilar.
 */
import { h } from "./ui.js";
import { esMando } from "./auth.js";

function diasRestantes(plazo) {
  if (!plazo) return null;
  const [a, m, d] = plazo.split("-").map(Number);
  const p = new Date(a, m - 1, d);
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  return Math.round((p - hoy) / 86400000);
}
function claveEstado(d, diasAlerta) {
  if (d.estado === "cumplido") return "cumplido";
  const dr = diasRestantes(d.plazo);
  if (dr !== null && dr < 0) return "vencido";
  if (dr !== null && dr <= diasAlerta) return "porvencer";
  return d.estado === "tramite" ? "tramite" : "pendiente";
}

function chip(txt, n, color, onclick) {
  return h("span", { class: "chip", style: `border-left:4px solid ${color}${onclick ? ";cursor:pointer" : ";cursor:default"}`, onclick },
    h("b", { style: `color:${color}` }, String(n)), " " + txt);
}

export async function panelResumen(ctx) {
  const perfil = ctx.sesion.perfil;
  const panel = h("div", { class: "panel" });

  try {
    if (esMando(perfil)) {
      const [ajustesDoc, documentos, memorandums, mensajes] = await Promise.all([
        ctx.db.leerAjustes("documentacion", { diasAlerta: 3 }),
        ctx.db.listar("documentos"),
        ctx.db.listar("memorandums"),
        ctx.db.listar("tablon_mensajes"),
      ]);
      const diasAlerta = ajustesDoc.diasAlerta || 3;
      const pendientes = documentos.filter((d) => ["pendiente", "tramite"].includes(claveEstado(d, diasAlerta))).length;
      const vencidos = documentos.filter((d) => claveEstado(d, diasAlerta) === "vencido").length;
      const porvencer = documentos.filter((d) => claveEstado(d, diasAlerta) === "porvencer").length;
      const borradores = memorandums.filter((m) => m.estado === "borrador").length;
      const hace24h = Date.now() - 24 * 3600 * 1000;
      const mensajesRecientes = mensajes.filter((m) => new Date(m.creado).getTime() >= hace24h).length;

      panel.append(
        h("h3", {}, "📊 Panorama de Mando"),
        h("div", { class: "chips" },
          chip("Documentos pendientes", pendientes, "#ffca6e", () => ctx.verModulo("documentacion")),
          chip("Documentos vencidos", vencidos, "var(--rojo-claro)", () => ctx.verModulo("documentacion")),
          chip("Por vencer", porvencer, "#ffb02e", () => ctx.verModulo("documentacion")),
          chip("Memorandums en borrador", borradores, "var(--cyan)", () => ctx.verModulo("memorandums")),
          chip("Mensajes últimas 24h", mensajesRecientes, "var(--verde-ok)", () => ctx.verModulo("coordinacion"))));
    } else {
      const [ajustesDoc, documentos] = await Promise.all([
        ctx.db.leerAjustes("documentacion", { diasAlerta: 3 }),
        ctx.db.listar("documentos"),
      ]);
      const diasAlerta = ajustesDoc.diasAlerta || 3;
      const propios = documentos.filter((d) => (d.campos || []).includes(perfil.campo));
      const pendientes = propios.filter((d) => ["pendiente", "tramite"].includes(claveEstado(d, diasAlerta))).length;
      const vencidos = propios.filter((d) => claveEstado(d, diasAlerta) === "vencido").length;
      const porvencer = propios.filter((d) => claveEstado(d, diasAlerta) === "porvencer").length;

      panel.append(
        h("h3", {}, `📋 Tu correspondencia: ${perfil.campo}`),
        h("div", { class: "chips" },
          chip("Pendientes", pendientes, "#ffca6e", () => ctx.verModulo("documentacion")),
          chip("Vencidos", vencidos, "var(--rojo-claro)", () => ctx.verModulo("documentacion")),
          chip("Por vencer", porvencer, "#ffb02e", () => ctx.verModulo("documentacion"))),
        h("div", { class: "btn-row mt" }, h("button", { class: "btn btn--primary btn--sm", onclick: () => ctx.verModulo("documentacion") }, "Ir a Correspondencia")));
    }
  } catch (e) {
    console.error(e);
    return null; // Si algo falla al calcular el panorama, simplemente no se muestra (el resto de la app sigue funcionando).
  }
  return panel;
}
