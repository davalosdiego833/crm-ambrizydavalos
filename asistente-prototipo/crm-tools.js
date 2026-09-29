// Módulo compartido: la conexión al CRM Ambriz y las herramientas que Claude
// puede llamar. Lo usa tanto el prototipo de terminal como, después, el bot
// de WhatsApp — es "el cerebro", el canal por el que se llega a él es aparte.

const CRM_URL = process.env.CRM_URL || 'http://localhost:5001';
// Sistema aparte del CRM: campañas, premios y estatus de pólizas de la
// promotoría. Sin login propio — sus endpoints de datos son de solo lectura
// y no requieren token (ver nota en la conversación: la "clave" de esa
// página solo protege la pantalla, no la API).
const PANEL_CAMPANAS_URL = process.env.PANEL_CAMPANAS_URL || 'https://panel.ambrizydavalos.com';

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

async function campanasGet(path) {
  const res = await fetch(`${PANEL_CAMPANAS_URL}${path}`);
  if (!res.ok) throw new Error(`Error consultando panel de campañas ${path}: ${res.status}`);
  return res.json();
}

// Todas las acciones que escriben identifican la póliza por su número exacto
// (nunca por nombre, para no arriesgarse a tocar la póliza equivocada entre
// clientes con nombres parecidos).
async function buscarClientePorPoliza(token, numeroPoliza) {
  const clientes = await crmGet(token, '/api/clients');
  return clientes.find((c) => c.policyNumber === numeroPoliza);
}

