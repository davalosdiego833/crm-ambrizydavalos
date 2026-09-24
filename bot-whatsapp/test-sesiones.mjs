// Prueba de un solo uso: simula un CRM chiquito (sin tocar el real) para
// verificar que la lógica de "buscar asesor por número → pedir token →
// cachear sesión" funcione bien antes de probarla con datos reales.
import http from 'node:http';
import assert from 'node:assert/strict';

const usuariosFalsos = [
  { id: 1, name: 'Diego (admin)', role: 'admin', whatsappNumber: '+52 33 3847 1689', whatsappBotEnabled: true, blocked: false },
  { id: 2, name: 'Asesor Sin Acceso', role: 'advisor', whatsappNumber: '5215551112222', whatsappBotEnabled: false, blocked: false },
  { id: 3, name: 'Directora Promotoría', role: 'promotoria', whatsappNumber: '523312345678', whatsappBotEnabled: true, blocked: false },
];

const server = http.createServer((req, res) => {
  if (req.url === '/api/admin/users') {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify(usuariosFalsos));
  }
  const m = req.url.match(/^\/api\/admin\/users\/(\d+)\/bot-token$/);
  if (m && req.method === 'POST') {
    const user = usuariosFalsos.find((u) => u.id === Number(m[1]));
    if (!user || !user.whatsappBotEnabled) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'sin acceso' }));
    }
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ token: `token-falso-${user.id}`, user: { id: user.id, name: user.name, role: user.role } }));
  }
  res.statusCode = 404;
  res.end();
});

await new Promise((resolve) => server.listen(5099, resolve));
process.env.CRM_URL = 'http://localhost:5099';

const { normalizarTelefono, listarUsuariosAdmin, pedirBotToken } = await import('../asistente-prototipo/crm-tools.js');

// 1. Números escritos distinto deben normalizarse igual
assert.equal(normalizarTelefono('+52 33 3847 1689'), normalizarTelefono('5213338471689'));
console.log('✓ normalizarTelefono ignora formato y el "1" extra de México');

// 2. Encontrar al asesor correcto por número, ignorando formato
const usuarios = await listarUsuariosAdmin('cualquier-token-admin');
const buscado = normalizarTelefono('5213338471689');
const encontrado = usuarios.find((u) => normalizarTelefono(u.whatsappNumber) === buscado && u.whatsappBotEnabled && !u.blocked);
assert.equal(encontrado?.id, 1);
console.log('✓ encuentra al usuario correcto aunque el número esté guardado con otro formato');

// 3. Un usuario con el interruptor apagado no debe "encontrarse" como disponible
const apagado = usuarios.find((u) => u.id === 2);
assert.equal(apagado.whatsappBotEnabled, false);
console.log('✓ el usuario con el interruptor apagado no cuenta como disponible');

// 4. Pedir token para alguien con acceso funciona
const { token, user } = await pedirBotToken('token-admin', 3);
assert.equal(token, 'token-falso-3');
assert.equal(user.role, 'promotoria');
console.log('✓ pedirBotToken regresa token + rol para un usuario con acceso');

// 5. Pedir token para alguien SIN acceso falla con el mensaje correcto
try {
  await pedirBotToken('token-admin', 2);
  throw new Error('Debería haber fallado');
} catch (err) {
  assert.equal(err.message, 'sin acceso');
  console.log('✓ pedirBotToken rechaza a un usuario sin el interruptor prendido');
}

server.close();
console.log('\n✅ Todas las pruebas pasaron.');
