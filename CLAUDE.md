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
   `VIGENCIA_CLAVE_DIAS` en `server/index.js`). Cada pre-contrato también
   trae sus **pólizas registradas**: se cruza su `clave` contra el
   `No. de Agente` de las filas de Cancelaciones (el reporte de pólizas trae
   el nombre genérico de la promotoría, no el nombre real de la persona,
   pero sí su clave temporal) — así se sabe, si no firma a tiempo, qué
   pólizas/clientes hay que reasignar a otro asesor.

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

Pendiente (coordinar con la conversación de Pólizas cuando Diego avise):
agregar ahí una función tipo `subir_historial_al_crm()` pero para Karen,
apuntando a `POST /api/karen/cancelaciones/import` con
`historial_cambios_karen.xlsx`. Los pre-contratos de Karen
(`historial_claves_temporales_karen.xlsx`) todavía no tienen importador —
mismo pendiente que el de Diego (ver abajo): falta ver la estructura real
de columnas de ese archivo para diseñar el cruce/alta automática por clave.

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
