import Anthropic from '@anthropic-ai/sdk';
import readline from 'node:readline';
import { normalizar, loginCRM, construirHerramientas, SYSTEM_PROMPT_BASE, responder } from './crm-tools.js';

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';

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

const SYSTEM_PROMPT = SYSTEM_PROMPT_BASE + `
- Estás en una terminal de prueba: puedes usar un poco más de espacio que en WhatsApp, pero sigue siendo breve.`;

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      '\nFalta la variable ANTHROPIC_API_KEY.\n' +
      'Consíguela en https://console.anthropic.com/settings/keys y corre:\n' +
      '  export ANTHROPIC_API_KEY="tu-llave"\n'
    );
    process.exit(1);
  }

  const email = process.env.CRM_EMAIL || await ask('Correo del CRM: ');
  const password = process.env.CRM_PASSWORD || await ask('Contraseña del CRM: ', { hide: true });
  const { token, user } = await loginCRM(email, password);
  console.log(`\n✓ Conectado al CRM como ${user.name} (${user.role})\n`);

  const herramientas = construirHerramientas(token);
  const client = new Anthropic();
  const messages = [];

  console.log('Prototipo listo. Escribe tu pregunta (o "salir" para terminar).\n');

  while (true) {
    const pregunta = await ask('Tú: ');
    if (['salir', 'exit', 'quit'].includes(normalizar(pregunta))) break;
    if (!pregunta) continue;

    const log = (nombre, input) => console.log(`  [herramienta] ${nombre}(${JSON.stringify(input)})`);
    const texto = await responder(client, MODEL, herramientas, messages, pregunta, SYSTEM_PROMPT, log);
    console.log(`\nClaude: ${texto}\n`);
  }

  console.log('\nHasta luego.');
  process.exit(0);
}

main().catch((err) => {
  console.error('\nError:', err.message);
  process.exit(1);
});
