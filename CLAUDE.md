# CRM Ambriz — Contexto para Claude

App de cliente+servidor (Express + JSON file db en `server/db.json`, desplegada
en Hostinger vía `deploy.sh`). Cada usuario (asesor) tiene su propio login y
gestiona sus propios `clients`/`prospects`. El usuario admin (Diego,
`role: 'admin'`, `davalosdiego833@gmail.com`) ya existe en `db.json`.

## Sección de Promotoría (implementada 2026-09-24)

Panorama de TODA la promotoría, separado de lo que ve cada asesor normal.
Decisión de Diego: **no** vive colgada de su cuenta `admin` — es un **rol
nuevo `'promotoria'`**, pensado para que lo opere alguien más (un asistente).
Solo el Master (`admin`) puede crear cuentas con ese rol, desde el panel de
Administración normal ("Aperturar CRM" → selector de rol → "Promotoría").

Una cuenta `'promotoria'` tiene una estructura de CRM aparte a la de un
asesor: en el sidebar solo ve **"Administración"** (mismo panel de
altas/bajas/contraseñas de asesores que ya existía, extendido para incluir
este rol) y **"Promotoría"** (`client/src/views/Promotoria.jsx`) — nada de
Dashboard/Base de Datos/Prospección/Estadísticas/Plantillas, porque no
maneja cartera propia. Ve ambos despachos (Ambriz y Novaris), igual que el
Master.

Datos en `server/promotoria.json` (aparte de `db.json`), rutas
`/api/promotoria/*` protegidas por el middleware `promotoriaAccess`
(`admin` + `promotoria`) en `server/index.js`. Las 3 secciones:

1. **Asesores**: cumpleaños y fecha de firma de contrato. Se captura a mano
   — no se pre-cargó desde el `asesores.json` del proyecto hermano.
2. **Estatus de cancelaciones**: importa `historial_cambios.xlsx` del
   proyecto hermano `/Users/diego/Desktop/ESTATUS DE POLIZAS` vía
   `POST /api/promotoria/cancelaciones/import` (multipart, reemplaza todas
   las filas — el Excel de origen ya es el historial acumulado completo, no
   hace falta acumular también en el CRM). **Ya está automatizado**: el
   script `scripts/3_reporte_diario.py` de ese proyecto sube el archivo
   solo, cada corrida, después de actualizar el historial — usa una cuenta
   `'promotoria'` guardada en el Llavero de macOS, servicio
   `crm-promotoria-api` (ver el `README.md` de ese proyecto). Es best
   effort: si falla, solo avisa, no rompe el reporte diario.
3. **Pre-contratos**: personas con clave, fecha de apertura, countdown de
   vencimiento fijo a **90 días** (calculado en el servidor —
   `VIGENCIA_CLAVE_DIAS` en `server/index.js`). Se alimenta del historial de
   claves temporales, no de Cancelaciones (ver sección de abajo — el diseño
   original de cruzar contra Cancelaciones estaba mal y ya se corrigió).

La pestaña Asesores también tiene, arriba de la tabla, dos tarjetas con
quién cumple años y quién cumple aniversario de firma **este mes**, más
filtros (nombre, cumpleaños del mes, aniversarios del mes). Cancelaciones
tiene filtro de fecha (Hoy/Semana/Mes/Historial/rango) y filtro de producto
por prefijo de póliza (VI = Vida, GM = GMM).

## Gerencia de Karen (implementada 2026-09-29)

Otra cuenta del mismo portal de la aseguradora, asesores distintos a los de
la Promotoría de Diego — **no** vive colgada de una cuenta/rol nueva, sino
de un **selector de organización** arriba de la vista de Promotoría
existente ("PROMOTORÍA AMBRIZ" / "GERENCIA KAREN", `ORGS` en
`Promotoria.jsx`), visible para la misma cuenta `'promotoria'`/`admin` de
siempre. Se eligió así (en vez de un rol nuevo) porque la necesidad era
separación de datos/vista, no de acceso — nadie de Karen inicia sesión al
CRM por separado; si eso cambia, se puede agregar un rol restringido encima
de los mismos componentes sin rediseñar.

Datos completamente separados en `server/karen.json` (nunca se combinan con
`promotoria.json`), rutas paralelas `/api/karen/*` con el mismo middleware
`promotoriaAccess`. Karen **no tiene pestaña de Asesores** — sus asesores se
detectan automáticamente en el portal (sin lista curada tipo
`asesores.json`), solo tiene Cancelaciones y Pre-contratos, mismos
componentes que Promotoría reutilizados vía un prop `apiBase`.