// Para las listas de promotoría (asesores, pre-contratos), que no tienen un
// identificador tan exacto como el número de póliza: busca por nombre
// (parcial, sin acentos) o por el campo exacto que se le indique (clave de
// agente, clave de pre-contrato). Regresa TODAS las coincidencias — así, si
// hay más de una, la herramienta que llama puede pedir que se precise en vez
// de adivinar cuál.
async function buscarEnLista(token, path, identificador, campoClaveExacta) {
  const lista = await crmGet(token, path);
  const q = normalizar(identificador);
  return lista.filter(
    (item) => normalizar(item.nombre).includes(q) || normalizar(item[campoClaveExacta]) === q
  );
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
export function construirHerramientas(token, role, claveAgente) {
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

  // Compensación/campañas del propio asesor en el panel de campañas (sistema
  // aparte del CRM). Usa SIEMPRE la clave de agente que el directivo ya
  // registró en su perfil — nunca una que el asesor escriba en el chat, para
  // que sea imposible que alguien consulte la compensación de otro asesor.
  if (role === 'advisor' && claveAgente) {
    herramientas.push(
      {
        spec: {
          name: 'consultar_mi_compensacion',
          description:
            'Da los premios/compensación del asesor que está preguntando, del panel de campañas de la ' +
            'promotoría (sistema aparte del CRM). Solo trae SU propia información — no la de otros ' +
            'asesores, no acepta que se le pida consultar a alguien más.',
          input_schema: { type: 'object', properties: {} },
        },
        run: () => campanasGet(`/api/premios/${encodeURIComponent(claveAgente)}`),
      },
      {
        spec: {
          name: 'consultar_mi_campana',
          description:
            'Da el avance del asesor que está preguntando en una campaña específica del panel de ' +
            'campañas — solo SU propio avance, nunca el de otro asesor. La clave técnica de la campaña ' +
            'va en minúsculas y sin acentos, ej. "mdrt", "camino_cumbre", "convenciones", ' +
            '"legion_centurion", "graduacion", "educar_es_creer", "poder_elegirte" — si no estás ' +
            'seguro de cuál es o el asesor la nombra distinto (ej. "Camino a la Cumbre"), pregúntale a ' +
            'qué campaña exacta se refiere antes de adivinar la clave.\n' +
            'Si la campaña es "convenciones" (o "convenciones_promotores"/"convenciones_gerente"), los ' +
            'datos vienen así — repórtalos con estos nombres exactos, nunca inventes otra etiqueta para ' +
            'ellos: "Lugar" = posición actual en el ranking. "Lugar_480" (o "Lugar_495") = PA que se ' +
            'necesita para el nivel "1 Diamante" (viaje a Los Cabos). "Lugar_228" = "2 Diamantes" ' +
            '(Vancouver). "Lugar_108" = "3 Diamantes" (Estambul). "Lugar_28" = "Gran Diamante" (Japón). ' +
            'SIEMPRE menciona primero el campo "Califica" (true/false) — es el veredicto oficial de si ' +
            'la persona ya calificó a algún nivel de Convenciones; "Cumple_Polizas" y "Cumple_Creditos" ' +
            'son los dos requisitos que se evalúan para ese veredicto. No des la posición/PA sin decir ' +
            'antes si "Califica" es true o false.',
          input_schema: {
            type: 'object',
            properties: {
              campana: { type: 'string', description: 'Nombre/identificador de la campaña, tal como aparece en el panel.' },
            },
            required: ['campana'],
          },
        },
        run: ({ campana }) => campanasGet(`/api/campaign/${encodeURIComponent(campana)}/data/${encodeURIComponent(claveAgente)}`),
      }
    );
  }

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
          name: 'dar_de_alta_asesor_promotoria',
          description:
            'Da de alta un asesor nuevo en la base de datos de promotoría (nombre, clave de agente, ' +
            'fecha de nacimiento, fecha de firma de contrato). ES UNA ACCIÓN QUE ESCRIBE — solo tras ' +
            'confirmación explícita del directivo con los datos ya mostrados. Solo para directivos.',
          input_schema: {
            type: 'object',
            properties: {
              nombre: { type: 'string' },
              claveAgente: { type: 'string' },
              fechaNacimiento: { type: 'string', description: 'YYYY-MM-DD' },
              fechaFirmaContrato: { type: 'string', description: 'YYYY-MM-DD' },
            },
            required: ['nombre'],
          },
        },
        run: (datos) => crmPost(token, '/api/promotoria/asesores', datos),
      },
      {
        spec: {
          name: 'editar_asesor_promotoria',
          description:
            'Edita los datos de un asesor ya existente en la base de promotoría (nombre, clave, fecha ' +
            'de nacimiento o de firma). Identifícalo por su nombre o su clave de agente — si hay más de ' +
            'un asesor que coincide, pide que precise cuál en vez de adivinar. ES UNA ACCIÓN QUE ESCRIBE ' +
            '— solo tras confirmación explícita, mostrando antes qué va a cambiar. Solo para directivos.',
          input_schema: {
            type: 'object',
            properties: {
              identificador: { type: 'string', description: 'Nombre (completo o parcial) o clave de agente del asesor a editar.' },
              nombre: { type: 'string' },
              claveAgente: { type: 'string' },
              fechaNacimiento: { type: 'string', description: 'YYYY-MM-DD' },
              fechaFirmaContrato: { type: 'string', description: 'YYYY-MM-DD' },
            },
            required: ['identificador'],
          },
        },
        run: async ({ identificador, ...cambios }) => {
          const encontrados = await buscarEnLista(token, '/api/promotoria/asesores', identificador, 'claveAgente');
          if (encontrados.length === 0) return { error: `No encontré ningún asesor que coincida con "${identificador}".` };
          if (encontrados.length > 1) return { multiples_coincidencias: encontrados.map((a) => ({ nombre: a.nombre, claveAgente: a.claveAgente })) };
          return crmPut(token, `/api/promotoria/asesores/${encontrados[0].id}`, cambios);
        },
      },
      {
        spec: {
          name: 'eliminar_asesor_promotoria',
          description:
            'ELIMINA PERMANENTEMENTE a un asesor de la base de datos de promotoría — no se puede ' +
            'deshacer. Antes de llamarla, muestra al directivo exactamente a quién se va a borrar y ' +
            'dile que es permanente; solo procede con una confirmación clara. Solo para directivos.',
          input_schema: {
            type: 'object',
            properties: {
              identificador: { type: 'string', description: 'Nombre (completo o parcial) o clave de agente del asesor a eliminar.' },
            },
            required: ['identificador'],
          },
        },
        run: async ({ identificador }) => {
          const encontrados = await buscarEnLista(token, '/api/promotoria/asesores', identificador, 'claveAgente');
          if (encontrados.length === 0) return { error: `No encontré ningún asesor que coincida con "${identificador}".` };
          if (encontrados.length > 1) return { multiples_coincidencias: encontrados.map((a) => ({ nombre: a.nombre, claveAgente: a.claveAgente })) };
          return crmDelete(token, `/api/promotoria/asesores/${encontrados[0].id}`);
        },
      },
      {
        spec: {
          name: 'consultar_pre_contratos',
          description:
            'Lista las claves en pre-contrato de la promotoría: nombre, clave, fecha de apertura, y ' +
            'días restantes antes de que la clave venza (ya viene calculado en "diasRestantes" y ' +
            '"vencida" — úsalos directo, no los recalcules). Cada pre-contrato también trae su ' +
            'historial de pólizas: "polizasReasignar" y "detalleActivo" (pólizas asociadas a esa clave) ' +
            'y "eventos"/"polizasActuales"/"desaparecida" (historial de la clave temporal en el portal). ' +
            'Solo para directivos.',
          input_schema: { type: 'object', properties: {} },
        },
        run: () => crmGet(token, '/api/promotoria/pre-contratos'),
      },
      {
        spec: {
          name: 'dar_de_alta_pre_contrato',
          description:
            'Da de alta un pre-contrato nuevo (nombre, clave, fecha de apertura de la clave). ES UNA ' +
            'ACCIÓN QUE ESCRIBE — solo tras confirmación explícita del directivo. Solo para directivos.',
          input_schema: {
            type: 'object',
            properties: {
              nombre: { type: 'string' },
              clave: { type: 'string' },
              fechaAperturaClave: { type: 'string', description: 'YYYY-MM-DD' },
            },
            required: ['nombre'],
          },
        },
        run: (datos) => crmPost(token, '/api/promotoria/pre-contratos', datos),
      },
      {
        spec: {
          name: 'editar_pre_contrato',
          description:
            'Edita un pre-contrato existente (nombre, clave, o fecha de apertura). Identifícalo por ' +
            'nombre o clave — si hay más de una coincidencia, pide que precise cuál. ES UNA ACCIÓN QUE ' +
            'ESCRIBE — solo tras confirmación explícita, mostrando antes qué va a cambiar. Solo para directivos.',
          input_schema: {
            type: 'object',
            properties: {
              identificador: { type: 'string', description: 'Nombre (completo o parcial) o clave del pre-contrato a editar.' },
              nombre: { type: 'string' },
              clave: { type: 'string' },
              fechaAperturaClave: { type: 'string', description: 'YYYY-MM-DD' },
            },
            required: ['identificador'],
          },
        },
        run: async ({ identificador, ...cambios }) => {
          const encontrados = await buscarEnLista(token, '/api/promotoria/pre-contratos', identificador, 'clave');
          if (encontrados.length === 0) return { error: `No encontré ningún pre-contrato que coincida con "${identificador}".` };
          if (encontrados.length > 1) return { multiples_coincidencias: encontrados.map((p) => ({ nombre: p.nombre, clave: p.clave })) };
          return crmPut(token, `/api/promotoria/pre-contratos/${encontrados[0].id}`, cambios);
        },
      },
      {
        spec: {
          name: 'eliminar_pre_contrato',
          description:
            'ELIMINA PERMANENTEMENTE un pre-contrato — no se puede deshacer. Antes de llamarla, muestra ' +
            'al directivo exactamente cuál se va a borrar y dile que es permanente; solo procede con una ' +
            'confirmación clara. Solo para directivos.',
          input_schema: {
            type: 'object',
            properties: {
              identificador: { type: 'string', description: 'Nombre (completo o parcial) o clave del pre-contrato a eliminar.' },
            },
            required: ['identificador'],
          },
        },
        run: async ({ identificador }) => {
          const encontrados = await buscarEnLista(token, '/api/promotoria/pre-contratos', identificador, 'clave');
          if (encontrados.length === 0) return { error: `No encontré ningún pre-contrato que coincida con "${identificador}".` };
          if (encontrados.length > 1) return { multiples_coincidencias: encontrados.map((p) => ({ nombre: p.nombre, clave: p.clave })) };
          return crmDelete(token, `/api/promotoria/pre-contratos/${encontrados[0].id}`);
        },
      },
      {
        spec: {
          name: 'consultar_cancelaciones',
          description:
            'Da el último reporte importado de cancelaciones de pólizas de TODA la promotoría (pólizas ' +
            'que pasaron a estatus Anulada): fecha detectada, asesor, número de póliza, contratante, ' +
            'estatus anterior y nuevo. Se puede filtrar por asesor, contratante y/o tipo — si el ' +
            'directivo pide algo específico (ej. "las de Fernando"), usa el filtro en vez de traer todo ' +
            'y buscarlo tú. Solo para directivos.',
          input_schema: {
            type: 'object',
            properties: {
              asesor: { type: 'string', description: 'Filtra por nombre (completo o parcial) del asesor.' },
              contratante: { type: 'string', description: 'Filtra por nombre (completo o parcial) del contratante.' },
              tipo: { type: 'string', description: 'Filtra por tipo de cancelación, tal como viene en el reporte.' },
            },
          },
        },
        run: async ({ asesor, contratante, tipo } = {}) => {
          const reporte = await crmGet(token, '/api/promotoria/cancelaciones');
          let rows = reporte.rows || [];
          if (asesor) rows = rows.filter((r) => normalizar(r.asesor).includes(normalizar(asesor)));
          if (contratante) rows = rows.filter((r) => normalizar(r.contratante).includes(normalizar(contratante)));
          if (tipo) rows = rows.filter((r) => normalizar(r.tipo).includes(normalizar(tipo)));
          return { importedAt: reporte.importedAt, sourceFile: reporte.sourceFile, total_encontradas: rows.length, rows };
        },
      },

      // Gerencia de Karen: mismo tipo de datos que la promotoría (pre-contratos y
      // cancelaciones), pero en su propia base separada (karen.json en el servidor).
      // Nunca se mezcla con los datos de la promotoría de arriba.
      {
        spec: {
          name: 'consultar_pre_contratos_karen',
          description:
            'Lista las claves en pre-contrato de la Gerencia de Karen (base separada de la promotoría): ' +
            'nombre, clave, fecha de apertura, y días restantes antes de que la clave venza ("diasRestantes" ' +
            'y "vencida" ya vienen calculados). Cada pre-contrato también trae su historial de pólizas: ' +
            '"polizasReasignar" y "detalleActivo", y "eventos"/"polizasActuales"/"desaparecida" (historial ' +
            'de la clave temporal). Solo para directivos.',
          input_schema: { type: 'object', properties: {} },
        },
        run: () => crmGet(token, '/api/karen/pre-contratos'),
      },
      {
        spec: {
          name: 'dar_de_alta_pre_contrato_karen',
          description:
            'Da de alta un pre-contrato nuevo en la Gerencia de Karen (nombre, clave, fecha de apertura ' +
            'de la clave). ES UNA ACCIÓN QUE ESCRIBE — solo tras confirmación explícita del directivo. ' +
            'Solo para directivos.',
          input_schema: {
            type: 'object',
            properties: {
              nombre: { type: 'string' },
              clave: { type: 'string' },
              fechaAperturaClave: { type: 'string', description: 'YYYY-MM-DD' },
            },
            required: ['nombre'],
          },
        },
        run: (datos) => crmPost(token, '/api/karen/pre-contratos', datos),
      },
      {
        spec: {
          name: 'editar_pre_contrato_karen',
          description:
            'Edita un pre-contrato existente de la Gerencia de Karen (nombre, clave, o fecha de apertura). ' +
            'Identifícalo por nombre o clave — si hay más de una coincidencia, pide que precise cuál. ES ' +
            'UNA ACCIÓN QUE ESCRIBE — solo tras confirmación explícita, mostrando antes qué va a cambiar. ' +
            'Solo para directivos.',
          input_schema: {
            type: 'object',
            properties: {
              identificador: { type: 'string', description: 'Nombre (completo o parcial) o clave del pre-contrato a editar.' },
              nombre: { type: 'string' },
              clave: { type: 'string' },
              fechaAperturaClave: { type: 'string', description: 'YYYY-MM-DD' },
            },
            required: ['identificador'],
          },
        },
        run: async ({ identificador, ...cambios }) => {
          const encontrados = await buscarEnLista(token, '/api/karen/pre-contratos', identificador, 'clave');
          if (encontrados.length === 0) return { error: `No encontré ningún pre-contrato de Karen que coincida con "${identificador}".` };
          if (encontrados.length > 1) return { multiples_coincidencias: encontrados.map((p) => ({ nombre: p.nombre, clave: p.clave })) };
          return crmPut(token, `/api/karen/pre-contratos/${encontrados[0].id}`, cambios);
        },
      },
      {
        spec: {
          name: 'eliminar_pre_contrato_karen',
          description:
            'ELIMINA PERMANENTEMENTE un pre-contrato de la Gerencia de Karen — no se puede deshacer. ' +
            'Antes de llamarla, muestra al directivo exactamente cuál se va a borrar y dile que es ' +
            'permanente; solo procede con una confirmación clara. Solo para directivos.',
          input_schema: {
            type: 'object',
            properties: {
              identificador: { type: 'string', description: 'Nombre (completo o parcial) o clave del pre-contrato a eliminar.' },
            },
            required: ['identificador'],
          },
        },
        run: async ({ identificador }) => {
          const encontrados = await buscarEnLista(token, '/api/karen/pre-contratos', identificador, 'clave');
          if (encontrados.length === 0) return { error: `No encontré ningún pre-contrato de Karen que coincida con "${identificador}".` };
          if (encontrados.length > 1) return { multiples_coincidencias: encontrados.map((p) => ({ nombre: p.nombre, clave: p.clave })) };
          return crmDelete(token, `/api/karen/pre-contratos/${encontrados[0].id}`);
        },
      },
      {
        spec: {
          name: 'consultar_cancelaciones_karen',
          description:
            'Da el último reporte importado de cancelaciones de pólizas de la Gerencia de Karen (base ' +
            'separada de la promotoría): fecha detectada, asesor, número de póliza, contratante, estatus ' +
            'anterior y nuevo. Se puede filtrar por asesor, contratante y/o tipo — si el directivo pide ' +
            'algo específico, usa el filtro en vez de traer todo y buscarlo tú. Solo para directivos.',
          input_schema: {
            type: 'object',
            properties: {
              asesor: { type: 'string', description: 'Filtra por nombre (completo o parcial) del asesor.' },
              contratante: { type: 'string', description: 'Filtra por nombre (completo o parcial) del contratante.' },
              tipo: { type: 'string', description: 'Filtra por tipo de cancelación, tal como viene en el reporte.' },
            },
          },
        },
        run: async ({ asesor, contratante, tipo } = {}) => {
          const reporte = await crmGet(token, '/api/karen/cancelaciones');
          let rows = reporte.rows || [];
          if (asesor) rows = rows.filter((r) => normalizar(r.asesor).includes(normalizar(asesor)));
          if (contratante) rows = rows.filter((r) => normalizar(r.contratante).includes(normalizar(contratante)));
          if (tipo) rows = rows.filter((r) => normalizar(r.tipo).includes(normalizar(tipo)));
          return { importedAt: reporte.importedAt, sourceFile: reporte.sourceFile, total_encontradas: rows.length, rows };
        },
      },

      // Panel de campañas: sistema aparte del CRM (otra página, otra base de
      // datos) con campañas, premios y estatus de pólizas de TODA la
      // promotoría. Solo para directivos — el avance individual de un asesor
      // se consulta con consultar_mi_compensacion/consultar_mi_campana, no con
      // estas.
      {
        spec: {
          name: 'consultar_campanas_promotoria',
          description:
            'Lista las campañas REALMENTE vigentes de la promotoría (clave técnica → fecha de corte), ' +
            'ej. "mdrt", "camino_cumbre", "convenciones", "legion_centurion", "graduacion", ' +
            '"educar_es_creer", "poder_elegirte". Usa la clave técnica exacta que regresa esta ' +
            'herramienta (en minúsculas) como el parámetro "campana" de consultar_mi_campana — nunca ' +
            'inventes ni asumas el nombre de una campaña sin haber llamado esta herramienta primero, y ' +
            'si una campaña que preguntan no aparece en esta lista, dile a la persona que no está ' +
            'vigente en vez de suponer. Solo para directivos.',
          input_schema: { type: 'object', properties: {} },
        },
        run: () => campanasGet('/api/campaigns/dates'),
      },
      {
        spec: {
          name: 'consultar_premios_promotoria',
          description:
            'Da el reporte de premios/compensación de TODA la promotoría del panel de campañas (no del ' +
            'CRM): "resumen" (cabecera y resumen de bonos del mes/acumulado — datos chicos, ya sumados, ' +
            'confía en ellos directo) y varias tablas de detalle (bonoVidaTablas, primaFaltanteTablas, ' +
            'subsidiosTablas) con filas tipo [Concepto, Real, Min, Cumple] o montos por grupo/mes.\n' +
            'IMPORTANTE sobre esas tablas de detalle: cuando una fila trae explícitamente "Gpo: N" en su ' +
            'columna Min, o algo en su columna "Cumple", ESE es el dato oficial de qué grupo/nivel ya se ' +
            'alcanzó — repórtalo tal cual. NUNCA calcules tú si un grupo "ya se superó" o "cuánto falta" ' +
            'comparando a mano los montos de la tabla de grupos por mes (primaFaltanteTablas) contra un ' +
            'total de prima — esa tabla tiene reglas de negocio (LIMRA, GA, otros mínimos) que no están ' +
            'explícitas en los números, y una comparación simple da conclusiones falsas. Para esas ' +
            'preguntas, muestra los montos de la tabla como referencia pero dile a la persona que la ' +
            'calificación exacta de grupo la marca el propio "Gpo: N" de la fila correspondiente, no una ' +
            'cuenta tuya. Solo para directivos.',
          input_schema: { type: 'object', properties: {} },
        },
        run: () => campanasGet('/api/premios-promotoria'),
      },
      {
        spec: {
          name: 'consultar_ventas_mensuales_promotoria',
          description:
            'Da el reporte de cierre de mes del panel de campañas: tabla de ventas y campeones por ' +
            'categoría de toda la promotoría. Solo para directivos.',
          input_schema: { type: 'object', properties: {} },
        },
        run: () => campanasGet('/api/ventas-mensuales/latest'),
      },
      {
        spec: {
          name: 'consultar_resumen_general_promotoria',
          description:
            'Da TODO el reporte "Resumen de Promotoría" del panel de campañas, con estas secciones (usa ' +
            'la que corresponda a la pregunta — no pidas otra herramienta para esto):\n' +
            '- "pagado_pendiente": fila por asesor con TODOS los campos crudos (incluye montos de recibo ' +
            'ordinario/renovación aunque no tenga una póliza nueva pendiente) — NO la uses para "qué ' +
            'asesores tienen pólizas pendientes/pagadas", solo para un dato puntual de un asesor exacto.\n' +
            '- "totales_pagado_pendiente_promotoria_general": SIEMPRE usa este objeto para el TOTAL de ' +
            'pólizas/primas pagadas y pendientes — ya viene sumado correctamente; NUNCA sumes tú las ' +
            'filas de "pagado_pendiente" a mano, es fácil equivocarse con tantos renglones.\n' +
            '- "asesores_con_polizas_pagadas" / "asesores_con_polizas_pendientes": USA ESTAS para "qué ' +
            'asesores tienen pólizas pagadas/pendientes" — ya vienen filtradas (solo quien realmente ' +
            'tiene una póliza nueva pagada/pendiente, no solo un recibo ordinario pendiente) y ordenadas ' +
            'de mayor a menor. Coinciden exacto con las tablas "Asesores con Pólizas Pagadas/Pendientes" ' +
            'de la pantalla — no filtres tú mismo "pagado_pendiente", usa estas listas ya hechas.\n' +
            'Todo lo anterior tiene su equivalente para Reclutas y Temporales con el sufijo ' +
            '"_reclutas"/"_reclutas_temporales".\n' +
            '- "asesores_sin_emision": objeto crudo — NO lo uses para contar/listar. Para "cuántos/quiénes ' +
            'no tienen emisión" usa "resumen_asesores_sin_emision" (conteos ya hechos: sinEmisionVida, ' +
            'sinEmisionGMM, tresMesesSinEmisionVida/GMM, totalPrimaPagadaVida/GMM) y las listas ya ' +
            'filtradas "asesores_sin_emision_vida" / "asesores_sin_emision_gmm". Para el desglose por ' +
            'sucursal (ya con porcentajes calculados) usa "asesores_sin_emision_por_sucursal".\n' +
            '- "proactivos": fila cruda por asesor — NO la uses para contar/listar, solo para un dato ' +
            'puntual de un asesor exacto. Para "cuántos/quiénes son o no proactivos" usa siempre ' +
            '"resumen_proactivos" (conteos ya hechos: proactivosEsteMes, noProactivosEsteMes, ' +
            'proactivosADiciembre, noProactivosADiciembre) y las listas ya filtradas ' +
            '"asesores_proactivos_mes" / "asesores_no_proactivos_mes" / "asesores_proactivos_dic" / ' +
            '"asesores_no_proactivos_dic" — no cuentes ni filtres tú mismo el arreglo "proactivos".\n' +
            '- "convenciones_promotores" y "convenciones_gerente": calificación de "Camino 1/2/3" de ' +
            'TODA la promotoría o de toda la Gerencia Karen como bloque (no de un asesor individual) — ' +
            'para el avance de un asesor específico en Convenciones usa consultar_kpis_asesores_promotoria.\n' +
            '- "historico_metas": histórico de la Meta Anual 2026.\n' +
            'Sucursal 2043 = Promotoría General, sucursal 2856 = Gerencia Karen — filtra por "Sucursal" ' +
            'si preguntan específicamente por una de las dos (los totales precalculados son de TODOS, no ' +
            'por sucursal). Solo para directivos.',
          input_schema: { type: 'object', properties: {} },
        },
        run: async () => {
          const data = await campanasGet('/api/resumen-general');
          const sumar = (rows, campo) => (rows || []).reduce((acc, r) => acc + (Number(r[campo]) || 0), 0);
          const totalesDe = (rows) => ({
            polizasPagadas: sumar(rows, 'Pólizas-Pagadas'),
            reciboInicialPagado: sumar(rows, 'Recibo_Inicial_Pagado'),
            reciboOrdinarioPagado: sumar(rows, 'Recibo_Ordinario_Pagado'),
            totalPrimaPagada: sumar(rows, 'Total _Prima_Pagada'),
            polizasPendientes: sumar(rows, 'Pólizas_Pendinetes'),
            reciboInicialPendiente: sumar(rows, 'Recibo_Inicial_Pendiente'),
            reciboOrdinarioPendiente: sumar(rows, 'Recibo_Ordinario_Pendiente'),
            totalPrimaPendiente: sumar(rows, 'Total _Prima_Pendiente'),
          });
          const conPagadas = (rows) => (rows || [])
            .filter((r) => Number(r['Pólizas-Pagadas'] || 0) > 0)
            .map((r) => ({ nombre: r['Nombre Asesor'], sucursal: r['Sucursal'], polizasPagadas: r['Pólizas-Pagadas'], reciboInicialPagado: r['Recibo_Inicial_Pagado'] }))
            .sort((a, b) => (b.reciboInicialPagado || 0) - (a.reciboInicialPagado || 0));
          const conPendientes = (rows) => (rows || [])
            .filter((r) => Number(r['Pólizas_Pendinetes'] || 0) > 0)
            .map((r) => ({ nombre: r['Nombre Asesor'], sucursal: r['Sucursal'], polizasPendientes: r['Pólizas_Pendinetes'], reciboInicialPendiente: r['Recibo_Inicial_Pendiente'] }))
            .sort((a, b) => (b.reciboInicialPendiente || 0) - (a.reciboInicialPendiente || 0));
          const esProactivo = (v) => ['p', 'sí', 'si'].includes(String(v || '').trim().toLowerCase());
          const proactivosRows = data.proactivos || [];
          const listaProactivo = (campo) => proactivosRows
            .filter((r) => esProactivo(r[campo]))
            .map((r) => ({ nombre: r.ASESOR, sucursal: r.SUC, polizasAcumuladas: r.Polizas_Acumuladas_Total, fechaConexion: r.Fecha_Conexion }))
            .sort((a, b) => (b.polizasAcumuladas || 0) - (a.polizasAcumuladas || 0));
          const listaNoProactivo = (campo, campoFaltantes) => proactivosRows
            .filter((r) => !esProactivo(r[campo]))
            .map((r) => ({ nombre: r.ASESOR, sucursal: r.SUC, polizasAcumuladas: r.Polizas_Acumuladas_Total, polizasFaltantes: r[campoFaltantes], fechaConexion: r.Fecha_Conexion }))
            .sort((a, b) => (b.polizasFaltantes || 0) - (a.polizasFaltantes || 0));

          return {
            ...data,
            totales_pagado_pendiente_promotoria_general: totalesDe(data.pagado_pendiente),
            totales_pagado_pendiente_reclutas_temporales: totalesDe(data.pagado_pendiente_reclutas),
            asesores_con_polizas_pagadas: conPagadas(data.pagado_pendiente),
            asesores_con_polizas_pendientes: conPendientes(data.pagado_pendiente),
            asesores_con_polizas_pagadas_reclutas: conPagadas(data.pagado_pendiente_reclutas),
            asesores_con_polizas_pendientes_reclutas: conPendientes(data.pagado_pendiente_reclutas),
            resumen_proactivos: {
              totalAsesores: proactivosRows.length,
              proactivosEsteMes: proactivosRows.filter((r) => esProactivo(r.Proactivo_al_mes)).length,
              noProactivosEsteMes: proactivosRows.filter((r) => !esProactivo(r.Proactivo_al_mes)).length,
              proactivosADiciembre: proactivosRows.filter((r) => esProactivo(r.Proactivo_a_Dic)).length,
              noProactivosADiciembre: proactivosRows.filter((r) => !esProactivo(r.Proactivo_a_Dic)).length,
            },
            asesores_proactivos_mes: listaProactivo('Proactivo_al_mes'),
            asesores_no_proactivos_mes: listaNoProactivo('Proactivo_al_mes', 'Pólizas_Faltantes'),
            asesores_proactivos_dic: listaProactivo('Proactivo_a_Dic'),
            asesores_no_proactivos_dic: listaNoProactivo('Proactivo_a_Dic', 'Pólizas_Faltantes_Para_Dic'),
            ...(() => {
              const individuals = (data.asesores_sin_emision || {}).individuals || [];
              const sinEmision = (campo) => individuals
                .filter((r) => r[campo] === 'i')
                .map((r) => ({ nombre: r.Asesor, sucursal: r.Suc, primaPagadaVida: r.Prima_Pagada_Vida, primaPagadaGMM: r.Prima_Pagada_GMM }));
              return {
                resumen_asesores_sin_emision: {
                  totalAsesores: individuals.length,
                  sinEmisionVida: individuals.filter((r) => r.Sin_Emisión_Vida === 'i').length,
                  sinEmisionGMM: individuals.filter((r) => r.Sin_Emisión_GMM === 'i').length,
                  tresMesesSinEmisionVida: individuals.filter((r) => r['3_Meses_Sin_Emisión_Vida'] === 'i').length,
                  tresMesesSinEmisionGMM: individuals.filter((r) => r['3_Meses_Sin_Emisión_GMM'] === 'i').length,
                  totalPrimaPagadaVida: individuals.reduce((s, r) => s + (Number(r.Prima_Pagada_Vida) || 0), 0),
                  totalPrimaPagadaGMM: individuals.reduce((s, r) => s + (Number(r.Prima_Pagada_GMM) || 0), 0),
                },
                asesores_sin_emision_vida: sinEmision('Sin_Emisión_Vida'),
                asesores_sin_emision_gmm: sinEmision('Sin_Emisión_GMM'),
                asesores_sin_emision_por_sucursal: (data.asesores_sin_emision || {}).summaryBySucursal || [],
              };
            })(),
            // Fuera de alcance por ahora (a petición explícita) — se quitan del todo para que el
            // bot ni se entere de que existen, no solo para que "no los use".
            comparativo_vida: undefined,
            qsq_vida: undefined,
            qsq_gmm: undefined,
          };
        },
      },
      {
        spec: {
          name: 'consultar_kpis_asesores_promotoria',
          description:
            'Da el reporte "Resumen de Asesores" del panel de campañas — el avance de CADA asesor (uno ' +
            'por fila, búscalo por nombre) en: "mdrt", "legion_centurion", "camino_cumbre", ' +
            '"graduacion", "educar_es_creer", "poder_elegirte" (PA acumulada, lugar) y "convenciones" ' +
            '(ranking de Diamantes — "Lugar_480/495"=1 Diamante/Los Cabos, "Lugar_228"=2 Diamantes/ ' +
            'Vancouver, "Lugar_108"=3 Diamantes/Estambul, "Lugar_28"=Gran Diamante/Japón; cada fila ya ' +
            'trae "Cumple_Polizas", "Cumple_Creditos", "Califica" y "destino_alcanzado" calculados — ' +
            'usa siempre esos, nunca los recalcules tú). Esta es la herramienta correcta cuando ' +
            'pregunten por el avance de UN asesor específico en cualquier campaña — nunca ' +
            '"convenciones_promotores" ni "convenciones_gerente".\n' +
            'En "educar_es_creer" y "poder_elegirte": "Kits_Ganados_Nacional" y "Kits_Restantes_Nacional" ' +
            'son un TOTAL NACIONAL igual para todos los asesores — NUNCA los presentes como algo ' +
            'personal del asesor que preguntó; lo personal de cada quien es "Puntos_Doble", ' +
            '"Polizas_Detalle" y "Clientes_Kits".\n' +
            'En "legion_centurion": "EnMeta" (true/false) y "Nivel" son el dato oficial de calificación ' +
            '— repórtalos tal cual, no los infieras de "Total_Polizas".\n' +
            '"convenciones_promotores" y "convenciones_gerente" son un reporte TOTALMENTE distinto: la ' +
            'calificación de "Camino 1/2/3" de TODA la promotoría o de toda la Gerencia Karen como ' +
            'bloque (no de un asesor individual) — solo úsalos si preguntan explícitamente por eso a ' +
            'nivel promotoría/gerencia, nunca como respuesta a "cómo va fulano en convenciones".\n' +
            'Solo para directivos.',
          input_schema: { type: 'object', properties: {} },
        },
        run: async () => {
          const data = await campanasGet('/api/admin/summary');
          const conCalificacion = (rows) => (rows || []).map((r) => {
            const cumplePolizas = r.Cumple_Polizas !== undefined ? !!r.Cumple_Polizas : Number(r.Polizas || 0) >= 30;
            const cumpleCreditos = r.Cumple_Creditos !== undefined ? !!r.Cumple_Creditos : Number(r.PA_Total || 0) >= 620000;
            const califica = r.Califica !== undefined ? !!r.Califica : (cumplePolizas && cumpleCreditos);
            const lugar = Number(r.Lugar || 0);
            let destino = null;
            if (califica) {
              if (lugar <= 28) destino = 'Gran Diamante (Japón)';
              else if (lugar <= 108) destino = '3 Diamantes (Estambul)';
              else if (lugar <= 228) destino = '2 Diamantes (Vancouver)';
              else if (lugar <= 495) destino = '1 Diamante (Los Cabos)';
            }
            return { ...r, Cumple_Polizas: cumplePolizas, Cumple_Creditos: cumpleCreditos, Califica: califica, destino_alcanzado: destino };
          });
          return { ...data, convenciones: conCalificacion(data.convenciones) };
        },
      },
      {
        spec: {
          name: 'consultar_historico_metas_promotoria',
          description:
            'Da el histórico de la Meta Anual 2026 de la promotoría, mes a mes (complementa a ' +
            'consultar_resumen_general_promotoria para la pantalla "Meta Anual 24M"). Solo para directivos.',
          input_schema: { type: 'object', properties: {} },
        },
        run: () => campanasGet('/api/historico-metas'),
      },
      {
        spec: {
          name: 'consultar_premios_gerencia_karen_campanas',
          description:
            'Da el reporte de premios/compensación de la Gerencia Karen (sucursal 2856) en el panel de ' +
            'campañas — OJO: esto es distinto a la pestaña "Karen" del CRM de promotoría (pre-contratos ' +
            'y cancelaciones); aquí es específicamente de campañas y premios. Solo para directivos.',
          input_schema: { type: 'object', properties: {} },
        },
        run: () => campanasGet('/api/premios-ga'),
      },
      {
        spec: {
          name: 'consultar_estatus_polizas_promotoria',
          description:
            'Da el seguimiento de pólizas que pasaron a Anulada y siguen pendientes de recuperar, y las ' +
            'ya recuperadas (que volvieron a En Vigor) este mes — de toda la promotoría, del panel de ' +
            'campañas. Esto es sobre el ESTATUS de la póliza (anulada/recuperada), NO sobre montos de ' +
            'prima pagada/pendiente — para eso usa consultar_resumen_general_promotoria (sección ' +
            '"pagado_pendiente"). Solo para directivos.',
          input_schema: { type: 'object', properties: {} },
        },
        run: () => campanasGet('/api/estatus-polizas/seguimiento'),
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
- Nunca hagas afirmaciones comparativas ("es de los más altos", "va mejor que fulano", "está por
  debajo de zutano") a menos que hayas consultado realmente los datos de esas otras personas en
  ESTA conversación. Un solo dato de una sola persona no te da base para compararla con nadie más
  — repórtalo tal cual, sin agregar un ranking o comparación que no verificaste.
- No inventes nombres de niveles, tramos o campos que no vengan explícitos en los datos de la
  herramienta (ej. no le pongas tu propio nombre a un campo como "Lugar_28" si no sabes con certeza
  qué representa) — si una herramienta te explica el significado de sus campos en su descripción,
  úsalo tal cual; si no lo sabes, repórtalo con el nombre técnico del dato en vez de adivinarle un
  significado.
- Si tienes herramientas de promotoría disponibles (asesores, pre-contratos, cancelaciones), son
  datos de TODOS los asesores de la promotoría, no de la cartera personal de quien pregunta — no los
  mezcles. El sistema YA verificó que quien te escribe es directivo antes de dártelas — si estas
  herramientas aparecen en esta conversación, úsalas directo cuando te las pidan; nunca le preguntes
  a la persona si es directivo ni le pidas que te lo confirme, eso ya no hace falta.

Sobre acciones que escriben datos (dar de alta, marcar como pagada, anular, reactivar, identificar,
editar, o cualquier otra que modifique el CRM): NUNCA llames a una de estas herramientas sin que el
asesor haya confirmado explícitamente qué quiere hacer, sobre qué póliza exacta (por su número, no
por nombre — si solo te dio un nombre y hay más de una póliza a su nombre, pregunta cuál número
antes de actuar). Si hay cualquier duda, pregunta primero en vez de suponer.

Sobre las herramientas que empiezan con "eliminar_" (cliente, asesor de promotoría, pre-contrato):
son las únicas acciones sin marcha atrás — no hay forma de recuperar lo borrado. Antes de llamar
cualquiera de ellas, muestra siempre los datos exactos de lo que se va a borrar, dile explícitamente
a quien pregunta que es permanente, y espera una confirmación clara e inequívoca (no una respuesta
ambigua) antes de proceder.

Sobre "multiples_coincidencias": si una herramienta regresa esto, significa que el nombre o clave que
diste coincide con más de un registro — muéstraselos a quien pregunta y pide que precise cuál antes
de editar o eliminar nada.

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
      max_tokens: 4096,
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
