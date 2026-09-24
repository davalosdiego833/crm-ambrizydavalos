// Módulo compartido: la conexión al CRM Ambriz y las herramientas que Claude
// puede llamar. Lo usa tanto el prototipo de terminal como, después, el bot
// de WhatsApp — es "el cerebro", el canal por el que se llega a él es aparte.

const CRM_URL = process.env.CRM_URL || 'http://localhost:5001';

export function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export async function loginCRM(email, password) {
  const res = await fetch(`${CRM_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`No se pudo iniciar sesión en el CRM (${res.status}): ${body.error || 'error desconocido'}`);
  }

  return res.json(); // { token, user }
}

// Dos números escritos distinto ("+52 33 1234 5678" vs "5213312345678") son
// el mismo teléfono si sus últimos 10 dígitos coinciden — comparamos solo
// eso para no depender de cómo se haya capturado el número en el CRM.
export function normalizarTelefono(numero) {
  const digitos = String(numero || '').replace(/\D/g, '');
  return digitos.slice(-10);
}

// Lista los usuarios del CRM (requiere un token de administrador). La usa el
// bot para encontrar, por número de WhatsApp, a qué asesor le pertenece cada
// mensaje que llega.
export async function listarUsuariosAdmin(adminToken) {
  const res = await fetch(`${CRM_URL}/api/admin/users`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  if (!res.ok) throw new Error(`Error listando usuarios: ${res.status}`);
  return res.json();
}

// Pide un token de acceso de corta duración para actuar como un usuario
// específico, sin conocer su contraseña. Solo funciona si ese usuario tiene
// el interruptor de WhatsApp encendido — si está apagado, el CRM lo rechaza.
export async function pedirBotToken(adminToken, userId) {
  const res = await fetch(`${CRM_URL}/api/admin/users/${userId}/bot-token`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error pidiendo acceso (${res.status})`);
  }
  return res.json(); // { token, user }
}

async function crmGet(token, path) {
  const res = await fetch(`${CRM_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Error consultando ${path}: ${res.status}`);
  return res.json();
}

async function crmPost(token, path, body) {
  const res = await fetch(`${CRM_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Error guardando en ${path}: ${res.status}`);
  return res.json();
}

async function crmPut(token, path, body) {
  const res = await fetch(`${CRM_URL}${path}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Error actualizando ${path}: ${res.status}`);
  return res.json();
}

async function crmDelete(token, path) {
  const res = await fetch(`${CRM_URL}${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Error eliminando ${path}: ${res.status}`);
  return res.json();
}

// Todas las acciones que escriben identifican la póliza por su número exacto
// (nunca por nombre, para no arriesgarse a tocar la póliza equivocada entre
// clientes con nombres parecidos).
async function buscarClientePorPoliza(token, numeroPoliza) {
  const clientes = await crmGet(token, '/api/clients');
  return clientes.find((c) => c.policyNumber === numeroPoliza);
}

