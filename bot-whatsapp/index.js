import express from 'express';
import readline from 'node:readline';
import Anthropic from '@anthropic-ai/sdk';
import {
  loginCRM,
  construirHerramientas,
  SYSTEM_PROMPT_BASE,
  responder,
  leerPolizaPDF,
  normalizarTelefono,
  listarUsuariosAdmin,
  pedirBotToken,
} from '../asistente-prototipo/crm-tools.js';

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';
const PORT = process.env.PORT || 3000;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;

// El bot inicia sesión UNA VEZ como administrador (adminToken). Con eso, por
// cada número de WhatsApp que escribe, busca a qué asesor le pertenece y le
// pide al CRM un acceso de corta duración para actuar como esa persona — así
// nunca necesita conocer la contraseña de nadie más que la del admin.
let adminToken;
let anthropic;

// Una sesión por número de WhatsApp: su historial de conversación, y el
// acceso (token + herramientas) vigente para esa persona. El token se pide
// de nuevo cuando caduca; el historial de la conversación se conserva.
const sesiones = new Map();
const DURACION_TOKEN_MS = 3.5 * 60 * 60 * 1000; // un poco menos que las 4h reales, por margen

const SYSTEM_PROMPT = SYSTEM_PROMPT_BASE + `
- Estás contestando por WhatsApp. Para negritas usa un solo asterisco por lado (*así*) — NUNCA
  doble asterisco, WhatsApp no lo interpreta y se ve feo.
- No uses tablas de markdown; usa listas simples con guiones.
- Tu respuesta completa nunca debe superar los 1200 caracteres.`;

function ask(question, { hide = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (hide) {
      const original = rl._writeToOutput.bind(rl);
      rl._writeToOutput = (str) => original(str.includes('\n') ? str : '*');
    }
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Para celulares de México, el remitente llega con un "1" extra después del
// "52" (ej. 521XXXXXXXXXX), pero para ENVIAR hay que quitarlo (52XXXXXXXXXX)
// — es un quirk conocido de la API de WhatsApp con la numeración mexicana.
function paraEnviar(numero) {
  if (numero.startsWith('521') && numero.length === 13) return '52' + numero.slice(3);
  return numero;
}

// Encuentra, por número de WhatsApp, a qué asesor le pertenece un mensaje —
// o null si nadie con ese número tiene el acceso encendido.
async function encontrarAsesorPorNumero(numeroWhatsapp) {
  const usuarios = await listarUsuariosAdmin(adminToken);
  const buscado = normalizarTelefono(numeroWhatsapp);
  return usuarios.find(
    (u) => u.whatsappBotEnabled && !u.blocked && normalizarTelefono(u.whatsappNumber) === buscado
  );
}

// Da la sesión vigente para ese número (la reutiliza si el token todavía no
// caduca; si no hay una, o ya venció, busca al asesor y pide un acceso
// nuevo). Regresa null si ese número no tiene acceso al asistente.
async function obtenerSesion(numeroWhatsapp) {
  const existente = sesiones.get(numeroWhatsapp);
  if (existente && Date.now() - existente.obtenidoEn < DURACION_TOKEN_MS) {
    return existente;
  }

  const asesor = await encontrarAsesorPorNumero(numeroWhatsapp);
  if (!asesor) return null;

  const { token } = await pedirBotToken(adminToken, asesor.id);
  const sesion = {
    userId: asesor.id,
    nombre: asesor.name,
    role: asesor.role,
    token,
    obtenidoEn: Date.now(),
    herramientas: construirHerramientas(token, asesor.role),
    messages: existente?.messages || [],
  };
  sesiones.set(numeroWhatsapp, sesion);
  return sesion;
}

// Un documento de WhatsApp no trae el archivo, trae un ID — hay que pedirle a
// Meta la URL real (paso 1) y luego descargar el archivo de ahí (paso 2),
// ambos con el mismo token.
async function descargarMediaWhatsApp(mediaId) {
  const infoRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
  });
  if (!infoRes.ok) throw new Error(`No se pudo obtener el archivo (${infoRes.status})`);
  const info = await infoRes.json();

  const archivoRes = await fetch(info.url, {
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
  });
  if (!archivoRes.ok) throw new Error(`No se pudo descargar el archivo (${archivoRes.status})`);
  return Buffer.from(await archivoRes.arrayBuffer());
}

