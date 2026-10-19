// Finanzas de la promotoría: estado de resultados mensual (ingresos, nómina,
// bonos, gastos administrativos, eventos), presupuesto anual vs gasto real y
// resumen del año. Reemplaza al Excel "rentabilidad de la promo".
//
// Datos en server/finanzas.json (aparte de db/promotoria/karen). Rutas
// /api/finanzas/* con el mismo middleware que Promotoría (admin + promotoria):
// ambas cuentas ven todo, incluida la nómina.
//
// Reglas del Excel original que se respetan tal cual:
//   facturas        = ingreso bruto x 6%
//   ingreso neto    = ingreso bruto - renta - facturas
//   gastos totales  = nómina + bonos + gastos administrativos + eventos
//   resultado       = ingreso neto - gastos totales
//   rentabilidad    = resultado / ingreso bruto
// El ingreso bruto se captura hasta el cierre de mes; mientras no exista el
// mes está "abierto" y no se calculan ingreso neto, resultado ni rentabilidad.

const fs = require('fs');

const MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const YM = /^\d{4}-(0[1-9]|1[0-2])$/;

const hoyMexico = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
const sinAcentos = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const r2 = (n) => Math.round(n * 100) / 100;
const suma = (arr, k) => r2((arr || []).reduce((s, x) => s + (Number(x[k]) || 0), 0));

// Importe en pesos: acepta número o texto tipo "$1,250.50". null si no es válido.
const parseMonto = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? r2(v) : null;
  if (typeof v !== 'string') return null;
  const limpio = v.replace(/[$,\s]/g, '');
  if (limpio === '') return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? r2(n) : null;
};

// Definición de las secciones con renglones editables.
//   principal: campo de texto obligatorio · monto: campo de importe
const SECCIONES = {
  nomina: { principal: 'nombre', monto: 'sueldo', extras: [], conFecha: false },
  bonos: { principal: 'nombre', monto: 'monto', extras: [], conFecha: false },
  gastosAdmin: { principal: 'concepto', monto: 'importe', extras: [], conFecha: true },
  eventos: { principal: 'evento', monto: 'importe', extras: ['detalles'], conFecha: true },
};

