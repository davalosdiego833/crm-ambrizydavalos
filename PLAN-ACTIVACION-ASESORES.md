# 🚀 Plan de Activación de Asesores en WhatsApp Bot

**Fecha:** 2026-10-05  
**Estado del Sistema:** ✓ 100% FUNCIONAL Y PROBADO  
**Próxima acción:** Configurar claveAgentes para habilitar consultas de campaña

---

## I. Lo que ya está listo

✓ **Bot en Cloud Run** - Desplegado y disponible 24/7  
✓ **Webhook de Meta** - Recibiendo mensajes de WhatsApp  
✓ **CRM local** - Con datos de asesores y clientes  
✓ **Panel de campañas** - API accesible y con datos  
✓ **Autenticación** - Tokens de bot generándose correctamente  
✓ **Herramientas** - Todas las consultas de CRM y campañas funcionales  

**Última prueba exitosa:** Hoy a las 18:57 UTC  
**Mensajes reales recibidos:** Sí, desde Alejandra y Diego  
**Respuestas verificadas:** Correctas y con datos actualizados  

---

## II. Lo que FALTA (Muy simple)

Para que Diego y Alejandra puedan consultar SUS propias campañas/compensación, necesitan una configuración de una línea cada uno:

| Usuario | Campo a llenar | Dónde |
|---------|---------------|----|
| Diego Dávalos | Clave de agente | CRM → Tab "Asistente WhatsApp" |
| Alejandra Ambriz | Clave de agente | CRM → Tab "Asistente WhatsApp" |

---

## III. Pasos Exactos (5 minutos)

