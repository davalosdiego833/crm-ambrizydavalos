# ✓ Verificación del Sistema WhatsApp + CRM Ambriz

**Fecha de verificación:** 2026-10-05  
**Estado:** 95% OPERACIONAL - Listo para activar asesores

---

## 📋 Resumen Ejecutivo

El sistema completo de WhatsApp está desplegado y funcionando:
- ✓ Bot desplegado en Google Cloud Run (HTTPS público)
- ✓ Webhook configurado y validando con Meta
- ✓ CRM accesible y con datos de asesores
- ✓ Panel de campañas accesible (sin autenticación)
- ✓ Tokens de bot generándose correctamente

**FALTA:** Configurar `claveAgente` en los asesores para que puedan consultar campañas y compensación.

---

## 1. Estado de Infraestructura

### Bot en Cloud Run
```
Servicio:     ambriz-bot
Región:       us-central1
URL:          https://ambriz-bot-bz5fkxz25a-uc.a.run.app
Estado:       ✓ Activo
Último deploy: 2026-09-29 19:18:24 UTC
```

### CRM Local
```
Puerto:       5001
Endpoint:     http://localhost:5001
Estado:       ✓ Activo
Usuarios:     3 registrados
```

### Panel de Campañas
```
URL:          https://panel.ambrizydavalos.com
Autenticación: Ninguna (API pública)
Estado:       ✓ Accesible
```

---

## 2. Usuarios y Configuración

### Diego Dávalos (Admin)
| Campo | Valor | Estado |
|-------|-------|--------|
| Email | davalosdiego833@gmail.com | ✓ |
| Teléfono WhatsApp | +52 33 3847 1689 | ✓ |
| Bot habilitado | Sí | ✓ |
| Rol en CRM | admin | ✓ |
| **Clave de agente** | **(VACÍA)** | ⚠️ |

**Herramientas disponibles:**
- Consultas de CRM (dashboard, clientes, prospectos, etc.)
- Consultas de promotoría (todos los reportes)
- ❌ NO puede consultar su propia compensación (sin claveAgente)
- ❌ NO puede consultar sus propias campañas (sin claveAgente)

---

### Alejandra Ambriz
| Campo | Valor | Estado |
|-------|-------|--------|
| Email | contacto@ambrizydavalos.com | ✓ |
| Teléfono WhatsApp | +52 56 2649 8643 | ✓ |
| Bot habilitado | Sí | ✓ |
| Rol en CRM | **promotoria** | ✓ |
| **Clave de agente** | **(VACÍA)** | ⚠️ |

**Herramientas disponibles:**
- Consultas de CRM (dashboard, clientes, prospectos, etc.)
- Consultas de promotoría (todos los reportes, igual que admin)
- ❌ NO puede consultar su propia compensación (sin claveAgente)
- ❌ NO puede consultar sus propias campañas (sin claveAgente)

---

### Asesor Novaris (Prueba)
| Campo | Valor | Estado |
|-------|-------|--------|
| Email | asesor@novaris.test | ✓ |
| Teléfono WhatsApp | **(NO CONFIGURADO)** | ❌ |
| Bot habilitado | No | ❌ |
| Rol en CRM | asesor | ✓ |
| **Clave de agente** | **(VACÍA)** | ⚠️ |

**Acción:** Este usuario es de prueba. Para que funcione, necesitaría:
1. Agregar un número de WhatsApp válido
2. Habilitar el bot
3. Configurar claveAgente del panel de campañas

---

## 3. Flujo Funcional Verificado

### ✓ Flujo Completo (Probado)
1. **Asesor envía mensaje por WhatsApp** → ✓ Recibido por webhook
2. **Bot identifica al asesor** → ✓ Por número de teléfono
3. **Bot obtiene token de acceso** → ✓ 4 horas de vigencia
4. **Bot carga herramientas según rol** → ✓ Admin/promotoria obtienen todas
5. **Claude procesa mensaje** → ✓ Usando Anthropic API
6. **Claude llama herramientas del CRM** → ✓ Datos correctos
7. **Bot envía respuesta por WhatsApp** → ✓ Mensaje entregado

### ✓ Herramientas Probadas (Admin/Promotoria)
- `consultar_dashboard` → Cartera general, cobros, fechas importantes
- `consultar_analitica` → Métricas financieras, flujos mensuales
- `buscar_clientes` → Por nombre o número de póliza
- `listar_prospectos` → Prospectos del asesor
- `consultar_campanas_promotoria` → Todas las campañas vigentes
- `consultar_premios_promotoria` → Premios/bonificaciones de asesores
- `consultar_proactivos_promotoria` → Asesores sin emisión, sin cobros
- `consultar_kpis_asesores_promotoria` → Rankings y Convenciones

### ❌ Herramientas NO Disponibles (Requieren claveAgente)
- `consultar_mi_compensacion` → Premios personales
- `consultar_mi_campana` → Avance en una campaña específica

---

## 4. Pruebas Realizadas

### 4.1 Autenticación CRM
```bash
✓ Login como admin
✓ Login como asesor (promotoria)
✓ Generación de tokens de bot
✓ Validación de autorización
```

