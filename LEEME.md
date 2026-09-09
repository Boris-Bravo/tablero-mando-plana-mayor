# Tablero de Mando y Control de la Plana Mayor

App colaborativa: toda la Plana Mayor accede con su propia cuenta y ve los cambios de los demás en tiempo real. A diferencia del "Cuadro de Mando y Control del 2do Comandante" (que es de un solo usuario y vive en tu equipo), esta versión guarda los datos en la nube (Supabase), gratis para un equipo de este tamaño.

## 👥 Quiénes son parte de la app

Dos roles de mando con control total, y 12 puestos de Plana Mayor (cada uno administra lo suyo y ve todo lo demás):

- **Comandante** y **2do Comandante** (el 2do Comandante funge también como Jefe de Plana Mayor — por eso el rol se muestra como "2do Comandante / Jefe de Plana Mayor") — mando: ven y editan todo, emiten memorandums, y el 2do Comandante administra las cuentas desde Supabase.
- **P-1 Personal**, **P-2 Inteligencia**, **P-3 Operaciones**, **P-4 Logística**, **P-5 Acción Cívica y Op. Ciudadanas**, **Ayudantía**, **Radio Operador**, **Inspectoría**, **Suboficial de Comando**, **Cmte. Compañía A**, **Cmte. Compañía B**, **Cmte. Compañía C** — cada uno inicia sesión con su propio correo y contraseña.

¿Necesitas agregar otro puesto más adelante (otra compañía, Capellanía, etc.)? Entra a **Comando y Plana Mayor → Gestionar Secciones** y créalo ahí mismo, sin tocar código.

## 🧩 Estructura: secciones y herramientas

El inicio muestra **secciones** (portales), no una lista plana de módulos. Cada sección agrupa sus herramientas:

| Sección | Herramientas | Quién escribe |
|---|---|---|
| 🎖️ Comando y Plana Mayor | Sala de Coordinación, Partes Diarios, Radiograma, Calendario, Gestionar Secciones | Mando (Coordinación: todos publican mensajes; solo mando fija Disposiciones) |
| 🧑‍🤝‍🧑 P-1 Personal | Registro de Efectivos, Vacaciones y Permisos, Falta a Lista/Bajas Médicas, Memorandums, Documentación | P-1 (o mando) |
| 🔎 P-2 Inteligencia | Reportes de Inteligencia, Documentación | P-2 (o mando) |
| 🗺️ P-3 Operaciones | Partes Diarios, Calendario, Documentación | Mando |
| 🚚 P-4 Logística | Control Logístico, Documentación | P-4 (o mando) |
| 🤝 P-5 Acción Cívica | Actividades Cívico-Militares, Documentación | P-5 (o mando) |
| 🛡️ Inspectoría | Documentación | Mando |
| 🗂️ Ayudantía | Radiograma, Documentación | Mando |
| 📻 Radio Operador | Radiograma, Documentación | Radio Operador (o mando) |
| 🎖️ Suboficial de Comando | Documentación | Mando |
| 🪖 Cmte. Compañía A/B/C | Documentación | Cmte. de esa compañía (o mando) |

*(Mando = Comandante o 2do Comandante — son los únicos dos roles con acceso total)*

**¿Quieres agregar una sección nueva** (Capellanía, Comunicaciones, Sanidad, etc.)? Entra a **Comando y Plana Mayor → Gestionar Secciones** (solo visible para el mando) y créala ahí mismo, sin tocar código. Por defecto una sección nueva solo trae el atajo a Documentación; si necesitas una herramienta propia para ella, pídemelo y la agrego.

---

## 🚀 Configuración inicial (una sola vez)

### 1. Crear el proyecto en Supabase

1. Entra a **https://supabase.com** con Chrome → crea una cuenta gratuita → **New project**.
2. Elige un nombre (ej. "tablero-plana-mayor"), una contraseña de base de datos (guárdala) y la región más cercana.
3. Espera 1-2 minutos a que el proyecto termine de crearse.

### 2. Crear las tablas y permisos

1. En el panel del proyecto, abre **SQL Editor → New query**.
2. Abre el archivo [`sql/schema.sql`](sql/schema.sql) de esta carpeta, copia **todo** su contenido y pégalo ahí (borra cualquier cosa que hubiera antes en el cuadro).
3. Presiona **Run**. Deberías ver "Success. No rows returned".

> **Importante:** cada vez que la app agregue módulos nuevos (como pasó al construir P-1…P-5), `sql/schema.sql` va a crecer. Repite este paso 2 completo — es seguro volver a correrlo, no borra tus datos existentes — cada vez que yo te lo indique.

### 3. Conectar la app con tu proyecto

1. En Supabase: **Project Settings → API**.
2. Copia **Project URL** y la clave **anon public**.
3. Abre [`assets/js/config.js`](assets/js/config.js) en esta carpeta y reemplaza los dos valores de ejemplo por los tuyos.

### 4. Crear las cuentas de la Plana Mayor

Las cuentas **no se auto-registran** — las creas tú, el 2do Comandante, para mantener el equipo cerrado.

Por cada persona (incluido tú mismo):

1. **Authentication → Users → Add user** → correo + contraseña temporal (dile a la persona que la cambie luego desde "¿Olvidaste tu contraseña?" o compártesela en persona).
2. Copia el **User UID** que se generó.
3. Ve a **Table Editor → perfiles → Insert row** y completa:
   - `id`: pega el User UID del paso anterior.
   - `nombre`: nombre completo para mostrar en la app.
   - `grado`: grado militar (opcional).
   - `rol`: `comandante`, `segundo_comandante`, o `jefe_campo` (para cualquiera de los 9 puestos de Plana Mayor).
   - `campo`: solo si el rol es `jefe_campo` → uno de: `P-1`, `P-2`, `P-3`, `P-4`, `P-5`, `ayudantia`, `radio-operador`, `inspectoria`, `sof-cmdo`, `comp-a`, `comp-b`, `comp-c`.

Sin este paso, la persona puede iniciar sesión pero la app le dirá que no tiene un perfil asignado.

### 5. Probar la app

Doble clic en **`Iniciar TABLERO PLANA MAYOR.bat`**. Se abrirá el servidor y luego la app pidiendo correo y contraseña.

---

## 📲 Instalarla como app

Con la app abierta en Edge/Chrome: menú (⋯) → **Aplicaciones → Instalar este sitio como aplicación**.

## 🌐 Publicarla para que todos la usen desde su celular/laptop (no solo tú)

Mientras esté solo en tu carpeta local, únicamente tú puedes abrirla. Para que el resto de la Plana Mayor entre desde su propio equipo necesitas publicarla en internet (por ejemplo GitHub Pages, gratis) — dime cuándo quieres hacerlo y lo dejamos listo; solo pide tu confirmación porque implica crear un repositorio público.

## ⚠️ Notas importantes

- Esta app **necesita internet** para funcionar (a diferencia del Cuadro de Mando de un solo usuario, que trabajaba sin conexión). No hay modo offline porque los datos son compartidos en vivo.
- La `anon key` de `config.js` es pública a propósito — quien realmente protege los datos son los permisos (RLS) definidos en `sql/schema.sql`.
- Si necesitas cambiar el rol de alguien o revocarle acceso, se hace desde el panel de Supabase (`perfiles` y `Authentication → Users`), no desde la app.