async function enviarWhatsApp(numero, texto) {
  const res = await fetch(`https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: paraEnviar(numero),
      type: 'text',
      text: { body: texto.slice(0, 4000) },
    }),
  });
  if (!res.ok) {
    console.error('Error enviando a WhatsApp:', res.status, await res.text().catch(() => ''));
  }
}

const app = express();
app.use(express.json());

app.get('/', (req, res) => res.send('Bot de WhatsApp — CRM Ambriz. Corriendo.'));

// Meta llama esto una vez, para verificar que el webhook es tuyo.
app.get('/webhook', (req, res) => {
  const modo = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const reto = req.query['hub.challenge'];

  if (modo === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
    console.log('✓ Webhook verificado por Meta.');
    return res.status(200).send(reto);
  }
  return res.sendStatus(403);
});

// Aquí llegan los mensajes reales.
app.post('/webhook', (req, res) => {
  res.sendStatus(200); // Meta espera respuesta rápida; procesamos aparte.

  console.log('\n🔔 Webhook recibido:', JSON.stringify(req.body));

  const cambio = req.body?.entry?.[0]?.changes?.[0]?.value;
  const mensaje = cambio?.messages?.[0];
  if (!mensaje) return; // ignora confirmaciones de entrega, etc.

  const numero = mensaje.from;

  if (mensaje.type === 'document') {
    console.log(`\n📎 ${numero}: envió "${mensaje.document.filename}"`);
    procesarDocumento(numero, mensaje.document).catch((err) => {
      console.error('Error procesando documento:', err);
      enviarWhatsApp(numero, 'No pude leer ese archivo. Intenta de nuevo o revisa que sea un PDF.');
    });
    return;
  }

  if (mensaje.type !== 'text') return; // ignora audios, imágenes sueltas, etc. por ahora

  const texto = mensaje.text.body;
  console.log(`\n📩 ${numero}: ${texto}`);

  procesarMensaje(numero, texto).catch((err) => {
    console.error('Error procesando mensaje:', err);
    enviarWhatsApp(numero, 'Tuve un problema consultando el CRM. Intenta de nuevo en un momento.');
  });
});

async function procesarDocumento(numero, documento) {
  const sesion = await obtenerSesion(numero);
  if (!sesion) {
    return enviarWhatsApp(numero, 'Este número no tiene acceso a este asistente. Contacta a tu promotor.');
  }

  if (documento.mime_type !== 'application/pdf') {
    return enviarWhatsApp(numero, 'Por ahora solo puedo leer pólizas en PDF.');
  }

  const bytes = await descargarMediaWhatsApp(documento.id);
  let datos;
  try {
    datos = await leerPolizaPDF(sesion.token, bytes, documento.filename);
  } catch (err) {
    return enviarWhatsApp(numero, 'No pude leer los datos de esa póliza. ¿Es un PDF de carátula de póliza?');
  }

  const aviso =
    `[El asesor mandó un PDF de póliza ("${documento.filename}"). Esto es lo que el sistema extrajo ` +
    `automáticamente: ${JSON.stringify(datos)}. Muéstraselo para confirmar antes de darlo de alta.]`;

  await procesarMensaje(numero, aviso, sesion);
}

async function procesarMensaje(numero, texto, sesionYaObtenida) {
  const sesion = sesionYaObtenida || (await obtenerSesion(numero));
  if (!sesion) {
    return enviarWhatsApp(numero, 'Este número no tiene acceso a este asistente. Contacta a tu promotor.');
  }

  const log = (nombre, input) => console.log(`  [herramienta] ${nombre}(${JSON.stringify(input)})`);
  const respuesta = await responder(anthropic, MODEL, sesion.herramientas, sesion.messages, texto, SYSTEM_PROMPT, log);

  console.log(`🤖 → ${numero} (${sesion.nombre}): ${respuesta}`);
  await enviarWhatsApp(numero, respuesta);
}

async function main() {
  const faltantes = ['ANTHROPIC_API_KEY', 'WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WEBHOOK_VERIFY_TOKEN']
    .filter((v) => !process.env[v]);
  if (faltantes.length) {
    console.error(`\nFaltan variables de entorno: ${faltantes.join(', ')}\n`);
    process.exit(1);
  }

  console.log('Inicia sesión como ADMINISTRADOR — el bot usa esta cuenta solo para reconocer\nasesores y pedir accesos temporales, nunca para contestar preguntas con ella.\n');
  const email = process.env.CRM_EMAIL || await ask('Correo del CRM (admin): ');
  const password = process.env.CRM_PASSWORD || await ask('Contraseña del CRM (admin): ', { hide: true });
  const { token, user } = await loginCRM(email, password);
  console.log(`\n✓ Conectado al CRM como ${user.name} (${user.role})`);

  adminToken = token;
  anthropic = new Anthropic();

  app.listen(PORT, () => {
    console.log(`🤖 Bot de WhatsApp escuchando en el puerto ${PORT}`);
    console.log('Esperando mensajes...\n');
  });
}

main().catch((err) => {
  console.error('\nError:', err.message);
  process.exit(1);
});
