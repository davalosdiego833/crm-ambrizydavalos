// Lógica pura de Prospección: etapas comerciales, seguimientos y referenciadores.
// Sin dependencias del servidor para poder probarla con datos sintéticos y, más
// adelante, reutilizarla en la vista consolidada de dirección.

const ETAPAS = [
  'Por contactar',
  'Llamada realizada',
  'Cita inicial agendada',
  'Cita inicial realizada',
  'Cita de cierre',
  'Venta realizada',
  'No interesado',
  'No interesado por el momento'
];

// Avance dentro del embudo. Las etapas "No interesado" no avanzan: el nivel
// de un prospecto sale de lo más lejos que llegó (etapa actual + historial).
const NIVEL = {
  'Por contactar': 0,
  'Llamada realizada': 1,
  'Cita inicial agendada': 2,
  'Cita inicial realizada': 3,
  'Cita de cierre': 4,
  'Venta realizada': 5
};

// Con estas etapas el prospecto ya no tiene un seguimiento pendiente.
// ("No interesado por el momento" sí: es alguien a quien se vuelve a buscar.)
const ETAPAS_CERRADAS = ['Venta realizada', 'No interesado'];

const sinAcentos = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

const normalizarEtapa = (valor) => {
  const v = sinAcentos(valor).replace(/\s+/g, ' ');
  if (!v) return '';
  return ETAPAS.find(e => sinAcentos(e) === v) || '';
};

// Llave para agrupar nombres de referenciadores escritos distinto
// ("Tania Uribe", "tania  uribe", "TANIA URIBÉ").
const llaveReferenciador = (nombre) => sinAcentos(nombre).replace(/\s+/g, ' ');

// Nivel más alto alcanzado por el prospecto (etapa actual + historial).
const nivelAlcanzado = (p) => {
  const etapas = [p.stage, ...((p.stageHistory || []).map(h => h.stage))];
  return etapas.reduce((max, e) => (e in NIVEL ? Math.max(max, NIVEL[e]) : max), 0);
};

// Cambia la etapa y deja registro en el historial (solo si realmente cambia).
const aplicarEtapa = (p, etapa, fecha) => {
  if (!etapa || p.stage === etapa) return false;
  p.stage = etapa;
  if (!Array.isArray(p.stageHistory)) p.stageHistory = [];
  p.stageHistory.push({ stage: etapa, date: fecha || new Date().toISOString() });
  return true;
};

const seguimientoPendiente = (p) =>
  !!p.searchCommitmentDate && !ETAPAS_CERRADAS.includes(p.stage);

const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

const calcularEstadisticas = (prospects, hoy) => {
  const lista = prospects || [];
  const total = lista.length;
  const clasificados = lista.filter(p => p.stage);
  const sinClasificar = total - clasificados.length;

  const porEtapa = ETAPAS.map(etapa => {
    const count = clasificados.filter(p => p.stage === etapa).length;
    return { etapa, count, pct: pct(count, clasificados.length) };
  });

  // El embudo cuenta solo prospectos clasificados: los "Sin clasificar" no
  // sabemos en qué etapa están y distorsionarían las conversiones.
  const niveles = clasificados.map(nivelAlcanzado);
  const alcanzaron = (n) => niveles.filter(x => x >= n).length;
  const contactados = alcanzaron(1);
  const citas = alcanzaron(2);
  const citasRealizadas = alcanzaron(3);
  const cierre = alcanzaron(4);
  const ventas = alcanzaron(5);
  const noInteresados = clasificados.filter(p => p.stage === 'No interesado').length;
  const noInteresadosMomento = clasificados.filter(p => p.stage === 'No interesado por el momento').length;

  const seg = { vencidos: 0, hoy: 0, proximos7: 0 };
  if (hoy) {
    const base = new Date(hoy + 'T00:00:00');
    lista.filter(seguimientoPendiente).forEach(p => {
      const dias = Math.round((new Date(p.searchCommitmentDate + 'T00:00:00') - base) / 86400000);
      if (dias < 0) seg.vencidos++;
      else if (dias === 0) seg.hoy++;
      else if (dias <= 7) seg.proximos7++;
    });
  }

  return {
    total,
    clasificados: clasificados.length,
    sinClasificar,
    porEtapa,
    embudo: { contactados, citas, citasRealizadas, cierre, ventas, noInteresados, noInteresadosMomento },
    conversiones: {
      llamadaACita: pct(citas, contactados),
      citaAVenta: pct(ventas, citas),
      llamadaAVenta: pct(ventas, contactados),
      noInteresado: pct(noInteresados + noInteresadosMomento, clasificados.length)
    },
    seguimientos: seg,
    referenciadores: calcularReferenciadores(lista)
  };
};

// Ranking de referenciadores. Las citas y ventas cuentan lo más lejos que
// llegó cada prospecto referido, aunque después haya pasado a "No interesado".
const calcularReferenciadores = (prospects) => {
  const grupos = new Map();
  (prospects || []).forEach(p => {
    const nombre = String(p.referredBy || '').trim();
    if (!nombre) return;
    const llave = llaveReferenciador(nombre);
    if (!grupos.has(llave)) grupos.set(llave, { variantes: {}, prospectos: 0, citas: 0, ventas: 0, sinClasificar: 0 });
    const g = grupos.get(llave);
    g.variantes[nombre] = (g.variantes[nombre] || 0) + 1;
    g.prospectos++;
    if (!p.stage) {
      g.sinClasificar++;
    } else {
      const n = nivelAlcanzado(p);
      if (n >= 2) g.citas++;
      if (n >= 5) g.ventas++;
    }
  });

  return Array.from(grupos.values())
    .map(g => {
      const nombres = Object.entries(g.variantes).sort((a, b) => b[1] - a[1]);
      return {
        nombre: nombres[0][0],
        variantes: nombres.map(n => n[0]),
        prospectos: g.prospectos,
        citas: g.citas,
        ventas: g.ventas,
        sinClasificar: g.sinClasificar
      };
    })
    .sort((a, b) => b.prospectos - a.prospectos || b.ventas - a.ventas || a.nombre.localeCompare(b.nombre));
};

module.exports = {
  ETAPAS,
  NIVEL,
  ETAPAS_CERRADAS,
  normalizarEtapa,
  llaveReferenciador,
  nivelAlcanzado,
  aplicarEtapa,
  seguimientoPendiente,
  calcularEstadisticas,
  calcularReferenciadores
};
