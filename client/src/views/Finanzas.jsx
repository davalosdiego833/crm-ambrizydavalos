import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// Finanzas de la promotoría: estado de resultados mensual, presupuesto vs real
// y resumen anual. Los números (facturas, neto, resultado, rentabilidad) los
// calcula el servidor — aquí solo se muestran y se capturan los datos.

const useAuth = () => {
  const token = localStorage.getItem('crm_token');
  const authFetch = (url, options = {}) =>
    fetch(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` } });
  return { authFetch };
};

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const fmtMoney = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const money = (n) => (typeof n === 'number' ? fmtMoney.format(n) : '—');
const pct = (f) => (typeof f === 'number' ? `${(f * 100).toFixed(1)}%` : '—');
const ym = (anio, mes1a12) => `${anio}-${String(mes1a12).padStart(2, '0')}`;
const localDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fechaCorta = (f) => {
  if (!f || !/^\d{4}-\d{2}-\d{2}$/.test(f)) return '—';
  const [, m, d] = f.split('-');
  return `${parseInt(d, 10)} ${MESES_CORTO[parseInt(m, 10) - 1]}`;
};

const COLOR_NEG = '#dc2626';
const COLOR_POS = 'var(--accent-mint)';
const colorDe = (n) => (typeof n !== 'number' ? 'var(--text-dim)' : n < 0 ? COLOR_NEG : COLOR_POS);

const inputStyle = {
  width: '100%', padding: '10px 12px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '10px',
  color: '#0f172a', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box',
};
const labelStyle = { fontSize: '0.8rem', color: '#334155', marginBottom: '8px', display: 'block', fontWeight: '500' };
const thBase = { padding: '12px 20px', color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'left', fontWeight: '600', whiteSpace: 'nowrap' };
const tdBase = { padding: '12px 20px', fontSize: '0.88rem' };
const th = thBase;
const td = tdBase;
const num = { textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
const linkBtn = (color) => ({ background: 'none', border: 'none', color, fontSize: '0.78rem', cursor: 'pointer', fontWeight: '700', padding: '2px 6px' });
const ghostBtn = {
  padding: '8px 16px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer',
  border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--text-muted)',
};
const pill = (active) => ({
  padding: '8px 16px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer',
  border: active ? '1px solid var(--accent-gold)' : '1px solid var(--glass-border)',
  background: active ? 'rgba(37,99,235,0.12)' : 'transparent',
  color: active ? 'var(--accent-gold)' : 'var(--text-muted)',
});

const ModalShell = ({ title, onClose, children, maxWidth = '520px' }) => createPortal(
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(6px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 3000, padding: '20px' }}>
    <div className="glass-card animate-up" style={{ width: '100%', maxWidth, padding: '32px', position: 'relative', border: '1px solid #cbd5e1', background: '#ffffff', color: '#0f172a', boxShadow: '0 20px 40px rgba(15,23,42,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
      <button onClick={onClose} style={{ position: 'absolute', top: '16px', right: '16px', background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#0f172a', fontSize: '1.1rem', cursor: 'pointer', width: '36px', height: '36px', borderRadius: '50%', fontWeight: 'bold' }}>×</button>
      <h2 className="text-gradient-gold" style={{ fontSize: '1.4rem', marginBottom: '22px' }}>{title}</h2>
      {children}
    </div>
  </div>,
  document.body
);

const ModalButtons = ({ onCancel, submitLabel }) => (
  <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
    <button type="button" onClick={onCancel} style={{ padding: '12px 24px', borderRadius: '10px', background: '#f1f5f9', color: '#0f172a', border: '1px solid #cbd5e1', cursor: 'pointer', fontWeight: '600' }}>Cancelar</button>
    <button type="submit" className="btn-primary">{submitLabel}</button>
  </div>
);

// Definición de las secciones con renglones (campo principal, de importe, etc.)
const SECCIONES = {
  nomina: { titulo: 'Nómina del staff', principal: 'nombre', etiquetaPrincipal: 'Nombre', monto: 'sueldo', etiquetaMonto: 'Sueldo', conFecha: false, conDetalles: false },
  bonos: { titulo: 'Bonos del staff', principal: 'nombre', etiquetaPrincipal: 'Nombre', monto: 'monto', etiquetaMonto: 'Monto del bono', conFecha: false, conDetalles: false },
  gastosAdmin: { titulo: 'Gastos administrativos', principal: 'concepto', etiquetaPrincipal: 'Concepto', monto: 'importe', etiquetaMonto: 'Importe', conFecha: true, conDetalles: false },
  eventos: { titulo: 'Eventos', principal: 'evento', etiquetaPrincipal: 'Evento', monto: 'importe', etiquetaMonto: 'Importe', conFecha: true, conDetalles: true },
};

// ======================================
// Modal: alta / edición de un renglón
// ======================================
const LineaModal = ({ seccion, mes, categorias, nominaNombres, linea, onClose, onSave }) => {
  const def = SECCIONES[seccion];
  const [anio, m] = mes.split('-').map(Number);
  const ultimoDia = new Date(anio, m, 0).getDate();
  const hoy = localDateStr(new Date());
  const [form, setForm] = useState({
    principal: linea ? linea[def.principal] : '',
    monto: linea ? linea[def.monto] : '',
    detalles: linea?.detalles || '',
    fecha: linea ? (linea.fecha || '') : (hoy.startsWith(mes) ? hoy : `${mes}-01`),
    categoriaId: linea?.categoriaId ? String(linea.categoriaId) : '',
  });
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const submit = (e) => {
    e.preventDefault();
    if (!String(form.principal).trim()) return alert(`${def.etiquetaPrincipal} es obligatorio`);
    if (form.monto === '' || Number(form.monto) < 0) return alert('Captura un importe válido');
    const body = { [def.principal]: form.principal, [def.monto]: Number(form.monto) };
    if (def.conDetalles) body.detalles = form.detalles;
    if (def.conFecha) {
      body.fecha = form.fecha || null;
      body.categoriaId = form.categoriaId ? Number(form.categoriaId) : null;
    }
    onSave(body, linea ? linea.id : null);
  };

  return (
    <ModalShell title={`${linea ? 'Editar' : 'Agregar'} · ${def.titulo}`} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <label style={labelStyle}>{def.etiquetaPrincipal} *</label>
          {def.principal === 'nombre' && nominaNombres.length > 0 ? (
            <>
              <input style={inputStyle} list="finanzas-nombres" value={form.principal} onChange={(e) => set('principal', e.target.value)} required />
              <datalist id="finanzas-nombres">{nominaNombres.map((n) => <option key={n} value={n} />)}</datalist>
            </>
          ) : (
            <input style={inputStyle} value={form.principal} onChange={(e) => set('principal', e.target.value)} required autoFocus />
          )}
        </div>
        {def.conDetalles && (
          <div>
            <label style={labelStyle}>Detalles (proveedor, lugar...)</label>
            <input style={inputStyle} value={form.detalles} onChange={(e) => set('detalles', e.target.value)} />
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: def.conFecha ? '1fr 1fr' : '1fr', gap: '16px' }}>
          <div>
            <label style={labelStyle}>{def.etiquetaMonto} *</label>
            <input type="number" step="0.01" min="0" inputMode="decimal" style={inputStyle} value={form.monto} onChange={(e) => set('monto', e.target.value)} required />
          </div>
          {def.conFecha && (
            <div>
              <label style={labelStyle}>Fecha</label>
              <input type="date" style={inputStyle} min={`${mes}-01`} max={`${mes}-${String(ultimoDia).padStart(2, '0')}`} value={form.fecha} onChange={(e) => set('fecha', e.target.value)} />
            </div>
          )}
        </div>
        {def.conFecha && (
          <div>
            <label style={labelStyle}>Rubro del presupuesto</label>
            <select style={inputStyle} value={form.categoriaId} onChange={(e) => set('categoriaId', e.target.value)}>
              <option value="">Sin rubro</option>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '6px 0 0' }}>El rubro hace que este gasto cuente en "Presupuesto vs real".</p>
          </div>
        )}
        <ModalButtons onCancel={onClose} submitLabel={linea ? 'Guardar cambios' : 'Agregar'} />
      </form>
    </ModalShell>
  );
};

// ======================================
// Modal: ingresos del mes
// ======================================
const IngresosModal = ({ d, onClose, onSave }) => {
  const [form, setForm] = useState({
    ingresoBruto: d.ingreso.bruto ?? '',
    renta: d.ingreso.renta ?? '',
    facturasPct: d.ingreso.facturasPct != null ? +(d.ingreso.facturasPct * 100).toFixed(2) : 6,
    notas: d.notas || '',
  });
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const brutoNum = form.ingresoBruto === '' ? null : Number(form.ingresoBruto);
  const facturas = brutoNum === null ? null : brutoNum * (Number(form.facturasPct) / 100);
  const neto = brutoNum === null ? null : brutoNum - Number(form.renta || 0) - facturas;

  const submit = (e) => {
    e.preventDefault();
    onSave({
      ingresoBruto: form.ingresoBruto === '' ? null : Number(form.ingresoBruto),
      renta: Number(form.renta || 0),
      facturasPct: Number(form.facturasPct) / 100,
      notas: form.notas,
    });
  };

  return (
    <ModalShell title={`Ingresos de ${MESES[Number(d.mes.slice(5)) - 1]} ${d.anio}`} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <label style={labelStyle}>Ingreso bruto del mes</label>
          <input type="number" step="0.01" min="0" inputMode="decimal" style={inputStyle} value={form.ingresoBruto} onChange={(e) => set('ingresoBruto', e.target.value)} autoFocus />
          <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '6px 0 0' }}>
            Se captura al cierre de mes. Al guardarlo, el mes se cierra y su nómina queda congelada. Déjalo vacío para mantener el mes abierto.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={labelStyle}>Renta</label>
            <input type="number" step="0.01" min="0" inputMode="decimal" style={inputStyle} value={form.renta} onChange={(e) => set('renta', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Facturas (% del bruto)</label>
            <input type="number" step="0.01" min="0" max="100" inputMode="decimal" style={inputStyle} value={form.facturasPct} onChange={(e) => set('facturasPct', e.target.value)} />
          </div>
        </div>
        <div style={{ background: '#f1f5f9', borderRadius: '10px', padding: '12px 16px', fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between' }}>
          <span>Facturas: <strong>{money(facturas)}</strong></span>
          <span>Ingreso neto: <strong>{money(neto)}</strong></span>
        </div>
        <div>
          <label style={labelStyle}>Notas del mes</label>
          <textarea style={{ ...inputStyle, minHeight: '70px', resize: 'vertical' }} value={form.notas} onChange={(e) => set('notas', e.target.value)} />
        </div>
        <ModalButtons onCancel={onClose} submitLabel="Guardar" />
      </form>
    </ModalShell>
  );
};

// ======================================
// Modal: plantilla fija de nómina
// ======================================
const PlantillaModal = ({ call, onClose }) => {
  const [plantilla, setPlantilla] = useState(null);
  const [nuevo, setNuevo] = useState({ nombre: '', sueldo: '' });
  const [editSueldo, setEditSueldo] = useState({});

  const cargar = async () => {
    const r = await call('GET', '/api/finanzas/plantilla-nomina');
    if (r) setPlantilla(r.plantilla);
  };
  useEffect(() => { cargar(); }, []);

  const actualizar = async (id, body) => {
    const r = await call('PUT', `/api/finanzas/plantilla-nomina/${id}`, body);
    if (r) { setPlantilla(r.plantilla); setEditSueldo((p) => { const c = { ...p }; delete c[id]; return c; }); }
  };
  const agregar = async (e) => {
    e.preventDefault();
    if (!nuevo.nombre.trim() || nuevo.sueldo === '') return alert('Captura nombre y sueldo');
    const r = await call('POST', '/api/finanzas/plantilla-nomina', { nombre: nuevo.nombre, sueldo: Number(nuevo.sueldo) });
    if (r) { setPlantilla(r.plantilla); setNuevo({ nombre: '', sueldo: '' }); }
  };
  const eliminar = async (p) => {
    if (!window.confirm(`¿Quitar a ${p.nombre} de la plantilla? Si solo dejó de trabajar, mejor usa "Dar de baja".`)) return;
    const r = await call('DELETE', `/api/finanzas/plantilla-nomina/${p.id}`);
    if (r) setPlantilla(r.plantilla);
  };

  const total = (plantilla || []).filter((p) => p.activo !== false).reduce((s, p) => s + p.sueldo, 0);

  return (
    <ModalShell title="Plantilla de nómina" onClose={onClose} maxWidth="640px">
      <p style={{ fontSize: '0.82rem', color: '#475569', marginTop: '-10px', marginBottom: '18px' }}>
        Lista fija que se repite cada mes. Los cambios aplican a los meses <strong>abiertos</strong> (sin ingreso capturado); los meses cerrados conservan la nómina con la que se cerraron.
      </p>
      {!plantilla ? <p>Cargando...</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
          {plantilla.map((p) => (
            <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr 130px auto', gap: '10px', alignItems: 'center', padding: '8px 12px', borderRadius: '10px', background: p.activo === false ? '#f1f5f9' : '#ffffff', border: '1px solid #e2e8f0', opacity: p.activo === false ? 0.6 : 1 }}>
              <span style={{ fontWeight: '700', fontSize: '0.88rem' }}>{p.nombre}{p.activo === false && <span style={{ fontWeight: '500', color: '#64748b' }}> · de baja</span>}</span>
              <input
                type="number" step="0.01" min="0" style={{ ...inputStyle, padding: '6px 10px' }}
                value={editSueldo[p.id] ?? p.sueldo}
                onChange={(e) => setEditSueldo((prev) => ({ ...prev, [p.id]: e.target.value }))}
                onBlur={() => editSueldo[p.id] !== undefined && Number(editSueldo[p.id]) !== p.sueldo && editSueldo[p.id] !== '' && actualizar(p.id, { sueldo: Number(editSueldo[p.id]) })}
              />
              <div style={{ display: 'flex', gap: '4px' }}>
                <button onClick={() => actualizar(p.id, { activo: p.activo === false })} style={linkBtn('#2563eb')}>{p.activo === false ? 'Dar de alta' : 'Dar de baja'}</button>
                <button onClick={() => eliminar(p)} style={linkBtn('#dc2626')}>Quitar</button>
              </div>
            </div>
          ))}
          <div style={{ textAlign: 'right', fontSize: '0.85rem', paddingTop: '6px' }}>Nómina mensual activa: <strong>{money(total)}</strong></div>
        </div>
      )}
      <form onSubmit={agregar} style={{ display: 'grid', gridTemplateColumns: '1fr 130px auto', gap: '10px', alignItems: 'end' }}>
        <div>
          <label style={labelStyle}>Agregar persona</label>
          <input style={inputStyle} placeholder="Nombre" value={nuevo.nombre} onChange={(e) => setNuevo((p) => ({ ...p, nombre: e.target.value }))} />
        </div>
        <div>
          <label style={labelStyle}>Sueldo</label>
          <input type="number" step="0.01" min="0" style={inputStyle} value={nuevo.sueldo} onChange={(e) => setNuevo((p) => ({ ...p, sueldo: e.target.value }))} />
        </div>
        <button type="submit" className="btn-primary" style={{ padding: '10px 18px' }}>Agregar</button>
      </form>
    </ModalShell>
  );
};

// ======================================
// Vista: estado de resultados del mes
// ======================================
const SECCION_FILTROS = [
  { id: 'todo', label: 'Todo' },
  { id: 'ingresos', label: 'Ingresos' },
  { id: 'nomina', label: 'Nómina' },
  { id: 'bonos', label: 'Bonos' },
  { id: 'gastosAdmin', label: 'Gastos admin.' },
  { id: 'eventos', label: 'Eventos' },
];

const Kpi = ({ titulo, valor, color, nota }) => (
  <div className="glass-card" style={{ padding: '18px 20px' }}>
    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>{titulo}</div>
    <div style={{ fontSize: '1.45rem', fontWeight: '800', marginTop: '6px', color: color || 'var(--text-main)', fontVariantNumeric: 'tabular-nums' }}>{valor}</div>
    {nota && <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '4px' }}>{nota}</div>}
  </div>
);

const EstadoResultados = ({ call, anio, mes, setMes }) => {
  const [d, setD] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [seccionF, setSeccionF] = useState('todo');
  const [buscar, setBuscar] = useState('');
  const [rubroF, setRubroF] = useState('todos');
  const [modal, setModal] = useState(null); // { tipo: 'linea', seccion, linea } | { tipo: 'ingresos' } | { tipo: 'plantilla' }

  const cargar = async () => {
    setCargando(true);
    const r = await call('GET', `/api/finanzas/mes/${mes}`);
    if (r) setD(r);
    setCargando(false);
  };
  useEffect(() => { cargar(); }, [mes]);

  const guardarLinea = async (body, id) => {
    const { seccion } = modal;
    const r = id
      ? await call('PUT', `/api/finanzas/mes/${mes}/${seccion}/${id}`, body)
      : await call('POST', `/api/finanzas/mes/${mes}/${seccion}`, body);
    if (r) { setD(r.mes); setModal(null); }
  };
  const eliminarLinea = async (seccion, l) => {
    if (!window.confirm(`¿Eliminar "${l[SECCIONES[seccion].principal]}" (${money(l[SECCIONES[seccion].monto])})? No se puede deshacer.`)) return;
    const r = await call('DELETE', `/api/finanzas/mes/${mes}/${seccion}/${l.id}`);
    if (r) setD(r.mes);
  };
  const guardarIngresos = async (body) => {
    const r = await call('PUT', `/api/finanzas/mes/${mes}`, body);
    if (r) { setD(r.mes); setModal(null); }
  };
  const restablecerNomina = async () => {
    if (!window.confirm('¿Reemplazar la nómina de este mes con la plantilla actual? Se pierden los ajustes propios de este mes.')) return;
    const r = await call('POST', `/api/finanzas/mes/${mes}/restablecer-nomina`);
    if (r) setD(r.mes);
  };

  if (!d) return <p style={{ color: 'var(--text-dim)' }}>{cargando ? 'Cargando...' : 'No se pudo cargar el mes.'}</p>;

  const filtrosActivos = seccionF !== 'todo' || buscar.trim() !== '' || rubroF !== 'todos';
  const q = buscar.trim().toLowerCase();
  const pasaTexto = (seccion, l) => !q || `${l[SECCIONES[seccion].principal]} ${l.detalles || ''}`.toLowerCase().includes(q);
  const pasaRubro = (seccion, l) => {
    if (rubroF === 'todos') return true;
    if (!SECCIONES[seccion].conFecha) return false; // nómina y bonos no tienen rubro
    if (rubroF === 'sin') return !l.categoriaId;
    return String(l.categoriaId) === rubroF;
  };
  const mostrarSeccion = (s) => seccionF === 'todo' || seccionF === s;
  const lineasVisibles = (seccion) => (d[seccion] || []).filter((l) => pasaTexto(seccion, l) && pasaRubro(seccion, l));
  const mostrarIngresos = (seccionF === 'todo' || seccionF === 'ingresos') && !q && rubroF === 'todos';

  const mesNombre = `${MESES[Number(mes.slice(5)) - 1]} ${d.anio}`;
  const t = d.totales;

  const TablaSeccion = ({ seccion, acciones }) => {
    const def = SECCIONES[seccion];
    const visibles = lineasVisibles(seccion);
    const totalVisible = visibles.reduce((s, l) => s + l[def.monto], 0);
    const total = t[seccion];
    return (
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden', marginBottom: '20px' }}>
        <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', borderBottom: '1px solid var(--glass-border)' }}>
          <div>
            <h3 style={{ fontSize: '1rem', margin: 0 }}>{def.titulo}</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Total del mes: <strong style={{ color: 'var(--text-main)' }}>{money(total)}</strong></span>
            {seccion === 'nomina' && (
              <span style={{ marginLeft: '10px', fontSize: '0.7rem', padding: '2px 8px', borderRadius: '12px', background: 'rgba(37,99,235,0.1)', color: 'var(--accent-gold)', fontWeight: '600' }}>
                {d.nominaModo === 'plantilla' ? 'Sigue la plantilla' : 'Nómina propia del mes'}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {acciones}
            <button onClick={() => setModal({ tipo: 'linea', seccion, linea: null })} className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.8rem' }}>+ Agregar</button>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                {def.conFecha && <th style={th}>Fecha</th>}
                <th style={th}>{def.etiquetaPrincipal}</th>
                {def.conDetalles && <th style={th}>Detalles</th>}
                {def.conFecha && <th style={th}>Rubro</th>}
                <th style={{ ...th, textAlign: 'right' }}>{def.etiquetaMonto}</th>
                <th style={{ ...th, textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibles.length === 0 ? (
                <tr><td colSpan="6" style={{ ...td, textAlign: 'center', color: 'var(--text-dim)', padding: '28px' }}>
                  {(d[seccion] || []).length === 0 ? 'Sin renglones este mes.' : 'Ningún renglón coincide con los filtros.'}
                </td></tr>
              ) : visibles.map((l) => (
                <tr key={l.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  {def.conFecha && <td style={{ ...td, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{fechaCorta(l.fecha)}</td>}
                  <td style={{ ...td, fontWeight: '600' }}>{l[def.principal]}</td>
                  {def.conDetalles && <td style={{ ...td, color: 'var(--text-muted)' }}>{l.detalles || '—'}</td>}
                  {def.conFecha && (
                    <td style={td}>
                      {l.categoriaNombre
                        ? <span style={{ fontSize: '0.75rem', padding: '2px 10px', borderRadius: '12px', background: 'rgba(37,99,235,0.1)', color: 'var(--accent-gold)', fontWeight: '600' }}>{l.categoriaNombre}</span>
                        : <span style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>Sin rubro</span>}
                    </td>
                  )}
                  <td style={{ ...td, ...num, fontWeight: '700' }}>{money(l[def.monto])}</td>
                  <td style={{ ...td, textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <button onClick={() => setModal({ tipo: 'linea', seccion, linea: l })} style={linkBtn('var(--accent-gold)')}>Editar</button>
                    <button onClick={() => eliminarLinea(seccion, l)} style={linkBtn('#dc2626')}>Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
            {filtrosActivos && visibles.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={def.conFecha ? (def.conDetalles ? 4 : 3) : 1} style={{ ...td, color: 'var(--text-dim)', fontSize: '0.78rem' }}>Filtrado: {visibles.length} de {(d[seccion] || []).length} renglones</td>
                  <td style={{ ...td, ...num, fontWeight: '800' }}>{money(totalVisible)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* Meses del año */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
        {MESES_CORTO.map((nombre, i) => {
          const val = ym(anio, i + 1);
          return <button key={val} onClick={() => setMes(val)} style={pill(mes === val)}>{nombre}</button>;
        })}
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <Kpi titulo="Ingreso bruto" valor={d.abierto ? 'Pendiente' : money(d.ingreso.bruto)} nota={d.abierto ? 'Se captura al cierre de mes' : null} color={d.abierto ? 'var(--text-dim)' : null} />
        <Kpi titulo="Ingreso neto" valor={money(d.ingreso.neto)} nota="Bruto - renta - facturas" />
        <Kpi titulo="Gastos totales" valor={money(t.gastos)} nota="Nómina + bonos + admin + eventos" />
        <Kpi titulo="Resultado" valor={money(d.resultado)} color={colorDe(d.resultado)} />
        <Kpi titulo="Rentabilidad" valor={pct(d.rentabilidad)} color={colorDe(d.rentabilidad)} />
      </div>

      {d.abierto && (
        <div className="glass-card" style={{ padding: '14px 20px', marginBottom: '20px', borderLeft: '4px solid var(--accent-gold)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <span style={{ fontSize: '0.88rem' }}>
            <strong>{mesNombre} está abierto.</strong> Los gastos se van acumulando; el ingreso neto, el resultado y la rentabilidad se calculan en cuanto captures el ingreso bruto.
          </span>
          <button onClick={() => setModal({ tipo: 'ingresos' })} className="btn-primary" style={{ padding: '8px 18px', fontSize: '0.8rem' }}>Capturar ingreso</button>
        </div>
      )}

      {/* Filtros */}
      <div className="glass-card" style={{ padding: '16px 20px', marginBottom: '20px', display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {SECCION_FILTROS.map((f) => <button key={f.id} onClick={() => setSeccionF(f.id)} style={pill(seccionF === f.id)}>{f.label}</button>)}
        </div>
        <input
          type="text" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar concepto o detalle..."
          style={{ padding: '9px 14px', borderRadius: '8px', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', outline: 'none', minWidth: '210px' }}
        />
        <select value={rubroF} onChange={(e) => setRubroF(e.target.value)} style={{ padding: '9px 12px', borderRadius: '8px', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', outline: 'none' }}>
          <option value="todos">Todos los rubros</option>
          <option value="sin">Sin rubro</option>
          {d.categorias.map((c) => <option key={c.id} value={String(c.id)}>{c.nombre}</option>)}
        </select>
        {filtrosActivos && (
          <button onClick={() => { setSeccionF('todo'); setBuscar(''); setRubroF('todos'); }} style={ghostBtn}>Limpiar filtros</button>
        )}
      </div>

      {/* Ingresos */}
      {mostrarIngresos && (
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden', marginBottom: '20px' }}>
          <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-border)' }}>
            <h3 style={{ fontSize: '1rem', margin: 0 }}>Ingresos del mes</h3>
            <button onClick={() => setModal({ tipo: 'ingresos' })} className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.8rem' }}>{d.abierto ? 'Capturar ingreso' : 'Editar ingresos'}</button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {[
                ['Ingreso bruto', d.abierto ? 'Pendiente' : money(d.ingreso.bruto), true],
                ['(-) Renta', money(d.ingreso.renta)],
                [`(-) Facturas (${(d.ingreso.facturasPct * 100).toFixed(d.ingreso.facturasPct * 100 % 1 ? 2 : 0)}% del bruto)`, money(d.ingreso.facturas)],
                ['Ingreso neto', money(d.ingreso.neto), true],
              ].map(([k, v, fuerte]) => (
                <tr key={k} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <td style={{ ...td, fontWeight: fuerte ? '700' : '500', color: fuerte ? 'var(--text-main)' : 'var(--text-muted)' }}>{k}</td>
                  <td style={{ ...td, ...num, fontWeight: fuerte ? '800' : '600' }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {d.notas && <p style={{ padding: '12px 20px', margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}><strong>Notas:</strong> {d.notas}</p>}
        </div>
      )}

      {mostrarSeccion('nomina') && (
        <TablaSeccion
          seccion="nomina"
          acciones={(
            <>
              <button onClick={() => setModal({ tipo: 'plantilla' })} style={ghostBtn}>Plantilla de nómina</button>
              {d.nominaModo === 'propia' && <button onClick={restablecerNomina} style={ghostBtn}>Restablecer desde plantilla</button>}
            </>
          )}
        />
      )}
      {mostrarSeccion('bonos') && <TablaSeccion seccion="bonos" />}
      {mostrarSeccion('gastosAdmin') && <TablaSeccion seccion="gastosAdmin" />}
      {mostrarSeccion('eventos') && <TablaSeccion seccion="eventos" />}

      {/* Resumen final */}
      {seccionF === 'todo' && !filtrosActivos && (
        <div className="glass-card" style={{ padding: '20px 24px' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '14px' }}>Resumen final · {mesNombre}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px 40px', fontSize: '0.9rem' }}>
            {[
              ['Ingreso neto', money(d.ingreso.neto)],
              ['Nómina', money(t.nomina)],
              ['Bonos', money(t.bonos)],
              ['Gastos administrativos', money(t.gastosAdmin)],
              ['Eventos', money(t.eventos)],
              ['Total gastos', money(t.gastos)],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed var(--glass-border)', padding: '6px 0' }}>
                <span style={{ color: 'var(--text-muted)' }}>{k}</span><strong style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</strong>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
              <strong>Resultado</strong><strong style={{ color: colorDe(d.resultado), fontVariantNumeric: 'tabular-nums' }}>{money(d.resultado)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
              <strong>Rentabilidad</strong><strong style={{ color: colorDe(d.rentabilidad) }}>{pct(d.rentabilidad)}</strong>
            </div>
          </div>
        </div>
      )}

      {modal?.tipo === 'linea' && (
        <LineaModal
          seccion={modal.seccion} mes={mes} categorias={d.categorias} linea={modal.linea}
          nominaNombres={d.nomina.map((p) => p.nombre)}
          onClose={() => setModal(null)} onSave={guardarLinea}
        />
      )}
      {modal?.tipo === 'ingresos' && <IngresosModal d={d} onClose={() => setModal(null)} onSave={guardarIngresos} />}
      {modal?.tipo === 'plantilla' && <PlantillaModal call={call} onClose={() => { setModal(null); cargar(); }} />}
    </div>
  );
};

// ======================================
// Vista: presupuesto vs real
// ======================================
const PresupuestoView = ({ call, anio }) => {
  const [p, setP] = useState(null);
  const [modal, setModal] = useState(null); // { cat } (cat null = nuevo)
  const [form, setForm] = useState({ nombre: '', detalle: '', anual: '' });

  const cargar = async () => {
    const r = await call('GET', `/api/finanzas/presupuesto?anio=${anio}`);
    if (r) setP(r);
  };
  useEffect(() => { cargar(); }, [anio]);

  const abrir = (cat) => {
    setForm(cat ? { nombre: cat.nombre, detalle: cat.detalle || '', anual: cat.anual } : { nombre: '', detalle: '', anual: '' });
    setModal({ cat });
  };
  const guardar = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim() || form.anual === '') return alert('Captura el nombre y el presupuesto anual');
    const body = { nombre: form.nombre, detalle: form.detalle, anual: Number(form.anual) };
    const r = modal.cat
      ? await call('PUT', `/api/finanzas/presupuesto/categorias/${modal.cat.id}`, body)
      : await call('POST', '/api/finanzas/presupuesto/categorias', { ...body, anio });
    if (r) { setModal(null); cargar(); }
  };
  const eliminar = async (c) => {
    if (!window.confirm(`¿Eliminar el rubro "${c.nombre}"? Los gastos que lo tenían se conservan, solo quedan sin rubro.`)) return;
    const r = await call('DELETE', `/api/finanzas/presupuesto/categorias/${c.id}`);
    if (r) cargar();
  };

  if (!p) return <p style={{ color: 'var(--text-dim)' }}>Cargando...</p>;

  const barra = (f) => {
    if (typeof f !== 'number') return null;
    const w = Math.min(f, 1) * 100;
    const color = f > 1 ? COLOR_NEG : f >= 0.85 ? '#d97706' : 'var(--accent-mint)';
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '150px' }}>
        <div style={{ flex: 1, height: '8px', borderRadius: '4px', background: 'rgba(100,116,139,0.18)', overflow: 'hidden' }}>
          <div style={{ width: `${w}%`, height: '100%', background: color }} />
        </div>
        <span style={{ fontSize: '0.78rem', fontWeight: '700', color, width: '48px', textAlign: 'right' }}>{pct(f)}</span>
      </div>
    );
  };

  return (
    <div>
      <div className="glass-card" style={{ padding: '14px 20px', marginBottom: '20px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
        El gasto real se suma solo de los gastos administrativos y eventos que tengan asignado un rubro. Los que no tienen rubro aparecen abajo como "Sin rubro".
      </div>
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-border)' }}>
          <h3 style={{ fontSize: '1rem', margin: 0 }}>Presupuesto {anio} vs gasto real</h3>
          <button onClick={() => abrir(null)} className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.8rem' }}>+ Agregar rubro</button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                <th style={th}>Rubro</th>
                <th style={th}>Base</th>
                <th style={{ ...th, textAlign: 'right' }}>Presupuesto anual</th>
                <th style={{ ...th, textAlign: 'right' }}>Gastado</th>
                <th style={{ ...th, textAlign: 'right' }}>Diferencia</th>
                <th style={th}>Avance</th>
                <th style={{ ...th, textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {p.categorias.length === 0 ? (
                <tr><td colSpan="7" style={{ ...td, textAlign: 'center', color: 'var(--text-dim)', padding: '32px' }}>No hay rubros de presupuesto para {anio}.</td></tr>
              ) : p.categorias.map((c) => (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <td style={{ ...td, fontWeight: '700' }}>{c.nombre}<div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontWeight: '500' }}>{c.movimientos} {c.movimientos === 1 ? 'movimiento' : 'movimientos'}</div></td>
                  <td style={{ ...td, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{c.detalle || '—'}</td>
                  <td style={{ ...td, ...num }}>{money(c.anual)}</td>
                  <td style={{ ...td, ...num, fontWeight: '700' }}>{money(c.real)}</td>
                  <td style={{ ...td, ...num, fontWeight: '700', color: c.diferencia < 0 ? COLOR_NEG : COLOR_POS }}>{money(c.diferencia)}</td>
                  <td style={td}>{barra(c.porcentaje)}</td>
                  <td style={{ ...td, textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <button onClick={() => abrir(c)} style={linkBtn('var(--accent-gold)')}>Editar</button>
                    <button onClick={() => eliminar(c)} style={linkBtn('#dc2626')}>Eliminar</button>
                  </td>
                </tr>
              ))}
              <tr style={{ borderBottom: '1px solid var(--glass-border)', background: 'rgba(100,116,139,0.06)' }}>
                <td style={{ ...td, fontWeight: '700', color: 'var(--text-muted)' }}>Sin rubro<div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontWeight: '500' }}>{p.sinCategoria.movimientos} movimientos sin asignar</div></td>
                <td style={td} />
                <td style={td} />
                <td style={{ ...td, ...num, fontWeight: '700' }}>{money(p.sinCategoria.real)}</td>
                <td colSpan="3" style={{ ...td, color: 'var(--text-dim)', fontSize: '0.78rem' }}>No cuenta contra ningún presupuesto. Asígnales un rubro desde Estado de resultados.</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td style={{ ...td, fontWeight: '800' }}>Total con rubro</td>
                <td style={td} />
                <td style={{ ...td, ...num, fontWeight: '800' }}>{money(p.totales.presupuesto)}</td>
                <td style={{ ...td, ...num, fontWeight: '800' }}>{money(p.totales.real)}</td>
                <td style={{ ...td, ...num, fontWeight: '800', color: p.totales.diferencia < 0 ? COLOR_NEG : COLOR_POS }}>{money(p.totales.diferencia)}</td>
                <td style={td}>{barra(p.totales.porcentaje)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {modal && (
        <ModalShell title={modal.cat ? 'Editar rubro' : 'Agregar rubro'} onClose={() => setModal(null)}>
          <form onSubmit={guardar} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={labelStyle}>Nombre del rubro *</label>
              <input style={inputStyle} value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} required autoFocus />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={labelStyle}>Base (ej. $500 p/p)</label>
                <input style={inputStyle} value={form.detalle} onChange={(e) => setForm((f) => ({ ...f, detalle: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Presupuesto anual *</label>
                <input type="number" step="0.01" min="0" style={inputStyle} value={form.anual} onChange={(e) => setForm((f) => ({ ...f, anual: e.target.value }))} required />
              </div>
            </div>
            <ModalButtons onCancel={() => setModal(null)} submitLabel={modal.cat ? 'Guardar cambios' : 'Agregar rubro'} />
          </form>
        </ModalShell>
      )}
    </div>
  );
};

// ======================================
// Vista: resumen anual
// ======================================
const AnualView = ({ call, anio, onAbrirMes }) => {
  const [r, setR] = useState(null);
  useEffect(() => { call('GET', `/api/finanzas/resumen?anio=${anio}`).then((x) => x && setR(x)); }, [anio]);
  if (!r) return <p style={{ color: 'var(--text-dim)' }}>Cargando...</p>;
  const tot = r.totales;
  const th = { ...thBase, padding: '12px 10px' };
  const td = { ...tdBase, padding: '12px 10px', fontSize: '0.84rem' };
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <Kpi titulo="Ingreso bruto acumulado" valor={money(tot.bruto)} nota={`${tot.mesesCerrados} meses cerrados`} />
        <Kpi titulo="Ingreso neto acumulado" valor={money(tot.neto)} />
        <Kpi titulo="Gastos (meses cerrados)" valor={money(tot.gastos)} />
        <Kpi titulo="Resultado acumulado" valor={money(tot.resultado)} color={colorDe(tot.resultado)} />
        <Kpi titulo="Rentabilidad del año" valor={pct(tot.rentabilidad)} color={colorDe(tot.rentabilidad)} nota="Sobre meses cerrados" />
      </div>
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                <th style={th}>Mes</th>
                <th style={{ ...th, textAlign: 'right' }}>Ingreso bruto</th>
                <th style={{ ...th, textAlign: 'right' }}>Ingreso neto</th>
                <th style={{ ...th, textAlign: 'right' }}>Nómina</th>
                <th style={{ ...th, textAlign: 'right' }}>Bonos</th>
                <th style={{ ...th, textAlign: 'right' }}>Gastos admin.</th>
                <th style={{ ...th, textAlign: 'right' }}>Eventos</th>
                <th style={{ ...th, textAlign: 'right' }}>Gastos totales</th>
                <th style={{ ...th, textAlign: 'right' }}>Resultado</th>
                <th style={{ ...th, textAlign: 'right' }}>Rentab.</th>
              </tr>
            </thead>
            <tbody>
              {r.meses.map((m, i) => (
                <tr key={m.mes} onClick={() => !m.sinDatos && onAbrirMes(m.mes)} style={{ borderBottom: '1px solid var(--glass-border)', cursor: m.sinDatos ? 'default' : 'pointer', opacity: m.sinDatos ? 0.5 : 1 }}>
                  <td style={{ ...td, fontWeight: '700' }}>
                    {MESES[i]}
                    {!m.sinDatos && m.abierto && <span style={{ marginLeft: '8px', fontSize: '0.68rem', padding: '2px 8px', borderRadius: '12px', background: 'rgba(37,99,235,0.1)', color: 'var(--accent-gold)', fontWeight: '600' }}>Abierto</span>}
                  </td>
                  {m.sinDatos ? <td colSpan="9" style={{ ...td, color: 'var(--text-dim)' }}>Sin datos</td> : (
                    <>
                      <td style={{ ...td, ...num }}>{m.abierto ? 'Pendiente' : money(m.bruto)}</td>
                      <td style={{ ...td, ...num }}>{money(m.neto)}</td>
                      <td style={{ ...td, ...num }}>{money(m.nomina)}</td>
                      <td style={{ ...td, ...num }}>{money(m.bonos)}</td>
                      <td style={{ ...td, ...num }}>{money(m.gastosAdmin)}</td>
                      <td style={{ ...td, ...num }}>{money(m.eventos)}</td>
                      <td style={{ ...td, ...num, fontWeight: '700' }}>{money(m.gastos)}</td>
                      <td style={{ ...td, ...num, fontWeight: '700', color: colorDe(m.resultado) }}>{money(m.resultado)}</td>
                      <td style={{ ...td, ...num, fontWeight: '700', color: colorDe(m.rentabilidad) }}>{pct(m.rentabilidad)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '12px' }}>
        Los totales y la rentabilidad del año solo consideran meses cerrados (con ingreso capturado). Toca un mes para ver su estado de resultados.
        {tot.gastosMesesAbiertos > 0 && ` Gastos acumulados en meses abiertos: ${money(tot.gastosMesesAbiertos)}.`}
      </p>
    </div>
  );
};

// ======================================
// Contenedor
// ======================================
const VISTAS = [
  { id: 'estado', label: 'Estado de resultados' },
  { id: 'presupuesto', label: 'Presupuesto vs real' },
  { id: 'anual', label: 'Resumen anual' },
];

const Finanzas = () => {
  const { authFetch } = useAuth();
  const hoy = new Date();
  const [vista, setVista] = useState('estado');
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(ym(hoy.getFullYear(), hoy.getMonth() + 1));

  // Llamada al API: regresa el JSON, o null (con alerta) si el servidor responde error.
  const call = async (method, url, body) => {
    try {
      const res = await authFetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const j = await res.json().catch(() => ({ error: 'Respuesta inválida del servidor' }));
      if (!res.ok || j.error) { alert(j.error || 'Ocurrió un error'); return null; }
      return j;
    } catch (err) {
      alert('No se pudo conectar con el servidor');
      return null;
    }
  };

  const cambiarAnio = (nuevo) => {
    setAnio(nuevo);
    setMes(ym(nuevo, Number(mes.slice(5))));
  };
  const abrirMes = (valor) => {
    setAnio(Number(valor.slice(0, 4)));
    setMes(valor);
    setVista('estado');
  };
  const anios = [hoy.getFullYear() - 1, hoy.getFullYear(), hoy.getFullYear() + 1];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '22px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {VISTAS.map((v) => <button key={v.id} onClick={() => setVista(v.id)} style={pill(vista === v.id)}>{v.label}</button>)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontWeight: '600' }}>Año</span>
          <select value={anio} onChange={(e) => cambiarAnio(Number(e.target.value))} style={{ padding: '8px 12px', borderRadius: '8px', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', outline: 'none', fontWeight: '600' }}>
            {anios.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {vista === 'estado' && <EstadoResultados call={call} anio={anio} mes={mes} setMes={setMes} />}
      {vista === 'presupuesto' && <PresupuestoView call={call} anio={anio} />}
      {vista === 'anual' && <AnualView call={call} anio={anio} onAbrirMes={abrirMes} />}
    </div>
  );
};

export default Finanzas;