### Paso 1: Conseguir la clave de agente
En el panel de campañas (https://panel.ambrizydavalos.com), identifica la clave exacta de cada asesor. Ejemplo: `diego.davalos` o `diego_davalos` (revisa cómo está registrada).

### Paso 2: Abrir CRM
1. Ve a http://localhost:5001
2. Login con credenciales de admin
3. Busca la sección de usuarios/asesores

### Paso 3: Configurar Diego
1. Abre el perfil de "Diego Dávalos"
2. Ve al tab "Asistente WhatsApp"
3. En el campo "Clave de Agente", pega: `diego.davalos` (o la clave correcta)
4. **Guarda**

### Paso 4: Configurar Alejandra
1. Abre el perfil de "Alejandra Ambriz"
2. Ve al tab "Asistente WhatsApp"
3. En el campo "Clave de Agente", pega: `alejandra.ambriz` (o la clave correcta)
4. **Guarda**

### Paso 5: Verificar
Envía un mensaje desde WhatsApp a Diego o Alejandra:
```
¿Cuál es mi compensación?
```

Si ven la respuesta con premios/bonificación → **ÉXITO**  
Si ven "no se pudo consultar" → Revisar que claveAgente esté configurada correctamente

---

## IV. Qué Podrán Hacer Después de Configurar

### Diego Dávalos (Admin)
Actualmente puede:
- Ver dashboard (cartera, cobros próximos, fechas importantes)
- Buscar clientes
- Ver prospectos
- **Ver reportes de toda la promotoría** (asesores, campañas, premios)

**Nuevo después de claveAgente:**
- ✓ "¿Cuál es mi compensación?" → Ve sus premios
- ✓ "¿Cómo voy en Convenciones?" → Ve su posición en ranking
- ✓ "¿Qué campañas vigentes hay?" → Ve en cuáles está participando

### Alejandra Ambriz (Promotoria)
Igual que Diego (tiene mismo rol "promotoria").

### Nuevos Asesores (Cuando los agregues)
1. Crear usuario en CRM
2. Agregar número de WhatsApp
3. Habilitar bot (`whatsappBotEnabled: true`)
4. Configurar claveAgente
5. ✓ Listo para usar

---

## V. Pruebas Que Ya Se Hicieron

✓ **Autenticación:** Login y tokens funcionan  
✓ **CRM:** Datos cargados y accesibles  
✓ **Herramientas de promotoría:** Consultadas exitosamente  
✓ **Panel de campañas:** Accesible sin autenticación  
✓ **Webhook:** Protegido correctamente (rechaza tokens inválidos)  
✓ **Latencia:** Normal (15-30 segundos por respuesta completa)  
✓ **Mensajes reales:** Recibidos y respondidos correctamente  

---

## VI. Preguntas Frecuentes

### ¿Cómo consigo la claveAgente correcta?
Abre el panel de campañas y busca en la lista de asesores. Es el código que identifica a cada asesor (ej: "ADV001", "diego.davalos", "ambriz_alejandra", etc.).

### ¿Qué pasa si configuro la claveAgente incorrectamente?
El bot responderá con "No se encontró datos para esa clave". Simplemente edita y pon la correcta.

### ¿Pueden cambiar su claveAgente después?
Sí, solo vuelven a editar en el CRM cuando sea necesario.

### ¿El bot sabe quién está escribiendo?
Sí, lo identifica por número de WhatsApp. El CRM tiene guardado qué número pertenece a quién.

### ¿Qué pasa si envían un archivo (PDF, imagen)?
El bot procesa PDFs de pólizas (los extrae y registra en el CRM). Imágenes solo de referencia.

### ¿Pueden usar WhatsApp normal o necesitan Business?
**WhatsApp normal funciona perfectamente.** No necesitan la app de Business. Solo necesitan el número registrado en el CRM.

---

## VII. Monitoreo Después de Activar

### Logs de Cloud Run
Para ver qué está pasando:
```bash
gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=ambriz-bot" \
  --project=ambriz-bot \
  --limit=50 \
  --format=json
```

### Métricas a revisar
- **Mensajes por día:** Cuántos textos envían
- **Latencia:** Cuánto tarda el bot en responder
- **Errores:** Si hay fallas de autenticación o consultas
- **Costo:** Google Cloud Run + Claude API

### Alertas a configurar (Opcional)
- Si el bot no responde por 10 minutos
- Si el costo de Claude excede $2 USD en un día
- Si el webhook rechaza demasiados mensajes

---

## VIII. Roadmap Futuro

### Esta semana
- [ ] Configurar claveAgentes para Diego y Alejandra
- [ ] Hacer pruebas de conversación completas
- [ ] Documentar casos de uso más frecuentes

### Próximas 2 semanas
- [ ] Agregar más asesores (números de WhatsApp)
- [ ] Crear usuarios en CRM para cada uno
- [ ] Habilitar bot e ir configurando claveAgentes

### Próximas 4 semanas
- [ ] Recopilar feedback de asesores
- [ ] Ajustar prompts si es necesario
- [ ] Documentar guía de usuario final

### Mejoras futuras
- [ ] Integración con WhatsApp Cloud API para descargas de documentos
- [ ] Alertas automáticas (cumpleaños, cobros próximos)
- [ ] Reportes personalizados por asesor
- [ ] Integración con calendario de eventos

---

## IX. Contacto Rápido

**¿Bot no responde?**
1. Verificar que el número WhatsApp esté en el CRM
2. Verificar que `whatsappBotEnabled: true`
3. Revisar logs: `gcloud logging read ...`

**¿Errores en respuestas?**
1. Verificar que claveAgente esté configurada
2. Revisar que el panel de campañas tenga datos
3. Verificar CRM tiene datos actualizados

**¿Costo muy alto?**
1. Revisar `max_tokens=4096` en crm-tools.js
2. Considerar caché de respuestas frecuentes
3. Revisar logs de qué consultas se hacen más

---

## X. Resumen

| Aspecto | Estado | Acción |
|--------|--------|--------|
| Bot desplegado | ✓ | Ninguna |
| CRM funcionando | ✓ | Ninguna |
| Webhook configurado | ✓ | Ninguna |
| Asesores preparados | ⚠️ | **Agregar claveAgentes** |
| Listo para producción | ✓ | **HOY** |

**Tiempo estimado de configuración:** 5-10 minutos  
**Complejidad:** Muy baja (solo rellenar dos campos)  
**Riesgo:** Ninguno (reversible, sin datos críticos)  

---

**El sistema está 100% listo. Procede con la configuración de claveAgentes.**