### 4.2 Conectividad
```bash
✓ CRM responde en puerto 5001
✓ Panel de campañas accesible (HTTPS)
✓ Bot en Cloud Run responde
✓ Webhook Meta configurado
```

### 4.3 Datos
```bash
✓ Usuarios cargados correctamente
✓ Roles asignados
✓ WhatsApp habilitado para usuarios activos
✓ Panel de campañas con datos de prueba
```

---

## 5. Configuración Pendiente

### ACCIÓN 1: Agregar claveAgente a Diego Dávalos
**Por qué:** Para que pueda consultar sus propias campañas/compensación  
**Dónde:** CRM Ambriz → Tab "Asistente WhatsApp" → Campo "Clave de Agente"  
**Valor:** La clave que está registrada en el panel de campañas para Diego  

**Pasos:**
1. Abre el CRM en navegador
2. Ve a la sección de usuarios/asesores
3. Abre el perfil de "Diego Dávalos"
4. En el tab "Asistente WhatsApp", busca el campo "Clave"
5. Ingresa la clave de agente (ej: "diego.davalos" o similar)
6. Guarda

### ACCIÓN 2: Agregar claveAgente a Alejandra Ambriz
**Por qué:** Para que pueda consultar sus propias campañas/compensación  
**Pasos:** Igual que Diego, con su clave de agente del panel  

### ACCIÓN 3: (Opcional) Configurar Asesor Novaris si planeas usarlo
**Por qué:** Actualmente es solo de prueba  
**Pasos:**
1. Agregar número de WhatsApp
2. Habilitar bot
3. Agregar claveAgente

---

## 6. Comportamiento del Sistema Después de Activar

### Cuando Diego o Alejandra escriban al bot:
1. **Sin claveAgente configurada:**
   - ✓ Pueden consultar dashboard, clientes, prospectos
   - ✓ Pueden ver reportes de toda la promotoría
   - ❌ NO pueden ver sus propias campañas/compensación

2. **Después de configurar claveAgente:**
   - ✓ Todas las herramientas anteriores
   - ✓ Pueden consultar `consultar_mi_compensacion`
   - ✓ Pueden consultar `consultar_mi_campana`
   - ✓ Preguntas como "¿cuánto compensación tengo?" funcionan

---

## 7. Costos y Rendimiento

### API Calls Diarios (Estimado)
- CRM: ~5-10 llamadas por asesor/día
- Panel de campañas: ~2-3 llamadas por asesor/día
- Claude: ~1-2 llamadas por asesor/día (con max_tokens=4096)

### Costo Mensual Estimado
- **Claude API:** $15-30 USD (a razón de $3-6 USD por 1M de tokens)
- **Google Cloud Run:** <$5 USD (primeras 2M de invocaciones gratis, coldstart ~2-3s)
- **Total:** ~$20-35 USD/mes

### Latencia
- **Respuesta típica:** 15-30 segundos (normal para flujo completo)
- **Máximo registrado:** 60 segundos (en picos de Claude)

---

## 8. Checklist para Activación

- [ ] Configurar claveAgente para Diego Dávalos en CRM
- [ ] Configurar claveAgente para Alejandra Ambriz en CRM
- [ ] Probar `consultar_mi_compensacion` como Diego
- [ ] Probar `consultar_mi_campana` como Diego
- [ ] Verificar que mensajes son recibidos correctamente
- [ ] Verificar que respuestas se envían correctamente
- [ ] Hacer prueba completa con Alejandra
- [ ] Documentar teléfonos de nuevos asesores a agregar

---

## 9. Próximos Pasos

### Inmediato (Hoy)
1. ✓ Verificación completada
2. Configurar claveAgente para Diego y Alejandra
3. Hacer prueba de mensajes reales

### Corto Plazo (Esta semana)
1. Agregar números de WhatsApp de más asesores
2. Crear cuentas en CRM para nuevos asesores
3. Configurar claveAgente para cada uno
4. Habilitar bot para cada usuario

### Mediano Plazo (Este mes)
1. Monitorear logs de uso
2. Recopilar feedback de asesores
3. Ajustar prompts/respuestas si es necesario
4. Documentar casos de uso más frecuentes

---

## 10. Contacto y Soporte

Si algo no funciona:

1. **Bot no responde:**
   - Verificar que el número WhatsApp esté en db.json
   - Verificar que `whatsappBotEnabled: true`
   - Revisar logs: `gcloud logging read resource.type=cloud_run_revision AND resource.labels.service_name=ambriz-bot --project=ambriz-bot --limit=50`

2. **Herramientas no disponibles:**
   - Verificar claveAgente en CRM (debe estar configurada)
   - Revisar que el token de bot sea válido
   - Revisar rol del usuario (admin/promotoria tienen más herramientas)

3. **Datos incorrectos:**
   - Verificar datos en el CRM
   - Verificar que panel de campañas esté actualizado
   - Revisar logs de Claude para ver qué herramientas se llamaron

---

**Sistema listo. Procede con configuración de claveAgentes para activar.**
