// Script de un solo uso: baja el JSON crudo de /api/dashboard y /api/analytics
// contra el CRM real, y lo guarda en archivos locales para revisarlos.
import readline from 'node:readline';
import fs from 'node:fs';
import { loginCRM } from '../asistente-prototipo/crm-tools.js';

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

async function main() {
  const CRM_URL = process.env.CRM_URL || 'https://crm.ambrizydavalos.com';
  const email = process.env.CRM_EMAIL || (await ask('Correo del CRM: '));
  const password = process.env.CRM_PASSWORD || (await ask('Contraseña del CRM: ', { hide: true }));
  const { token } = await loginCRM(email, password);

  const dashboard = await fetch(`${CRM_URL}/api/dashboard`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  fs.writeFileSync('dashboard_crudo.json', JSON.stringify(dashboard, null, 2));

  const analytics = await fetch(`${CRM_URL}/api/analytics`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  fs.writeFileSync('analytics_crudo.json', JSON.stringify(analytics, null, 2));

  const clients = await fetch(`${CRM_URL}/api/clients`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  fs.writeFileSync('clients_crudo.json', JSON.stringify(clients, null, 2));

  console.log('\n✓ Guardado: dashboard_crudo.json, analytics_crudo.json, clients_crudo.json');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