module.exports = function registrarFinanzas({ app, authMiddleware, promotoriaAccess, upload, xlsx, backupFile, FINANZAS_FILE }) {
  // ======================================
  // Persistencia
  // ======================================
  const defaults = () => ({
    seq: 1000,
    config: { facturasPct: 0.06, rentaDefault: 80993 },
    nomina: [], // plantilla fija de nómina: { id, nombre, sueldo, activo }
    categorias: [], // rubros del presupuesto anual: { id, anio, nombre, detalle, anual }
    meses: {}, // "YYYY-MM" -> mes (ver mesVacio)
    importadoEn: null,
  });

  const load = () => {
    if (fs.existsSync(FINANZAS_FILE)) {
      const base = defaults();
      const guardado = JSON.parse(fs.readFileSync(FINANZAS_FILE, 'utf8'));
      return { ...base, ...guardado, config: { ...base.config, ...(guardado.config || {}) } };
    }
    const d = defaults();
    fs.writeFileSync(FINANZAS_FILE, JSON.stringify(d, null, 2));
    return d;
  };

  let data = load();
  const save = () => fs.writeFileSync(FINANZAS_FILE, JSON.stringify(data, null, 2));
  const nuevoId = () => ++data.seq;

  // ======================================
  // Modelo de mes
  // ======================================
  // nomina === null  -> el mes SIGUE la plantilla (cualquier cambio a la
  //                     plantilla se refleja mientras el mes esté abierto).
  // nomina = [...]   -> el mes tiene su propia nómina (congelada). Se congela
  //                     sola al capturar el ingreso (cierre de mes) o cuando se
  //                     edita un renglón de nómina de ese mes.
  const mesVacio = () => ({
    ingresoBruto: null,
    renta: data.config.rentaDefault,
    facturasPct: data.config.facturasPct,
    nomina: null,
    bonos: [],
    gastosAdmin: [],
    eventos: [],
    notas: '',
  });

  const getMes = (ym) => data.meses[ym] || mesVacio();
  const getMesEscritura = (ym) => {
    if (!data.meses[ym]) data.meses[ym] = mesVacio();
    return data.meses[ym];
  };

  const nominaPlantilla = () =>
    data.nomina.filter((p) => p.activo !== false).map((p) => ({ id: p.id, nombre: p.nombre, sueldo: p.sueldo }));
  const nominaEfectiva = (mes) => mes.nomina || nominaPlantilla();
  // Convierte la nómina de un mes en propia (copia de la plantilla) antes de tocarla.
  const congelarNomina = (mes) => {
    if (!mes.nomina) mes.nomina = nominaPlantilla().map((p) => ({ ...p, id: nuevoId() }));
  };

  const categoriaNombre = (id) => (data.categorias.find((c) => c.id === id) || {}).nombre || null;

  const calcular = (mes) => {
    const nomina = nominaEfectiva(mes);
    const totalNomina = suma(nomina, 'sueldo');
    const totalBonos = suma(mes.bonos, 'monto');
    const totalAdmin = suma(mes.gastosAdmin, 'importe');
    const totalEventos = suma(mes.eventos, 'importe');
    const gastos = r2(totalNomina + totalBonos + totalAdmin + totalEventos);
    const bruto = typeof mes.ingresoBruto === 'number' ? mes.ingresoBruto : null;
    const facturas = bruto === null ? null : r2(bruto * mes.facturasPct);
    const neto = bruto === null ? null : r2(bruto - mes.renta - facturas);
    const resultado = neto === null ? null : r2(neto - gastos);
    const rentabilidad = bruto ? resultado / bruto : null;
    return { nomina, totalNomina, totalBonos, totalAdmin, totalEventos, gastos, bruto, facturas, neto, resultado, rentabilidad };
  };

  const conCategoria = (lineas) => (lineas || []).map((l) => ({ ...l, categoriaNombre: l.categoriaId ? categoriaNombre(l.categoriaId) : null }));

  const detalle = (ym) => {
    const mes = getMes(ym);
    const c = calcular(mes);
    const anio = Number(ym.slice(0, 4));
    return {
      mes: ym,
      anio,
      hoy: hoyMexico(),
      almacenado: !!data.meses[ym],
      abierto: c.bruto === null,
      nominaModo: mes.nomina ? 'propia' : 'plantilla',
      ingreso: { bruto: c.bruto, renta: mes.renta, facturasPct: mes.facturasPct, facturas: c.facturas, neto: c.neto },
      nomina: c.nomina,
      bonos: mes.bonos,
      gastosAdmin: conCategoria(mes.gastosAdmin),
      eventos: conCategoria(mes.eventos),
      totales: { nomina: c.totalNomina, bonos: c.totalBonos, gastosAdmin: c.totalAdmin, eventos: c.totalEventos, gastos: c.gastos },
      resultado: c.resultado,
      rentabilidad: c.rentabilidad,
      notas: mes.notas || '',
      categorias: data.categorias.filter((x) => x.anio === anio),
    };
  };

  // ======================================
  // Validación de renglones
  // ======================================
  const fechaPorDefecto = (ym) => (hoyMexico().startsWith(ym) ? hoyMexico() : `${ym}-01`);

  const resolverCategoria = (body, ym) => {
    if (body.categoriaId !== undefined) {
      if (body.categoriaId === null || body.categoriaId === '') return { id: null };
      const id = Number(body.categoriaId);
      if (!data.categorias.some((c) => c.id === id)) return { error: 'Esa categoría de presupuesto no existe.' };
      return { id };
    }
    if (body.categoria !== undefined) {
      const q = sinAcentos(body.categoria);
      if (!q || q === 'ninguna' || q === 'sin categoria') return { id: null };
      const anio = Number(ym.slice(0, 4));
      const delAnio = data.categorias.filter((c) => c.anio === anio);
      const exacta = delAnio.filter((c) => sinAcentos(c.nombre) === q);
      const coinc = exacta.length ? exacta : delAnio.filter((c) => sinAcentos(c.nombre).includes(q));
      if (coinc.length === 1) return { id: coinc[0].id };
      if (coinc.length === 0) return { error: `No hay una categoría de presupuesto que coincida con "${body.categoria}". Categorías de ${anio}: ${delAnio.map((c) => c.nombre).join('; ') || '(ninguna)'}.` };
      return { error: `"${body.categoria}" coincide con varias categorías: ${coinc.map((c) => c.nombre).join('; ')}. Indica cuál.` };
    }
    return {}; // no se mandó nada
  };

  // parcial=true (edición): solo valida lo que viene en el body.
  const limpiarLinea = (seccion, body, ym, parcial) => {
    const def = SECCIONES[seccion];
    const out = {};
    if (!parcial || body[def.principal] !== undefined) {
      const t = String(body[def.principal] ?? '').trim();
      if (!t) return { error: `Falta "${def.principal}".` };
      out[def.principal] = t;
    }
    if (!parcial || body[def.monto] !== undefined) {
      const m = parseMonto(body[def.monto]);
      if (m === null || m < 0) return { error: `"${def.monto}" debe ser un importe válido (número mayor o igual a 0).` };
      out[def.monto] = m;
    }
    for (const k of def.extras) {
      if (body[k] !== undefined) out[k] = String(body[k] ?? '').trim();
      else if (!parcial) out[k] = '';
    }
    if (def.conFecha) {
      if (body.fecha !== undefined && body.fecha !== null && body.fecha !== '') {
        if (!FECHA_ISO.test(body.fecha)) return { error: 'La fecha debe tener formato YYYY-MM-DD.' };
        if (!body.fecha.startsWith(ym)) return { error: `La fecha ${body.fecha} no pertenece al mes ${ym}. Registra el gasto en el mes que corresponde a su fecha.` };
        out.fecha = body.fecha;
      } else if (!parcial) {
        out.fecha = fechaPorDefecto(ym);
      } else if (body.fecha === null || body.fecha === '') {
        out.fecha = null;
      }
      const cat = resolverCategoria(body, ym);
      if (cat.error) return { error: cat.error };
      if (cat.id !== undefined) out.categoriaId = cat.id;
      else if (!parcial) out.categoriaId = null;
    }
    return { valores: out };
  };

  const seccionValida = (s) => Object.prototype.hasOwnProperty.call(SECCIONES, s);
  const validarYM = (req, res) => {
    if (!YM.test(req.params.ym)) { res.status(400).json({ error: 'El mes debe tener formato YYYY-MM.' }); return false; }
    return true;
  };

  // ======================================
  // Rutas: estado de resultados mensual
  // ======================================
  const acceso = [authMiddleware, promotoriaAccess];

  app.get('/api/finanzas/mes/:ym', ...acceso, (req, res) => {
    if (!validarYM(req, res)) return;
    res.json(detalle(req.params.ym));
  });

  // Ingresos del mes: ingreso bruto (se captura al cierre), renta, % facturas, notas.
  app.put('/api/finanzas/mes/:ym', ...acceso, (req, res) => {
    if (!validarYM(req, res)) return;
    const { ym } = req.params;
    const b = req.body || {};
    const cambios = {};
    if (b.ingresoBruto !== undefined) {
      if (b.ingresoBruto === null || b.ingresoBruto === '') cambios.ingresoBruto = null;
      else {
        const m = parseMonto(b.ingresoBruto);
        if (m === null || m < 0) return res.status(400).json({ error: 'El ingreso bruto debe ser un importe válido.' });
        cambios.ingresoBruto = m;
      }
    }
    if (b.renta !== undefined) {
      const m = parseMonto(b.renta);
      if (m === null || m < 0) return res.status(400).json({ error: 'La renta debe ser un importe válido.' });
      cambios.renta = m;
    }
    if (b.facturasPct !== undefined) {
      let p = Number(b.facturasPct);
      if (!Number.isFinite(p) || p < 0) return res.status(400).json({ error: 'El porcentaje de facturas no es válido.' });
      if (p > 1) p = p / 100; // acepta 6 o 0.06
      if (p > 1) return res.status(400).json({ error: 'El porcentaje de facturas no puede pasar de 100%.' });
      cambios.facturasPct = p;
    }
    if (b.notas !== undefined) cambios.notas = String(b.notas || '');
    const mes = getMesEscritura(ym);
    // Cierre de mes: al capturar el ingreso, la nómina del mes queda congelada
    // para que cambios futuros a la plantilla no alteren un mes ya cerrado.
    if (typeof cambios.ingresoBruto === 'number' && mes.ingresoBruto === null) congelarNomina(mes);
    Object.assign(mes, cambios);
    save();
    res.json({ success: true, mes: detalle(ym) });
  });

  app.post('/api/finanzas/mes/:ym/restablecer-nomina', ...acceso, (req, res) => {
    if (!validarYM(req, res)) return;
    const mes = getMesEscritura(req.params.ym);
    mes.nomina = nominaPlantilla().map((p) => ({ ...p, id: nuevoId() }));
    save();
    res.json({ success: true, mes: detalle(req.params.ym) });
  });

  // Renglones: nomina | bonos | gastosAdmin | eventos
  app.post('/api/finanzas/mes/:ym/:seccion', ...acceso, (req, res) => {
    if (!validarYM(req, res)) return;
    const { ym, seccion } = req.params;
    if (!seccionValida(seccion)) return res.status(404).json({ error: 'Sección desconocida.' });
    const r = limpiarLinea(seccion, req.body || {}, ym, false);
    if (r.error) return res.status(400).json({ error: r.error });
    const mes = getMesEscritura(ym);
    if (seccion === 'nomina') congelarNomina(mes);
    const linea = { id: nuevoId(), ...r.valores };
    mes[seccion].push(linea);
    save();
    res.json({ success: true, linea, mes: detalle(ym) });
  });

  app.put('/api/finanzas/mes/:ym/:seccion/:id', ...acceso, (req, res) => {
    if (!validarYM(req, res)) return;
    const { ym, seccion } = req.params;
    if (!seccionValida(seccion)) return res.status(404).json({ error: 'Sección desconocida.' });
    const id = Number(req.params.id);
    const mes = getMesEscritura(ym);
    if (seccion === 'nomina') {
      // Congelar crea ids nuevos: resolver el renglón por nombre si el mes seguía la plantilla.
      if (!mes.nomina) {
        const orig = nominaPlantilla().find((p) => p.id === id);
        congelarNomina(mes);
        const equivalente = orig && mes.nomina.find((p) => p.nombre === orig.nombre);
        if (equivalente) req.params.id = String(equivalente.id);
      }
    }
    const linea = mes[seccion].find((l) => l.id === Number(req.params.id));
    if (!linea) return res.status(404).json({ error: 'Renglón no encontrado.' });
    const r = limpiarLinea(seccion, req.body || {}, ym, true);
    if (r.error) return res.status(400).json({ error: r.error });
    Object.assign(linea, r.valores);
    save();
    res.json({ success: true, linea, mes: detalle(ym) });
  });

  app.delete('/api/finanzas/mes/:ym/:seccion/:id', ...acceso, (req, res) => {
    if (!validarYM(req, res)) return;
    const { ym, seccion } = req.params;
    if (!seccionValida(seccion)) return res.status(404).json({ error: 'Sección desconocida.' });
    let id = Number(req.params.id);
    const mes = getMesEscritura(ym);
    if (seccion === 'nomina' && !mes.nomina) {
      const orig = nominaPlantilla().find((p) => p.id === id);
      congelarNomina(mes);
      const equivalente = orig && mes.nomina.find((p) => p.nombre === orig.nombre);
      if (equivalente) id = equivalente.id;
    }
    const idx = mes[seccion].findIndex((l) => l.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Renglón no encontrado.' });
    const [borrado] = mes[seccion].splice(idx, 1);
    save();
    res.json({ success: true, eliminado: borrado, mes: detalle(ym) });
  });

  // ======================================
  // Plantilla de nómina (lista fija a la que se le aplican cambios)
  // ======================================
  app.get('/api/finanzas/plantilla-nomina', ...acceso, (req, res) => {
    res.json({ plantilla: data.nomina, total: suma(data.nomina.filter((p) => p.activo !== false), 'sueldo') });
  });

  app.post('/api/finanzas/plantilla-nomina', ...acceso, (req, res) => {
    const nombre = String(req.body?.nombre || '').trim();
    const sueldo = parseMonto(req.body?.sueldo);
    if (!nombre) return res.status(400).json({ error: 'Falta el nombre.' });
    if (sueldo === null || sueldo < 0) return res.status(400).json({ error: 'El sueldo debe ser un importe válido.' });
    if (data.nomina.some((p) => sinAcentos(p.nombre) === sinAcentos(nombre) && p.activo !== false)) {
      return res.status(400).json({ error: `Ya existe "${nombre}" en la plantilla de nómina.` });
    }
    const p = { id: nuevoId(), nombre, sueldo, activo: true };
    data.nomina.push(p);
    save();
    res.json({ success: true, persona: p, plantilla: data.nomina });
  });

  app.put('/api/finanzas/plantilla-nomina/:id', ...acceso, (req, res) => {
    const p = data.nomina.find((x) => x.id === Number(req.params.id));
    if (!p) return res.status(404).json({ error: 'Persona no encontrada en la plantilla.' });
    const b = req.body || {};
    if (b.nombre !== undefined) {
      const n = String(b.nombre).trim();
      if (!n) return res.status(400).json({ error: 'El nombre no puede quedar vacío.' });
      p.nombre = n;
    }
    if (b.sueldo !== undefined) {
      const s = parseMonto(b.sueldo);
      if (s === null || s < 0) return res.status(400).json({ error: 'El sueldo debe ser un importe válido.' });
      p.sueldo = s;
    }
    if (b.activo !== undefined) p.activo = !!b.activo;
    save();
    res.json({ success: true, persona: p, plantilla: data.nomina });
  });

  app.delete('/api/finanzas/plantilla-nomina/:id', ...acceso, (req, res) => {
    const idx = data.nomina.findIndex((x) => x.id === Number(req.params.id));
    if (idx === -1) return res.status(404).json({ error: 'Persona no encontrada en la plantilla.' });
    const [borrada] = data.nomina.splice(idx, 1);
    save();
    res.json({ success: true, eliminada: borrada, plantilla: data.nomina });
  });

  // ======================================
  // Resumen anual
  // ======================================
  app.get('/api/finanzas/resumen', ...acceso, (req, res) => {
    const anio = Number(req.query.anio) || Number(hoyMexico().slice(0, 4));
    const mesActual = hoyMexico().slice(0, 7);
    const meses = [];
    for (let m = 1; m <= 12; m++) {
      const ym = `${anio}-${String(m).padStart(2, '0')}`;
      const futuroSinDatos = !data.meses[ym] && ym > mesActual;
      if (futuroSinDatos) {
        meses.push({ mes: ym, sinDatos: true, abierto: true });
        continue;
      }
      const c = calcular(getMes(ym));
      meses.push({
        mes: ym, sinDatos: false, abierto: c.bruto === null,
        bruto: c.bruto, neto: c.neto, nomina: c.totalNomina, bonos: c.totalBonos,
        gastosAdmin: c.totalAdmin, eventos: c.totalEventos, gastos: c.gastos,
        resultado: c.resultado, rentabilidad: c.rentabilidad,
      });
    }
    const cerrados = meses.filter((m) => !m.sinDatos && !m.abierto);
    const sum = (arr, k) => r2(arr.reduce((s, m) => s + (m[k] || 0), 0));
    const bruto = sum(cerrados, 'bruto');
    const resultado = sum(cerrados, 'resultado');
    res.json({
      anio,
      meses,
      totales: {
        mesesCerrados: cerrados.length,
        bruto, neto: sum(cerrados, 'neto'), gastos: sum(cerrados, 'gastos'), resultado,
        rentabilidad: bruto ? resultado / bruto : null,
        gastosMesesAbiertos: sum(meses.filter((m) => !m.sinDatos && m.abierto), 'gastos'),
      },
    });
  });

  // ======================================
  // Presupuesto vs real
  // ======================================
  const lineasDeAnio = (anio) => {
    const out = [];
    for (const ym of Object.keys(data.meses)) {
      if (!ym.startsWith(`${anio}-`)) continue;
      const mes = data.meses[ym];
      for (const sec of ['gastosAdmin', 'eventos']) for (const l of mes[sec]) out.push({ ym, seccion: sec, ...l });
    }
    return out;
  };

  app.get('/api/finanzas/presupuesto', ...acceso, (req, res) => {
    const anio = Number(req.query.anio) || Number(hoyMexico().slice(0, 4));
    const lineas = lineasDeAnio(anio);
    // Rubros con fuente 'nomina' (ej. "Nómina staff"): su gasto real sale solo
    // de la nómina (sin bonos) de los meses ya pagados (cerrados o ya pasados),
    // porque esos renglones no llevan rubro. El mes en curso, si sigue abierto,
    // todavía no cuenta.
    const mesActual = hoyMexico().slice(0, 7);
    const mesesPagados = Object.keys(data.meses)
      .filter((ym) => ym.startsWith(`${anio}-`) && (ym < mesActual || data.meses[ym].ingresoBruto !== null))
      .sort();
    const realNomina = r2(mesesPagados.reduce((s, ym) => {
      const c = calcular(data.meses[ym]);
      return s + c.totalNomina;
    }, 0));
    const categorias = data.categorias
      .filter((c) => c.anio === anio)
      .map((c) => {
        if (c.fuente === 'nomina') {
          return {
            ...c, real: realNomina, diferencia: r2(c.anual - realNomina),
            porcentaje: c.anual ? realNomina / c.anual : null,
            movimientos: mesesPagados.length, unidadMovimientos: 'meses de nómina',
          };
        }
        const propias = lineas.filter((l) => l.categoriaId === c.id);
        const real = suma(propias, 'importe');
        return {
          ...c, real, diferencia: r2(c.anual - real),
          porcentaje: c.anual ? real / c.anual : null,
          movimientos: propias.length,
        };
      });
    const sinCategoria = lineas.filter((l) => !l.categoriaId);
    const totalPresupuesto = suma(categorias, 'anual');
    const totalCategorizado = suma(categorias, 'real');
    const totalSinCategoria = suma(sinCategoria, 'importe');
    res.json({
      anio, categorias,
      sinCategoria: { real: totalSinCategoria, movimientos: sinCategoria.length },
      totales: {
        presupuesto: totalPresupuesto,
        real: totalCategorizado,
        diferencia: r2(totalPresupuesto - totalCategorizado),
        porcentaje: totalPresupuesto ? totalCategorizado / totalPresupuesto : null,
        realConSinCategoria: r2(totalCategorizado + totalSinCategoria),
      },
    });
  });

  app.post('/api/finanzas/presupuesto/categorias', ...acceso, (req, res) => {
    const b = req.body || {};
    const nombre = String(b.nombre || '').trim();
    const anio = Number(b.anio) || Number(hoyMexico().slice(0, 4));
    const anual = parseMonto(b.anual);
    if (!nombre) return res.status(400).json({ error: 'Falta el nombre del rubro.' });
    if (anual === null || anual < 0) return res.status(400).json({ error: 'El presupuesto anual debe ser un importe válido.' });
    if (data.categorias.some((c) => c.anio === anio && sinAcentos(c.nombre) === sinAcentos(nombre))) {
      return res.status(400).json({ error: `Ya existe el rubro "${nombre}" en ${anio}.` });
    }
    const c = { id: nuevoId(), anio, nombre, detalle: String(b.detalle || '').trim(), anual };
    if (b.fuente === 'nomina') c.fuente = 'nomina';
    data.categorias.push(c);
    save();
    res.json({ success: true, categoria: c });
  });

  app.put('/api/finanzas/presupuesto/categorias/:id', ...acceso, (req, res) => {
    const c = data.categorias.find((x) => x.id === Number(req.params.id));
    if (!c) return res.status(404).json({ error: 'Rubro no encontrado.' });
    const b = req.body || {};
    if (b.nombre !== undefined) {
      const n = String(b.nombre).trim();
      if (!n) return res.status(400).json({ error: 'El nombre no puede quedar vacío.' });
      c.nombre = n;
    }
    if (b.detalle !== undefined) c.detalle = String(b.detalle || '').trim();
    if (b.fuente !== undefined) { if (b.fuente === 'nomina') c.fuente = 'nomina'; else delete c.fuente; }
    if (b.anual !== undefined) {
      const a = parseMonto(b.anual);
      if (a === null || a < 0) return res.status(400).json({ error: 'El presupuesto anual debe ser un importe válido.' });
      c.anual = a;
    }
    save();
    res.json({ success: true, categoria: c });
  });

  app.delete('/api/finanzas/presupuesto/categorias/:id', ...acceso, (req, res) => {
    const id = Number(req.params.id);
    const idx = data.categorias.findIndex((x) => x.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Rubro no encontrado.' });
    const [borrada] = data.categorias.splice(idx, 1);
    // Los gastos que tenían ese rubro se conservan, solo quedan "sin categoría".
    for (const mes of Object.values(data.meses)) {
      for (const sec of ['gastosAdmin', 'eventos']) for (const l of mes[sec]) if (l.categoriaId === id) l.categoriaId = null;
    }
    save();
    res.json({ success: true, eliminada: borrada });
  });

  // ======================================
  // Búsqueda de renglones (todo el año / varios meses) — para filtros y bot
  // ======================================
  app.get('/api/finanzas/lineas', ...acceso, (req, res) => {
    const q = req.query;
    const mesActual = hoyMexico().slice(0, 7);
    const buscar = sinAcentos(q.buscar);
    const catQ = sinAcentos(q.categoria);
    const out = [];
    const yms = new Set(Object.keys(data.meses));
    yms.add(mesActual);
    for (const ym of [...yms].sort().reverse()) {
      if (q.anio && !ym.startsWith(`${q.anio}-`)) continue;
      if (q.mes && ym !== q.mes) continue;
      if (q.desde && ym < q.desde) continue;
      if (q.hasta && ym > q.hasta) continue;
      const mes = getMes(ym);
      const secciones = { nomina: nominaEfectiva(mes), bonos: mes.bonos, gastosAdmin: mes.gastosAdmin, eventos: mes.eventos };
      for (const [sec, lista] of Object.entries(secciones)) {
        if (q.seccion && q.seccion !== sec) continue;
        const def = SECCIONES[sec];
        for (const l of lista) {
          const catNom = l.categoriaId ? categoriaNombre(l.categoriaId) : null;
          const item = {
            mes: ym, seccion: sec, id: l.id,
            concepto: l[def.principal], detalles: l.detalles || '',
            importe: l[def.monto], fecha: l.fecha || null,
            categoriaId: l.categoriaId || null, categoria: catNom,
          };
          if (buscar && !sinAcentos(`${item.concepto} ${item.detalles}`).includes(buscar)) continue;
          if (catQ === 'sin categoria' && item.categoriaId) continue;
          if (catQ && catQ !== 'sin categoria' && !sinAcentos(catNom).includes(catQ)) continue;
          out.push(item);
        }
      }
    }
    res.json({ total: r2(out.reduce((s, x) => s + x.importe, 0)), cantidad: out.length, lineas: out });
  });

  // ======================================
  // Importación inicial desde el Excel "rentabilidad de la promo"
  // ======================================
  // Solo las pestañas de PRESUPUESTO 2026 hacia la derecha (las de 2025 quedan
  // fuera, a petición de Diego). Se usa UNA vez para la carga inicial; después
  // todo se edita en el CRM, así que se niega a correr de nuevo salvo ?forzar=1
  // (reemplaza TODO lo que se haya capturado en el CRM).
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const celda = (r, i) => (r && r[i] !== undefined ? r[i] : '');
  const primerNumero = (r, idxs) => { for (const i of idxs) { const n = num(celda(r, i)); if (n !== null) return n; } return null; };

  const parseMesExcel = (rows) => {
    const A = (i) => sinAcentos(celda(rows[i], 0));
    const buscarFila = (pred, desde = 0) => { for (let i = desde; i < rows.length; i++) if (pred(A(i))) return i; return -1; };
    const out = { ingresoBruto: null, renta: null, nomina: [], bonos: [], gastosAdmin: [], eventos: [] };

    const iBruto = buscarFila((a) => a === 'ingreso bruto');
    if (iBruto >= 0) out.ingresoBruto = num(celda(rows[iBruto], 1));
    const iRenta = buscarFila((a) => a === 'renta');
    if (iRenta >= 0) out.renta = num(celda(rows[iRenta], 1));

    const iNom = buscarFila((a) => a.startsWith('nomina del staff'));
    const fNom = buscarFila((a) => a.startsWith('total nomina'), iNom + 1);
    for (let i = iNom + 1; i < fNom; i++) {
      const nombre = String(celda(rows[i], 0)).trim();
      const sueldo = num(celda(rows[i], 1));
      if (nombre && sinAcentos(nombre) !== 'nombre' && sueldo) out.nomina.push({ nombre, sueldo });
    }
    const iBon = buscarFila((a) => a.startsWith('bonos del staff'));
    const fBon = buscarFila((a) => a.startsWith('total bonos'), iBon + 1);
    for (let i = iBon + 1; i < fBon; i++) {
      const nombre = String(celda(rows[i], 0)).trim();
      const monto = num(celda(rows[i], 1));
      if (nombre && sinAcentos(nombre) !== 'nombre' && monto) out.bonos.push({ nombre, monto });
    }
    const iAdm = buscarFila((a) => a.startsWith('gastos administrativos'));
    const fAdm = buscarFila((a) => a.startsWith('total gastos admin'), iAdm + 1);
    for (let i = iAdm + 1; i < fAdm; i++) {
      const concepto = String(celda(rows[i], 0)).trim();
      const importe = primerNumero(rows[i], [1, 2]);
      if (concepto && sinAcentos(concepto) !== 'categoria' && importe) out.gastosAdmin.push({ concepto, importe });
    }
    const iEv = buscarFila((a) => a === 'eventos');
    const fEv = buscarFila((a) => a.startsWith('total eventos'), iEv + 1);
    for (let i = iEv + 1; i < fEv; i++) {
      const evento = String(celda(rows[i], 0)).trim();
      const importe = primerNumero(rows[i], [2, 1]);
      if (evento && sinAcentos(evento) !== 'evento' && importe) out.eventos.push({ evento, detalles: String(celda(rows[i], 1) || '').trim(), importe });
    }
    return out;
  };

  // Etiquetado automático de renglones históricos contra los rubros del
  // presupuesto. Solo lo que es evidente por el texto; el resto queda "sin
  // categoría" y se puede asignar a mano desde el CRM.
  const claveRubro = (texto, mesNum, seccion) => {
    const t = sinAcentos(texto);
    if (mesNum === 1 && seccion === 'eventos') return 'promo'; // todo enero-eventos = eventos de promo
    if (/golden/.test(t)) return 'golden';
    if (/noche de estrellas/.test(t)) return 'noche';
    if (/evento staff/.test(t)) return 'staff';
    if (/junta|cofee break|coffee break/.test(t)) return 'juntas';
    if (/pastel|regalo/.test(t)) return 'regalos';
    return null;
  };
  const RUBROS = [
    ['golden', /golden/], ['staff', /evento staff|staff/], ['juntas', /juntas/], ['regalos', /regalos/],
    ['posada', /posada/], ['noche', /noche/], ['promo', /evento.* promo|eventos promo/], ['insumos', /insumos/], ['convencion', /convenc/],
  ];

  app.post('/api/finanzas/import', ...acceso, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });
    const limpiar = () => { if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); };
    try {
      if (data.importadoEn && req.query.forzar !== '1') {
        limpiar();
        return res.status(409).json({ error: `Ya se importó un Excel el ${data.importadoEn}. Volver a importar reemplaza TODO lo capturado en el CRM; usa ?forzar=1 si de verdad lo quieres.` });
      }
      const wb = xlsx.readFile(req.file.path);
      const nombres = wb.SheetNames;
      const iPres = nombres.findIndex((n) => sinAcentos(n).startsWith('presupuesto 2026'));
      if (iPres < 0) { limpiar(); return res.status(400).json({ error: 'No encontré la pestaña "PRESUPUESTO 2026".' }); }
      backupFile(FINANZAS_FILE, 'finanzas');
      const nuevo = defaults();
      nuevo.seq = data.seq;
      const nid = () => ++nuevo.seq;
      const filas = (n) => xlsx.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '', raw: true });

      // Presupuesto 2026
      const idsRubro = {};
      const prow = filas(nombres[iPres]);
      for (let i = 0; i < prow.length; i++) {
        const nombre = String(celda(prow[i], 0)).trim();
        const anual = num(celda(prow[i], 2));
        const n = sinAcentos(nombre);
        if (!nombre || anual === null || n === 'total' || n === 'evento') continue;
        const c = { id: nid(), anio: 2026, nombre, detalle: String(celda(prow[i], 1) || '').trim(), anual };
        nuevo.categorias.push(c);
        const r = RUBROS.find(([, re]) => re.test(n));
        if (r && !idsRubro[r[0]]) idsRubro[r[0]] = c.id;
      }

      // Meses (pestañas "<MES> <AÑO>" a la derecha de PRESUPUESTO 2026; MACHOTE no)
      const resumenImport = [];
      let ultimaNomina = null;
      for (const nombreHoja of nombres.slice(iPres + 1)) {
        const m = sinAcentos(nombreHoja).match(/^(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s*(\d{4})/);
        if (!m) continue;
        const mesNum = MESES_ES.indexOf(m[1]) + 1;
        const ym = `${m[2]}-${String(mesNum).padStart(2, '0')}`;
        const p = parseMesExcel(filas(nombreHoja));
        const etiquetar = (texto, seccion) => idsRubro[claveRubro(texto, mesNum, seccion)] || null;
        const mes = {
          ingresoBruto: p.ingresoBruto,
          renta: p.renta ?? nuevo.config.rentaDefault,
          facturasPct: nuevo.config.facturasPct,
          nomina: p.ingresoBruto === null ? null : p.nomina.map((x) => ({ id: nid(), ...x })),
          bonos: p.bonos.map((x) => ({ id: nid(), ...x })),
          gastosAdmin: p.gastosAdmin.map((x) => ({ id: nid(), ...x, fecha: null, categoriaId: etiquetar(x.concepto, 'gastosAdmin') })),
          eventos: p.eventos.map((x) => ({ id: nid(), ...x, fecha: null, categoriaId: etiquetar(`${x.evento} ${x.detalles}`, 'eventos') })),
          notas: '',
        };
        nuevo.meses[ym] = mes;
        ultimaNomina = p.nomina;
        resumenImport.push({ mes: ym, ingresoBruto: p.ingresoBruto, nomina: p.nomina.length, gastosAdmin: p.gastosAdmin.length, eventos: p.eventos.length, bonos: p.bonos.length });
      }
      if (!resumenImport.length) { limpiar(); return res.status(400).json({ error: 'No encontré pestañas de meses después de PRESUPUESTO 2026.' }); }
      // La plantilla de nómina arranca con la del último mes del Excel.
      nuevo.nomina = (ultimaNomina || []).map((x) => ({ id: nid(), nombre: x.nombre, sueldo: x.sueldo, activo: true }));
      nuevo.importadoEn = new Date().toISOString();
      data = nuevo;
      save();
      limpiar();
      res.json({ success: true, meses: resumenImport, rubros: nuevo.categorias.length, plantilla: nuevo.nomina.length });
    } catch (err) {
      limpiar();
      res.status(500).json({ error: 'Error al procesar el archivo: ' + err.message });
    }
  });
};