Instrucción explícita de Diego para este diseño: **sin emojis**, que se vea
profesional (aplica al selector de organización y a lo que se agregue de
aquí en adelante en Karen — no se tocó retroactivamente el resto de
Promotoría, que ya traía emojis de antes).

✅ **Hecho (2026-09-29)**: `historial_cambios_karen.xlsx` ya se sube solo,
igual que el de Diego — `crm_upload.subir_excel_al_crm()` en
`scripts/crm_upload.py` (Pólizas), lógica compartida entre las dos, solo
cambia el endpoint.

## Pre-contratos (Diego y Karen) — corregido con la estructura real (2026-09-29)

El diseño original (cruzar la clave del pre-contrato contra el `No. de
Agente` de Cancelaciones) estaba mal: Cancelaciones solo trae a los 27
asesores fijos, las claves temporales nunca aparecen ahí. Ya se corrigió.

**Fuente correcta**: `historial_claves_temporales.xlsx` /
`historial_claves_temporales_karen.xlsx` (`HISTORIAL_ENCABEZADOS` en
`claves_temporales.py`), columnas: `Fecha Detectado | Desde | Tipo | Nombre
| No. Agente | Pólizas Antes | Pólizas Ahora`. `Tipo` ∈ `NUEVA` / `CAMBIO` /
`DESAPARECIDA` (dejó de aparecer en el portal — no firmó). Se sube igual
que Cancelaciones: `POST /api/promotoria/pre-contratos/import` y
`POST /api/karen/pre-contratos/import` (multipart, reemplaza todo el
historial — el Excel de origen ya es el acumulado completo).

**Cómo quedó en el CRM** (`estadoClaveTemporal` en `server/index.js`):
- Al importar, cualquier clave que aparezca en el historial y **no** esté
  todavía en la tabla de pre-contratos se da de alta sola (nombre genérico
  del reporte, sin fecha de apertura — el portal no la trae; Diego la
  completa a mano). Nunca duplica por clave (`altaAutomaticaPreContratos`).
- Cada pre-contrato muestra el conteo de pólizas de su evento más reciente
  (`Pólizas Ahora`) y su historial completo de eventos (modal "Ver
  historial": fecha, tipo, antes/ahora).
- Si algún evento es `DESAPARECIDA`, se marca con una alerta roja arriba de
  todo en la tabla (se ordenan primero) — trae la fecha y el conteo de
  pólizas que tenía en ese momento (`Pólizas Antes` de ese evento), para no
  perder ese número aunque no haya llegado el detalle línea por línea.
- `promotoria.json`/`karen.json` ahora se respaldan igual que `db.json`
  (`backupFile()`, mismo esquema de 30 respaldos) — precisamente para no
  perder esta información.

**Hueco de datos que sigue pendiente, pedir del lado de Pólizas cuando se
pueda**: mientras una clave sigue activa, el historial solo trae el
*conteo* de pólizas, no el detalle (No. Póliza, Contratante, Producto,
Estatus). Ese detalle completo sí existe del lado de Pólizas, pero solo
para el momento exacto en que una clave desaparece (hoja "Reasignar" del
reporte del día) — y hoy esa hoja no se sube a ningún lado, vive nada más
en el archivo local de ese día. Para que el CRM pueda mostrar el detalle
real de pólizas a reasignar (no solo el conteo) cuando aparece
`DESAPARECIDA`, hay que agregar esas columnas al historial que sí se sube
(o subir esa hoja aparte) — avisar en esta conversación cuando esté listo
del lado de Pólizas para conectar el importador.

## ⚠️ Hallazgo de seguridad (2026-09-18, sin resolver todavía)

`server/db.json` guarda, para cada usuario, **la contraseña dos veces**: una
encriptada (`password`, correcto — bcrypt) y otra en **texto plano**
(`rawPassword`, sin encriptar). Es el mismo tipo de riesgo que ya se corrigió
en los proyectos de Pólizas/Premios/Campañas moviendo credenciales al Llavero
de macOS — aquí el problema es distinto (contraseñas de USUARIOS del CRM, no
del portal de la aseguradora) pero la exposición es la misma: cualquiera con
acceso al archivo puede leer contraseñas reales en texto plano. No se ha
tocado — Diego dijo que lo revisamos cuando él quiera, no es parte del scope
de la sección de Promotoría.

## Proyectos hermanos (mismo patrón de credenciales en Llavero, portal SMNYL)

- `/Users/diego/Desktop/ESTATUS DE POLIZAS` — fuente de datos para "estatus
  de cancelaciones" (punto 2 arriba).
- `/Users/diego/Desktop/panel de campañas` — premios y campañas, mismo
  patrón de automatización.
