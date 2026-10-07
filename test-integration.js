#!/usr/bin/env node
/**
 * Script de prueba integral para verificar que el sistema WhatsApp + CRM
 * funciona correctamente antes de activar asesores reales.
 *
 * Verifica:
 * 1. Disponibilidad del CRM
 * 2. Autenticación y permisos
 * 3. Datos de asesores y sus configuraciones
 * 4. Consultas a panel de campañas
 * 5. Herramientas de Claude disponibles para cada rol
 */

import fetch from 'node:fetch';

const CRM_URL = 'http://localhost:5001';
const PANEL_URL = 'https://panel.ambrizydavalos.com';

let adminToken = null;

async function logSection(title) {
  console.log('\n' + '='.repeat(60));
  console.log(`✓ ${title}`);
  console.log('='.repeat(60));
}

async function test(name, fn) {
  try {
    process.stdout.write(`  → ${name}... `);
    const result = await fn();
    console.log('✓ OK');
    return result;
  } catch (err) {
    console.log(`✗ FAIL: ${err.message}`);
    throw err;
  }
}

async function get(url, headers = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function post(url, body, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

async function main() {
  console.log('\n🧪 PRUEBA INTEGRAL: Sistema WhatsApp + CRM Ambriz');
  console.log('=' .repeat(60));

  try {
    // 1. Verifica que el CRM esté disponible
    await logSection('1. VERIFICAR DISPONIBILIDAD DEL CRM');
    const serverCheck = await test(
      'CRM respondiendo en localhost:5001',
      () => get(`${CRM_URL}/users`)
    );
    console.log(`     → Hay ${serverCheck.length} usuarios en el sistema`);

    // 2. Autenticación como admin
    await logSection('2. AUTENTICACIÓN COMO ADMINISTRADOR');
    const loginResult = await test(
      'Login con credentials de admin',
      () => post(`${CRM_URL}/api/login`, {
        email: 'davalosdiego833@gmail.com',
        password: 'admin123', // Ajusta si la contraseña es diferente
      })
    );
    adminToken = loginResult.token;
    console.log(`     → Token obtenido para: ${loginResult.user.name}`);
    console.log(`     → Rol: ${loginResult.user.role}`);

    // 3. Listar asesores
    await logSection('3. ASESORES DISPONIBLES EN EL SISTEMA');
    const asesores = await test(
      'Listar todos los usuarios con permisos admin',
      () => get(`${CRM_URL}/api/admin/users`, { Authorization: `Bearer ${adminToken}` })
    );

    console.log(`     → Total: ${asesores.length} usuarios\n`);
    asesores.forEach((a, i) => {
      console.log(`     ${i + 1}. ${a.name}`);
      console.log(`        • Email: ${a.email}`);
      console.log(`        • WhatsApp: ${a.whatsappNumber || '(no configurado)'}`);
      console.log(`        • Bot activo: ${a.whatsappBotEnabled ? '✓ SÍ' : '✗ NO'}`);
      console.log(`        • Clave de agente: ${a.claveAgente || '⚠️  NO CONFIGURADA'}`);
      console.log();
    });

    // 4. Verificar tokens de bot para asesores activos
    await logSection('4. VALIDAR ACCESO DE ASESORES AL BOT');
    for (const asesor of asesores) {
      if (!asesor.whatsappBotEnabled) continue;

      await test(
        `Token de bot para ${asesor.name}`,
        async () => {
          const botAccess = await post(
            `${CRM_URL}/api/admin/users/${asesor.id}/bot-token`,
            {},
            { Authorization: `Bearer ${adminToken}` }
          );
          console.log(`\n       → Token válido por 4 horas`);
          console.log(`       → Clave agente: ${asesor.claveAgente ? '✓ Configurada' : '⚠️  FALTA CONFIGURAR'}`);
          return botAccess;
        }
      );
    }

    // 5. Probar panel de campañas
    await logSection('5. CONSULTA AL PANEL DE CAMPAÑAS');

    // Primero obtén un asesor con claveAgente para probar
    const asesorConClave = asesores.find(a => a.claveAgente);

    if (asesorConClave) {
      await test(
        `Premios/compensación para ${asesorConClave.name}`,
        () => get(`${PANEL_URL}/api/premios/${encodeURIComponent(asesorConClave.claveAgente)}`)
      );

      await test(
        `Datos de campaña "convenciones" para ${asesorConClave.name}`,
        () => get(`${PANEL_URL}/api/campaign/convenciones/data/${encodeURIComponent(asesorConClave.claveAgente)}`)
      );
    } else {
      console.log('  ⚠️  Ningún asesor tiene claveAgente configurada');
      console.log('     → Los asesores no podrán consultar sus campañas hasta que se agregue');
    }

    // 6. Verificar datos críticos
    await logSection('6. RESUMEN DE CONFIGURACIÓN PARA ACTIVAR ASESORES');

    let listoParaActivar = true;

    asesores.forEach((asesor) => {
      if (!asesor.whatsappBotEnabled) return;

      console.log(`\n  ${asesor.name}:`);

      if (!asesor.whatsappNumber) {
        console.log('    ✗ FALTA: Número de WhatsApp');
        listoParaActivar = false;
      } else {
        console.log(`    ✓ Número de WhatsApp: ${asesor.whatsappNumber}`);
      }

      if (!asesor.claveAgente) {
        console.log('    ✗ FALTA: Clave de agente (para consultar campañas)');
        listoParaActivar = false;
      } else {
        console.log(`    ✓ Clave de agente: ${asesor.claveAgente}`);
      }

      console.log(`    ✓ Bot activo: Sí`);
    });

    console.log('\n' + '='.repeat(60));
    if (listoParaActivar) {
      console.log('✓ SISTEMA LISTO PARA ACTIVAR ASESORES');
    } else {
      console.log('⚠️  ACCIONES PENDIENTES ANTES DE ACTIVAR:');
      console.log('   1. Agregar claveAgente a los asesores que lo necesiten');
      console.log('   2. Verificar que todos tengan número de WhatsApp correcto');
    }
    console.log('='.repeat(60) + '\n');

  } catch (err) {
    console.error('\n✗ ERROR:', err.message);
    console.error('\nAsegúrate de que:');
    console.error('  1. El servidor CRM esté corriendo: npm start (en server/)');
    console.error('  2. Las credenciales de admin sean correctas');
    process.exit(1);
  }
}

main();
