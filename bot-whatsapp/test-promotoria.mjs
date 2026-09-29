// Prueba de un solo uso: simula los endpoints de promotoría para verificar
// que buscar por nombre/clave, detectar coincidencias múltiples, y filtrar
// cancelaciones funcionen bien antes de probarlo con datos reales.
import http from 'node:http';
import assert from 'node:assert/strict';

const asesoresFalsos = [
  { id: 1, nombre: 'FERNANDO LOPEZ GARCIA', claveAgente: 'A100', fechaNacimiento: '1990-01-01', fechaFirmaContrato: '2020-01-01' },
  { id: 2, nombre: 'FERNANDO RUIZ TORRES', claveAgente: 'A200', fechaNacimiento: '1985-05-05', fechaFirmaContrato: '2019-01-01' },
];
const cancelacionesFalsas = {
  importedAt: '2026-09-25T00:00:00Z',
  sourceFile: 'reporte.xlsx',
  rows: [
    { asesor: 'FERNANDO LOPEZ GARCIA', contratante: 'JUAN PEREZ', tipo: 'Anulada', noPoliza: 'VI1' },
    { asesor: 'FERNANDO RUIZ TORRES', contratante: 'ANA GOMEZ', tipo: 'Anulada', noPoliza: 'VI2' },
    { asesor: 'MONICA RAMIREZ', contratante: 'LUIS DIAZ', tipo: 'Rechazada', noPoliza: 'GM3' },
  ],
};

let ultimoPUT = null;
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/api/promotoria/asesores' && req.method === 'GET') {
    return res.end(JSON.stringify(asesoresFalsos));
  }
  if (req.url === '/api/promotoria/cancelaciones' && req.method === 'GET') {
    return res.end(JSON.stringify(cancelacionesFalsas));
  }
  const m = req.url.match(/^\/api\/promotoria\/asesores\/(\d+)$/);
  if (m && req.method === 'PUT') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      ultimoPUT = { id: Number(m[1]), body: JSON.parse(body) };
      res.end(JSON.stringify({ success: true }));
    });
    return;
  }
  res.statusCode = 404;
  res.end();
});

await new Promise((resolve) => server.listen(5098, resolve));
process.env.CRM_URL = 'http://localhost:5098';
const crmTools = await import('../asistente-prototipo/crm-tools.js');
const herramientas = crmTools.construirHerramientas('token-falso', 'admin');
const porNombre = (n) => herramientas.find((h) => h.spec.name === n);

// 1. "fernando" solo, sin apellido -> debe encontrar a los DOS y pedir que se precise
const editar = porNombre('editar_asesor_promotoria');
const resultadoAmbiguo = await editar.run({ identificador: 'fernando', fechaNacimiento: '1999-09-09' });
assert.ok(resultadoAmbiguo.multiples_coincidencias);
assert.equal(resultadoAmbiguo.multiples_coincidencias.length, 2);
console.log('✓ "fernando" solo detecta las 2 coincidencias y no adivina cuál editar');

// 2. Con la clave exacta sí debe encontrar a uno solo y editarlo
const resultadoPreciso = await editar.run({ identificador: 'A200', fechaNacimiento: '1999-09-09' });
assert.equal(resultadoPreciso.success, true);
assert.equal(ultimoPUT.id, 2);
assert.equal(ultimoPUT.body.fechaNacimiento, '1999-09-09');
console.log('✓ buscar por clave de agente exacta edita al asesor correcto (id 2)');

// 3. Filtrar cancelaciones por asesor debe regresar solo las suyas
const cancelaciones = porNombre('consultar_cancelaciones');
const filtradas = await cancelaciones.run({ asesor: 'fernando lopez' });
assert.equal(filtradas.total_encontradas, 1);
assert.equal(filtradas.rows[0].noPoliza, 'VI1');
console.log('✓ filtrar cancelaciones por asesor regresa solo la fila correcta, no las 3');

// 4. Sin filtro, regresa todo
const sinFiltro = await cancelaciones.run({});
assert.equal(sinFiltro.total_encontradas, 3);
console.log('✓ sin filtro, regresa el reporte completo');

server.close();
console.log('\n✅ Todas las pruebas pasaron.');