// Sube el PDF de una póliza al extractor que ya existe en el CRM (mismo que
// usa la app web) y regresa los campos que pudo leer. Es de solo lectura —
// no da de alta nada todavía, eso lo hace `dar_de_alta_cliente` aparte.
export async function leerPolizaPDF(token, bytesPDF, filename) {
  const form = new FormData();
  form.append('policy', new Blob([bytesPDF], { type: 'application/pdf' }), filename || 'poliza.pdf');
  const res = await fetch(`${CRM_URL}/api/policies/parse`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Error leyendo el PDF de la póliza: ${res.status}`);
  return res.json();
}

// Cada herramienta golpea la API real del CRM. Nada se inventa ni se guarda:
// son consultas de solo lectura, tal como acordamos para el piloto.
export function construirHerramientas(token, role) {
  const herramientas = [
    {
      spec: {
        name: 'consultar_dashboard',
        description:
          'Da el panorama general de la cartera del asesor: cobros atrasados, cobros próximos ' +
          '(hoy, en 5 días, en 15 días, en el mes), lo ya cobrado este mes, y cumpleaños/aniversarios ' +
          'de pólizas de este mes y el próximo. Para "cuánto se ha cobrado este mes" usa SIEMPRE el ' +
          'campo "cobrado_este_mes_verificado" — nunca "kpis.collected", que no es de este mes (ver nota).',
        input_schema: { type: 'object', properties: {} },
      },
      run: async () => {
        const data = await crmGet(token, '/api/dashboard');
        const cobradoEsteMesVerificado = (data.collectedList || []).reduce((sum, c) => sum + (c.amount || 0), 0);
        return {
          ...data,
          cobrado_este_mes_verificado: cobradoEsteMesVerificado,
          nota_importante:
            'Usa "cobrado_este_mes_verificado" para responder cuánto se ha cobrado ESTE MES — está ' +
            'calculado directamente de "collectedList" (los pagos reales de este mes). El campo ' +
            '"kpis.collected" NO es de este mes — es el valor total de pólizas que hoy están marcadas ' +
            'como "Pagada" en el sistema, sin importar cuándo se pagaron. No lo uses para responder ' +
            'sobre el mes actual.',
        };
      },
    },
    {
      spec: {
        name: 'consultar_analitica',
        description:
          'Da métricas financieras de la cartera: total cobrado y pendiente, ventas nuevas, ' +
          'renovaciones, distribución por producto (Vida/GMM) y por moneda (MXN/USD/UDI), y el flujo ' +
          'de cobros mes a mes. Sin "mes", regresa el resumen del año completo (incluye el desglose ' +
          'mes por mes en "monthlyFlow"). Con "mes", regresa las cifras de ESE mes específico ' +
          '(pasado, presente o futuro del año dado) — úsalo para preguntas tipo "cuánto se cobró en ' +
          'julio".',
        input_schema: {
          type: 'object',
          properties: {
            anio: { type: 'string', description: 'Año a consultar, ej. "2026". Si no se da, usa el año actual.' },
            mes: { type: 'integer', description: 'Número de mes 1-12 (ej. 7 para julio). Opcional.' },
          },
        },
      },
      run: ({ anio, mes } = {}) => {
        const params = new URLSearchParams();
        if (anio) params.set('year', anio);
        if (mes) params.set('month', String(mes));
        const qs = params.toString();
        return crmGet(token, `/api/analytics${qs ? `?${qs}` : ''}`);
      },
    },
    {
      spec: {
        name: 'buscar_clientes',
        description:
          'Busca clientes/pólizas del asesor por nombre del contratante o número de póliza. ' +
          'Ignora mayúsculas y acentos. Regresa los datos de la póliza: contratante, asegurados, ' +
          'número de póliza, aseguradora/producto, prima, moneda, frecuencia de pago, estatus y fechas.',
        input_schema: {
          type: 'object',
          properties: {
            texto: { type: 'string', description: 'Nombre (completo o parcial) o número de póliza a buscar.' },
          },
          required: ['texto'],
        },
      },
      run: async ({ texto }) => {
        const clientes = await crmGet(token, '/api/clients');
        const q = normalizar(texto);
        const encontrados = clientes.filter(
          (c) => normalizar(c.contractor).includes(q) || normalizar(c.policyNumber).includes(q)
        );
        return {
          total_encontrados: encontrados.length,
          clientes: encontrados.map((c) => ({
            contratante: c.contractor,
            asegurados: (c.insureds || []).map((i) => i.name),
            numero_poliza: c.policyNumber,
            producto: c.product,
            plan: c.planType,
            prima: c.premium,
            moneda: c.currency,
            frecuencia_pago: c.paymentFrequency,
            estatus: c.status,
            fecha_emision: c.emissionDate,
            fecha_cobro: c.collectionDate,
            telefono: c.phone,
          })),
        };
      },
    },
    {
      spec: {
        name: 'listar_prospectos',
        description:
          'Lista los prospectos (personas que aún no son clientes) del asesor: nombre, quién lo ' +
          'refirió, teléfono, fuente, fecha comprometida de seguimiento y comentarios.',
        input_schema: { type: 'object', properties: {} },
      },
      run: () => crmGet(token, '/api/prospects'),
    },
    {
      spec: {
        name: 'dar_de_alta_cliente',
        description:
          'Da de alta una póliza/cliente nuevo en el CRM. ES UNA ACCIÓN QUE ESCRIBE DATOS — solo se ' +
          'debe llamar después de que el asesor confirmó explícitamente los datos que le mostraste ' +
          '(dijo algo como "sí", "confirmo", "correcto", "dalo de alta"). Si el asesor pidió algún ' +
          'cambio, usa los datos corregidos y vuelve a confirmar antes de llamarla. Nunca la llames ' +
          'como parte de leer o mostrar una póliza — solo tras la confirmación explícita.\n\n' +
          'Si el número de póliza ya existe, esta herramienta NO guarda nada — regresa el aviso ' +
          '"ya_existe" con los datos de esa póliza para que se lo muestres al asesor y le preguntes si ' +
          'de verdad quiere actualizarla (un mismo cliente puede tener varias pólizas distintas, así ' +
          'que esto NO es un error, solo una confirmación extra). Solo si el asesor confirma que sí, ' +
          'vuelve a llamar a esta misma herramienta agregando "actualizar_existente": true.',
        input_schema: {
          type: 'object',
          properties: {
            contratante: { type: 'string' },
            numero_poliza: { type: 'string' },
            producto: { type: 'string', description: 'Ej. "Vida" o "GMM"' },
            plan: { type: 'string' },
            prima: { type: 'number' },
            moneda: { type: 'string', description: 'MXN, USD o UDI' },
            frecuencia_pago: { type: 'string', description: 'MENSUAL, TRIMESTRAL, SEMESTRAL o ANUAL' },
            fecha_emision: { type: 'string', description: 'YYYY-MM-DD' },
            asegurados: {
              type: 'array',
              items: { type: 'object', properties: { name: { type: 'string' } } },
              description: 'Si no se da, se usa al contratante como único asegurado.',
            },
            actualizar_existente: {
              type: 'boolean',
              description: 'Solo poner true si el asesor ya confirmó que quiere actualizar una póliza que ya existía.',
            },
          },
          required: ['contratante', 'numero_poliza'],
        },
      },
      run: async (datos) => {
        const clientes = await crmGet(token, '/api/clients');
        const existente = clientes.find((c) => c.policyNumber && c.policyNumber === datos.numero_poliza);

        if (existente && !datos.actualizar_existente) {
          return {
            ya_existe: true,
            mensaje: 'Ya hay una póliza guardada con ese número — no se guardó nada nuevo.',
            poliza_existente: {
              contratante: existente.contractor,
              producto: existente.product,
              prima: existente.premium,
              moneda: existente.currency,
              estatus: existente.status,
            },
          };
        }

        return crmPost(token, '/api/clients', {
          contractor: datos.contratante,
          policyNumber: datos.numero_poliza,
          product: datos.producto,
          planType: datos.plan,
          premium: datos.prima,
          currency: datos.moneda,
          paymentFrequency: datos.frecuencia_pago,
          emissionDate: datos.fecha_emision,
          insureds: datos.asegurados,
        });
      },
    },
    {
      spec: {
        name: 'marcar_como_pagada',
        description:
          'Marca una póliza como pagada en el CRM. ES UNA ACCIÓN QUE ESCRIBE DATOS — solo se debe ' +
          'llamar después de que el asesor confirme explícitamente cuál póliza marcar (si hay ' +
          'ambigüedad, usa buscar_clientes primero y confirma el número de póliza exacto antes de ' +
          'llamarla).',
        input_schema: {
          type: 'object',
          properties: {
            numero_poliza: { type: 'string', description: 'Número exacto de la póliza a marcar como pagada.' },
            fecha_pago: { type: 'string', description: 'YYYY-MM-DD. Si no se da, se usa la fecha de hoy.' },
          },
          required: ['numero_poliza'],
        },
      },
      run: async ({ numero_poliza, fecha_pago }) => {
        const cliente = await buscarClientePorPoliza(token, numero_poliza);
        if (!cliente) return { error: `No se encontró ninguna póliza con el número "${numero_poliza}".` };
        return crmPut(token, `/api/clients/${cliente.id}/pay`, fecha_pago ? { paymentDate: fecha_pago } : {});
      },
    },
    {
      spec: {
        name: 'anular_poliza',
        description:
          'Anula una póliza en el CRM (deja de contar en cobranza y cartera activa). ES UNA ACCIÓN QUE ' +
          'ESCRIBE DATOS — solo tras confirmación explícita del asesor sobre el número de póliza exacto.',
        input_schema: {
          type: 'object',
          properties: {
            numero_poliza: { type: 'string', description: 'Número exacto de la póliza a anular.' },
          },
          required: ['numero_poliza'],
        },
      },
      run: async ({ numero_poliza }) => {
        const cliente = await buscarClientePorPoliza(token, numero_poliza);
        if (!cliente) return { error: `No se encontró ninguna póliza con el número "${numero_poliza}".` };
        return crmPut(token, `/api/clients/${cliente.id}/annul`, {});
      },
    },
    {
      spec: {
        name: 'reactivar_poliza',
        description:
          'Reactiva una póliza anulada (o marca el ciclo actual como pagado y programa el siguiente ' +
          'cobro). ES UNA ACCIÓN QUE ESCRIBE DATOS — solo tras confirmación explícita del asesor sobre ' +
          'el número de póliza exacto.',
        input_schema: {
          type: 'object',
          properties: {
            numero_poliza: { type: 'string', description: 'Número exacto de la póliza a reactivar.' },
          },
          required: ['numero_poliza'],
        },
      },
      run: async ({ numero_poliza }) => {
        const cliente = await buscarClientePorPoliza(token, numero_poliza);
        if (!cliente) return { error: `No se encontró ninguna póliza con el número "${numero_poliza}".` };
        return crmPut(token, `/api/clients/${cliente.id}/reactivate`, {});
      },
    },
    {
      spec: {
        name: 'identificar_cliente',
        description:
          'Marca o desmarca una póliza como "destacada/identificada" en el CRM (el resaltado que se ve ' +
          'en la app web). Es reversible y de bajo riesgo, pero sigue siendo una acción que escribe — ' +
          'confirma con el asesor cuál póliza antes de llamarla.',
        input_schema: {
          type: 'object',
          properties: {
            numero_poliza: { type: 'string', description: 'Número exacto de la póliza a destacar/quitar destaque.' },
          },
          required: ['numero_poliza'],
        },
      },
      run: async ({ numero_poliza }) => {
        const cliente = await buscarClientePorPoliza(token, numero_poliza);
        if (!cliente) return { error: `No se encontró ninguna póliza con el número "${numero_poliza}".` };
        return crmPut(token, `/api/clients/${cliente.id}/toggle-highlight`, {});
      },
    },
    {
      spec: {
        name: 'editar_cliente',
        description:
          'Edita los datos de una póliza/cliente ya existente en el CRM (por ejemplo corregir el ' +
          'nombre, la prima, la fecha, el teléfono, etc.). ES UNA ACCIÓN QUE ESCRIBE DATOS — solo tras ' +
          'confirmación explícita del asesor, mostrándole antes qué campo(s) va a cambiar y a qué ' +
          'valor. Solo incluye los campos que de verdad cambian; el resto de la póliza no se toca.',
        input_schema: {
          type: 'object',
          properties: {
            numero_poliza: { type: 'string', description: 'Número exacto de la póliza a editar.' },
            contratante: { type: 'string' },
            nuevo_numero_poliza: { type: 'string', description: 'Solo si el asesor pide cambiar el número de póliza.' },
            producto: { type: 'string' },
            plan: { type: 'string' },
            prima: { type: 'number' },
            moneda: { type: 'string' },
            frecuencia_pago: { type: 'string' },
            fecha_emision: { type: 'string', description: 'YYYY-MM-DD' },
            fecha_cobro: { type: 'string', description: 'YYYY-MM-DD' },
            telefono: { type: 'string' },
            email: { type: 'string' },
          },
          required: ['numero_poliza'],
        },
      },
      run: async (datos) => {
        const cliente = await buscarClientePorPoliza(token, datos.numero_poliza);
        if (!cliente) return { error: `No se encontró ninguna póliza con el número "${datos.numero_poliza}".` };

        const cambios = {};
        if (datos.contratante !== undefined) cambios.contractor = datos.contratante;
        if (datos.nuevo_numero_poliza !== undefined) cambios.policyNumber = datos.nuevo_numero_poliza;
        if (datos.producto !== undefined) cambios.product = datos.producto;
        if (datos.plan !== undefined) cambios.planType = datos.plan;
        if (datos.prima !== undefined) cambios.premium = datos.prima;
        if (datos.moneda !== undefined) cambios.currency = datos.moneda;
        if (datos.frecuencia_pago !== undefined) cambios.paymentFrequency = datos.frecuencia_pago;
        if (datos.fecha_emision !== undefined) cambios.emissionDate = datos.fecha_emision;
        if (datos.fecha_cobro !== undefined) cambios.collectionDate = datos.fecha_cobro;
        if (datos.telefono !== undefined) cambios.phone = datos.telefono;
        if (datos.email !== undefined) cambios.email = datos.email;

        return crmPut(token, `/api/clients/${cliente.id}`, cambios);
      },
    },
    {
      spec: {
        name: 'eliminar_cliente',
        description:
          'ELIMINA PERMANENTEMENTE una póliza/cliente del CRM — NO SE PUEDE DESHACER, no hay papelera ' +
          'ni forma de recuperarlo después. Antes de llamarla: muestra al asesor exactamente qué se va ' +
          'a borrar (contratante, número de póliza, prima) y dile explícitamente que es permanente. ' +
          'Solo llama a esta herramienta si el asesor confirma con claridad después de esa advertencia ' +
          '(ej. "sí, bórrala", "confirmo, elimínala") — una confirmación vaga no es suficiente aquí.',
        input_schema: {
          type: 'object',
          properties: {
            numero_poliza: { type: 'string', description: 'Número exacto de la póliza/cliente a eliminar.' },
          },
          required: ['numero_poliza'],
        },
      },
      run: async ({ numero_poliza }) => {
        const cliente = await buscarClientePorPoliza(token, numero_poliza);
        if (!cliente) return { error: `No se encontró ninguna póliza con el número "${numero_poliza}".` };
        return crmDelete(token, `/api/clients/${cliente.id}`);
      },
    },
  ];

  // Datos de TODA la promotoría (todos los asesores) — solo para admin/promotoría,
  // nunca para un asesor normal viendo su propia cartera.
  if (role === 'admin' || role === 'promotoria') {
    herramientas.push(
      {
        spec: {
          name: 'consultar_asesores_promotoria',
          description:
            'Lista a TODOS los asesores de la promotoría (no solo los de quien pregunta): nombre, ' +
            'clave de agente, fecha de nacimiento y fecha de firma de contrato. Solo para directivos.',
          input_schema: { type: 'object', properties: {} },
        },
        run: () => crmGet(token, '/api/promotoria/asesores'),
      },
      {
        spec: {
          name: 'consultar_pre_contratos',
          description:
            'Lista las claves en pre-contrato de la promotoría: nombre, clave, fecha de apertura, y ' +
            'días restantes antes de que la clave venza (ya viene calculado en "diasRestantes" y ' +
            '"vencida" — úsalos directo, no los recalcules). Solo para directivos.',
          input_schema: { type: 'object', properties: {} },
        },
        run: () => crmGet(token, '/api/promotoria/pre-contratos'),
      },
      {
        spec: {
          name: 'consultar_cancelaciones',
          description:
            'Da el último reporte importado de cancelaciones de pólizas de TODA la promotoría (pólizas ' +
            'que pasaron a estatus Anulada): fecha detectada, asesor, número de póliza, contratante, ' +
            'estatus anterior y nuevo. Solo para directivos.',
          input_schema: { type: 'object', properties: {} },
        },
        run: () => crmGet(token, '/api/promotoria/cancelaciones'),
      }
    );
  }

  return herramientas;
}

export const SYSTEM_PROMPT_BASE = `Eres el asistente de un asesor de seguros en la promotoría Ambriz. Respondes
preguntas sobre SU cartera usando datos reales del CRM, a través de las herramientas disponibles.

Reglas:
- Usa siempre una herramienta para obtener datos; nunca inventes cifras, nombres o fechas.
- Si una búsqueda no encuentra resultados, dilo claramente en vez de suponer.
- Responde en español, tono directo y profesional, breve, con viñetas o negritas cuando ayude, sin relleno.
- Si la pregunta es ambigua (ej. hay varios clientes con nombre parecido), pide que precise en vez
  de adivinar cuál.
- Si tienes herramientas de promotoría disponibles (asesores, pre-contratos, cancelaciones), son
  datos de TODOS los asesores de la promotoría — quien te las puede pedir es un directivo, no un
  asesor viendo su propia cartera. No mezcles esos datos con la cartera personal de quien pregunta.

Sobre acciones que escriben datos (dar de alta, marcar como pagada, anular, reactivar, identificar,
editar, o cualquier otra que modifique el CRM): NUNCA llames a una de estas herramientas sin que el
asesor haya confirmado explícitamente qué quiere hacer, sobre qué póliza exacta (por su número, no
por nombre — si solo te dio un nombre y hay más de una póliza a su nombre, pregunta cuál número
antes de actuar). Si hay cualquier duda, pregunta primero en vez de suponer.

Sobre "eliminar_cliente" en particular: es la única acción sin marcha atrás — no hay forma de
recuperar lo borrado. Antes de llamarla, muestra siempre contratante, número de póliza y prima de lo
que se va a borrar, dile explícitamente al asesor que es permanente, y espera una confirmación clara
e inequívoca (no una respuesta ambigua) antes de proceder.

Sobre pólizas en PDF y alta de clientes:
- Cuando el sistema te avise que llegó un PDF de póliza con datos ya extraídos, preséntaselos al
  asesor en una lista clara (contratante, número de póliza, producto, prima, moneda, frecuencia,
  fecha de emisión) y pregúntale si son correctos. NUNCA llames a "dar_de_alta_cliente" en ese
  mismo turno.
- Si algún campo vino vacío o dudoso, dilo explícitamente en vez de inventarlo o dejarlo en blanco
  sin avisar.
- Solo llama a "dar_de_alta_cliente" cuando el asesor confirme explícitamente (o después de que
  corrija algo y tú se lo repitas y él confirme). Si el asesor no confirma nada, no la llames.
- Después de dar de alta, confirma en una línea que quedó guardado, con el número de póliza.`;

// Un solo turno de conversación con Claude, incluyendo las vueltas de tool-use
// que hagan falta. `messages` se recibe y se modifica en el lugar (se le
// agrega la pregunta y la respuesta), así el que llama mantiene el historial.
export async function responder(client, model, herramientas, messages, pregunta, systemPrompt, log = () => {}) {
  messages.push({ role: 'user', content: pregunta });
  const effort = process.env.CLAUDE_EFFORT || 'low';

  while (true) {
    const respuesta = await client.messages.create({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      tools: herramientas.map((h) => h.spec),
      messages,
      output_config: { effort },
    });

    messages.push({ role: 'assistant', content: respuesta.content });

    if (respuesta.stop_reason !== 'tool_use') {
      return respuesta.content.find((b) => b.type === 'text')?.text || '(sin respuesta de texto)';
    }

    const llamadas = respuesta.content.filter((b) => b.type === 'tool_use');
    const resultados = [];
    for (const llamada of llamadas) {
      const herramienta = herramientas.find((h) => h.spec.name === llamada.name);
      let salida;
      try {
        salida = await herramienta.run(llamada.input || {});
      } catch (err) {
        salida = { error: err.message };
      }
      log(llamada.name, llamada.input || {});
      resultados.push({
        type: 'tool_result',
        tool_use_id: llamada.id,
        content: JSON.stringify(salida),
      });
    }
    messages.push({ role: 'user', content: resultados });
  }
}
