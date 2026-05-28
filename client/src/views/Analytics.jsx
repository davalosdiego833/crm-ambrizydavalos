import React, { useState, useEffect } from 'react';
import { useAuth } from '../App';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts';

const COLORS = ['#e2b042', '#333333', '#1e1e1e', '#a37a24', '#ffffff'];
const PIE_COLORS = ['#e2b042', '#00ffaa', '#ffaa00', '#ff4444'];

const Analytics = () => {
  const { authFetch } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [month, setMonth] = useState(String(new Date().getMonth() + 1).padStart(2, '0')); // Predeterminado al mes actual
  const [activeSubTab, setActiveSubTab] = useState('consolidado'); // 'consolidado', 'udi', 'usd', 'gmm'
  const [drillDown, setDrillDown] = useState(null); // { title: string, list: array }

  const fetchAnalytics = () => {
    setLoading(true);
    let url = `/api/analytics?year=${year}`;
    if (month) url += `&month=${month}`;

    authFetch(url)
      .then(res => res.json())
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchAnalytics();
  }, [year, month]);

  const handleSaveSnapshot = async () => {
    if (!month) {
      alert('Selecciona un mes específico para realizar el cierre.');
      return;
    }
    
    const confirmClose = window.confirm(`¿Estás seguro de cerrar el mes de ${month}/${year}? Esto guardará una "Foto" permanente de tus KPIs.`);
    if (!confirmClose) return;

    try {
      const res = await authFetch('/api/analytics/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year,
          month,
          kpis: data.kpis,
          monthlyFlow: data.monthlyFlow,
          pieProducts: data.pieProducts,
          piePlans: data.piePlans,
          exchangeRates: data.exchangeRates,
          segments: data.segments,
          lists: data.lists
        })
      });
      if (res.ok) {
        alert('Cierre de mes exitoso. Los datos han sido blindados en el historial.');
        fetchAnalytics();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadSnapshot = (s) => {
    setData({
      ...s,
      isSnapshot: true,
      exchangeRates: s.exchangeRates || data.exchangeRates || { USD: 17.50, UDI: 8.25 },
      segments: s.segments || {
        vidaUDI: { count: 0, collected: 0, pending: 0, collectedMXN: 0, pendingMXN: 0 },
        vidaUSD: { count: 0, collected: 0, pending: 0, collectedMXN: 0, pendingMXN: 0 },
        vidaMXN: { count: 0, collected: 0, pending: 0, collectedMXN: 0, pendingMXN: 0 },
        gmm: { count: 0, collected: 0, pending: 0, collectedMXN: 0, pendingMXN: 0 }
      },
      lists: s.lists || { collected: [], pending: [], closed: [], active: [] }
    });
  };

  if (loading || !data) return <div style={{ textAlign: 'center', padding: '100px', color: 'var(--text-dim)' }}>Cargando inteligencia de negocio...</div>;

  // Formateadores
  const fmt = (n) => '$' + Math.round(n).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const fmtPesos = (n) => fmt(n) + ' MXN';

  const formatRawValue = (amount, currency) => {
    const cur = String(currency || 'MXN').toUpperCase();
    if (cur === 'UDI') {
      return `${Math.round(amount).toLocaleString('es-MX')} UDI`;
    }
    return `$${Math.round(amount).toLocaleString('es-MX')} ${cur}`;
  };

  // Convertir montos individuales
  const convertAmount = (amount, currency) => {
    const cur = String(currency || 'MXN').toUpperCase().trim();
    const rate = data.exchangeRates?.[cur] || 1;
    return amount * rate;
  };

  // Desgloses por moneda generales
  const calculateCurrencyBreakdown = (list) => {
    const breakObj = { MXN: 0, USD: 0, UDI: 0 };
    list.forEach(c => {
      const cur = String(c.currency || 'MXN').toUpperCase().trim();
      if (breakObj[cur] !== undefined) {
        breakObj[cur] += c.premium || 0;
      }
    });
    return breakObj;
  };

  const getConsolidatedBreakdowns = () => {
    const collected = { MXN: 0, USD: 0, UDI: 0 };
    const pending = { MXN: 0, USD: 0, UDI: 0 };

    data.lists.active.forEach(c => {
      const cur = String(c.currency || 'MXN').toUpperCase().trim();
      const val = c.premium || 0;

      const emissionStr = c.paymentDate || c.collectionDate || c.emissionDate || '';
      if (!emissionStr) return;
      const [eYearStr, eMonthStr] = emissionStr.split('-');
      const eYear = parseInt(eYearStr);
      const eMonth = parseInt(eMonthStr);
      const freq = String(c.paymentFrequency || 'MENSUAL').toUpperCase().trim();

      const monthsToCheck = month ? [parseInt(month)] : Array.from({ length: 12 }, (_, i) => i + 1);

      monthsToCheck.forEach(m => {
        // Ignorar cobros programados de meses anteriores al mes de emisión (aniversario) de la póliza
        if (m < eMonth) return;

        let isScheduled = false;
        if (freq === 'MENSUAL' || freq === 'MENSUALES') isScheduled = true;
        else if (freq === 'TRIMESTRAL' || freq === 'TRIMESTRALES') isScheduled = Math.abs(m - eMonth) % 3 === 0;
        else if (freq === 'SEMESTRAL' || freq === 'SEMESTRALES') isScheduled = Math.abs(m - eMonth) % 6 === 0;
        else if (freq === 'ANUAL' || freq === 'ANUALES') isScheduled = m === eMonth;

        if (isScheduled) {
          const mStr = String(m).padStart(2, '0');
          const isPaidThisMonth = c.status === 'Pagada' && c.paymentDate && c.paymentDate.startsWith(`${year}-${mStr}`);
          if (isPaidThisMonth) {
            if (collected[cur] !== undefined) collected[cur] += val;
          } else {
            if (pending[cur] !== undefined) pending[cur] += val;
          }
        }
      });
    });

    return { collected, pending };
  };

  const { collected: collectedBreakdown, pending: pendingBreakdown } = getConsolidatedBreakdowns();

  // --- FILTRADOS Y CÁLCULOS POR SUBPESTAÑA ---

  // Obtiene los clientes de la subpestaña actual
  const getSubTabClients = (subTab) => {
    return data.lists.active.filter(c => {
      const prod = String(c.product || 'Vida').trim().toLowerCase();
      const isGMM = prod.includes('gastos') || prod.includes('gmm') || prod.includes('médicos');
      const cur = String(c.currency || 'MXN').toUpperCase().trim();

      if (subTab === 'consolidado') return true;
      if (subTab === 'udi') return !isGMM && cur === 'UDI';
      if (subTab === 'usd') return !isGMM && cur === 'USD';
      if (subTab === 'gmm') return isGMM;
      return true;
    });
  };

  // Calcula KPIs específicos de la subpestaña (basado en el pre-filtrado del servidor)
  const getSubTabKPIs = (subTab) => {
    const clients = getSubTabClients(subTab);
    let collected = 0;
    let pending = 0;
    let totalActive = 0;
    let closedSales = 0;

    clients.forEach(c => {
      // Sumar según el estatus del cliente en la lista pre-filtrada
      totalActive += c.premium || 0;
      if (c.status === 'Pagada') {
        collected += c.premium || 0;
        closedSales++;
      } else {
        pending += c.premium || 0;
      }
    });

    return { collected, pending, totalActive, closedSales, count: clients.length };
  };

  // Genera el flujo de caja mensual para la subpestaña seleccionada (proyección anual)
  const getSubTabFlowData = (subTab) => {
    const flow = Array.from({ length: 12 }, (_, i) => ({
      name: new Date(2000, i, 1).toLocaleString('es-MX', { month: 'short' }).replace('.', '').toUpperCase(),
      mes: i + 1,
      cobrado: 0,
      pendiente: 0,
      ventas: 0
    }));

    const clients = getSubTabClients(subTab);

    clients.forEach(c => {
      const emissionStr = c.paymentDate || c.collectionDate || c.emissionDate || '';
      if (!emissionStr) return;

      const [eYearStr, eMonthStr] = emissionStr.split('-');
      const eYear = parseInt(eYearStr);
      const eMonth = parseInt(eMonthStr);

      const freq = String(c.paymentFrequency || 'MENSUAL').toUpperCase().trim();
      let activeMonths = [];

      for (let m = 1; m <= 12; m++) {
        // Ignorar cobros programados de meses anteriores al mes de emisión (aniversario) de la póliza
        if (m < eMonth) continue;

        let isScheduled = false;
        if (freq === 'MENSUAL' || freq === 'MENSUALES') isScheduled = true;
        else if (freq === 'TRIMESTRAL' || freq === 'TRIMESTRALES') isScheduled = Math.abs(m - eMonth) % 3 === 0;
        else if (freq === 'SEMESTRAL' || freq === 'SEMESTRALES') isScheduled = Math.abs(m - eMonth) % 6 === 0;
        else if (freq === 'ANUAL' || freq === 'ANUALES') isScheduled = m === eMonth;

        if (isScheduled) activeMonths.push(m);
      }

      activeMonths.forEach(m => {
        const mIndex = m - 1;
        const val = subTab === 'consolidado' ? convertAmount(c.premium || 0, c.currency) : (c.premium || 0);

        const mStr = String(m).padStart(2, '0');
        const isPaidThisMonth = c.status === 'Pagada' && c.paymentDate && c.paymentDate.startsWith(`${year}-${mStr}`);

        if (isPaidThisMonth) {
          flow[mIndex].cobrado += val;
          flow[mIndex].ventas += 1;
        } else {
          flow[mIndex].pendiente += val;
        }
      });
    });

    return flow;
  };

  // Genera la distribución de planes para la subpestaña seleccionada (basado en el pre-filtrado del servidor)
  const getSubTabPiePlansData = (subTab) => {
    const dist = {};
    const clients = getSubTabClients(subTab);

    clients.forEach(c => {
      const plan = c.planType || c.product || 'Otros';
      dist[plan] = (dist[plan] || 0) + 1;
    });

    return Object.entries(dist).map(([name, value]) => ({ name, value }));
  };

  const subTabKPIs = getSubTabKPIs(activeSubTab);
  const subTabFlow = getSubTabFlowData(activeSubTab);
  const subTabPlans = getSubTabPiePlansData(activeSubTab);

  return (
    <div className="animate-up" style={{ paddingBottom: '60px' }}>
      
      {/* CABECERA Y ROBOT FINANCIERO */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', flexWrap: 'wrap', gap: '20px' }}>
        <div>
          <h1 style={{ fontSize: '2.2rem', margin: 0, fontWeight: '700' }}>Estadísticas <span className="text-gradient-gold">Financieras</span></h1>
          <p style={{ color: 'var(--text-dim)', marginTop: '4px', fontSize: '0.95rem' }}>Análisis por divisas, salud de cartera y consolidado nacional</p>
        </div>
        
        {/* Robot de Divisas */}
        <div className="glass-card" style={{ padding: '12px 20px', display: 'flex', gap: '16px', alignItems: 'center', border: '1px solid rgba(226,176,66,0.3)', boxShadow: '0 0 15px rgba(226,176,66,0.1)' }}>
          <div style={{ fontSize: '1.5rem' }}>🤖</div>
          <div>
            <p style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--accent-gold)', fontWeight: 'bold', margin: 0 }}>Robot Financiero</p>
            <p style={{ fontSize: '0.85rem', margin: '2px 0 0 0', fontWeight: '600' }}>
              1 USD = <span style={{ color: 'var(--text-main)' }}>${data.exchangeRates?.USD?.toFixed(2)} MXN</span>
              <span style={{ margin: '0 10px', color: 'rgba(255,255,255,0.2)' }}>|</span>
              1 UDI = <span style={{ color: 'var(--text-main)' }}>${data.exchangeRates?.UDI?.toFixed(2)} MXN</span>
            </p>
          </div>
        </div>

        {/* Filtros Globales */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <select 
            value={year} 
            onChange={(e) => setYear(e.target.value)}
            style={{ padding: '10px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--accent-gold)', borderRadius: '8px', color: 'var(--accent-gold)', outline: 'none', cursor: 'pointer', fontWeight: 'bold' }}
          >
            <option value="2023">2023</option>
            <option value="2024">2024</option>
            <option value="2025">2025</option>
            <option value="2026">2026</option>
            <option value="2027">2027</option>
          </select>

          <select 
            value={month} 
            onChange={(e) => setMonth(e.target.value)}
            style={{ padding: '10px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: 'var(--text-main)', outline: 'none', cursor: 'pointer' }}
          >
            <option value="01">Enero</option>
            <option value="02">Febrero</option>
            <option value="03">Marzo</option>
            <option value="04">Abril</option>
            <option value="05">Mayo</option>
            <option value="06">Junio</option>
            <option value="07">Julio</option>
            <option value="08">Agosto</option>
            <option value="09">Septiembre</option>
            <option value="10">Octubre</option>
            <option value="11">Noviembre</option>
            <option value="12">Diciembre</option>
          </select>

          {month && !data.isSnapshot && (
            <button 
              onClick={handleSaveSnapshot}
              className="btn-primary"
              style={{ padding: '10px 20px', fontSize: '0.8rem' }}
            >
              🔒 Cerrar Mes
            </button>
          )}

          {data.isSnapshot && (
            <button 
              onClick={fetchAnalytics}
              style={{ padding: '10px 20px', background: 'rgba(255,255,255,0.1)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: 'var(--text-main)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600' }}
            >
              🔓 Ver Datos Vivos
            </button>
          )}
        </div>
      </div>

      {data.isSnapshot && (
        <div style={{ background: 'rgba(226, 176, 66, 0.1)', padding: '16px', borderRadius: '12px', marginBottom: '24px', border: '1px solid var(--accent-gold)', textAlign: 'center' }}>
          <p style={{ color: 'var(--accent-gold)', fontWeight: 'bold', fontSize: '0.95rem', margin: 0 }}>
            📜 REPORTE CERRADO Y ARCHIVADO ({data.month}/{data.year})
          </p>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: '4px 0 0 0' }}>Cierre realizado el {new Date(data.date).toLocaleString()}</p>
        </div>
      )}

      {/* 🧭 NAVEGACIÓN DE SUBPESTAÑAS */}
      <div style={{ 
        display: 'flex', 
        gap: '8px', 
        marginBottom: '32px', 
        padding: '6px', 
        background: 'rgba(255,255,255,0.02)', 
        border: '1px solid var(--glass-border)', 
        borderRadius: '14px', 
        width: 'fit-content',
        flexWrap: 'wrap'
      }}>
        <button 
          onClick={() => setActiveSubTab('consolidado')}
          style={{
            padding: '12px 24px',
            background: activeSubTab === 'consolidado' ? 'var(--accent-gold)' : 'transparent',
            color: activeSubTab === 'consolidado' ? 'var(--bg-deep)' : 'white',
            border: 'none',
            borderRadius: '10px',
            cursor: 'pointer',
            fontWeight: '700',
            transition: 'all 0.3s',
            fontSize: '0.85rem',
            boxShadow: activeSubTab === 'consolidado' ? '0 4px 15px rgba(226,176,66,0.3)' : 'none'
          }}
        >
          🏆 Consolidado Pesos (MXN)
        </button>
        <button 
          onClick={() => setActiveSubTab('udi')}
          style={{
            padding: '12px 24px',
            background: activeSubTab === 'udi' ? 'var(--accent-gold)' : 'transparent',
            color: activeSubTab === 'udi' ? 'var(--bg-deep)' : 'white',
            border: 'none',
            borderRadius: '10px',
            cursor: 'pointer',
            fontWeight: '700',
            transition: 'all 0.3s',
            fontSize: '0.85rem',
            boxShadow: activeSubTab === 'udi' ? '0 4px 15px rgba(226,176,66,0.3)' : 'none'
          }}
        >
          🧬 Cartera UDI
        </button>
        <button 
          onClick={() => setActiveSubTab('usd')}
          style={{
            padding: '12px 24px',
            background: activeSubTab === 'usd' ? 'var(--accent-gold)' : 'transparent',
            color: activeSubTab === 'usd' ? 'var(--bg-deep)' : 'white',
            border: 'none',
            borderRadius: '10px',
            cursor: 'pointer',
            fontWeight: '700',
            transition: 'all 0.3s',
            fontSize: '0.85rem',
            boxShadow: activeSubTab === 'usd' ? '0 4px 15px rgba(226,176,66,0.3)' : 'none'
          }}
        >
          💵 Cartera Dólares (USD)
        </button>
        <button 
          onClick={() => setActiveSubTab('gmm')}
          style={{
            padding: '12px 24px',
            background: activeSubTab === 'gmm' ? '#ffaa00' : 'transparent',
            color: activeSubTab === 'gmm' ? 'var(--bg-deep)' : 'white',
            border: 'none',
            borderRadius: '10px',
            cursor: 'pointer',
            fontWeight: '700',
            transition: 'all 0.3s',
            fontSize: '0.85rem',
            boxShadow: activeSubTab === 'gmm' ? '0 4px 15px rgba(255,170,0,0.3)' : 'none'
          }}
        >
          🏥 Cartera GMM (Pesos)
        </button>
      </div>

      {/* CONTENIDO DINÁMICO DE LA SUBPESTAÑA SELECCIONADA */}
      <div className="animate-up" key={activeSubTab}>
        
        {/* TARJETAS DE KPIS ADAPTATIVAS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px', marginBottom: '40px' }}>
          
          {/* KPI 1: Ingresos Pagados */}
          <div 
            className="glass-card stat-widget" 
            onClick={() => setDrillDown({ title: `Ingresos Pagados - ${activeSubTab.toUpperCase()}`, list: getSubTabClients(activeSubTab).filter(c => c.status === 'Pagada') })}
            style={{ padding: '24px', position: 'relative', cursor: 'pointer', overflow: 'hidden', border: '1px solid var(--glass-border)' }}
          >
            <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: activeSubTab === 'gmm' ? '#ffaa00' : 'var(--accent-gold)' }}></div>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px 0', fontWeight: '600' }}>
              Ingresos Pagados ({activeSubTab === 'consolidado' || activeSubTab === 'gmm' ? 'Pesos' : activeSubTab.toUpperCase()})
            </p>
            <p style={{ 
              fontSize: '2rem', 
              fontWeight: 'bold', 
              color: activeSubTab === 'gmm' ? '#ffaa00' : 'var(--accent-gold)', 
              margin: 0, 
              textShadow: activeSubTab === 'gmm' ? '0 0 10px rgba(255,170,0,0.1)' : '0 0 10px rgba(226,176,66,0.1)' 
            }}>
              {activeSubTab === 'consolidado' ? fmtPesos(data.kpis.collectedMXN) : formatRawValue(subTabKPIs.collected, activeSubTab === 'gmm' ? 'MXN' : activeSubTab)}
            </p>
            
            {activeSubTab !== 'consolidado' && activeSubTab !== 'gmm' && (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', margin: '4px 0 0 0', fontWeight: '600' }}>
                ~ {fmtPesos(convertAmount(subTabKPIs.collected, activeSubTab))}
              </p>
            )}

            {activeSubTab === 'consolidado' && (
              <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: '0.75rem', color: 'var(--text-dim)', lineHeight: '1.4' }}>
                <strong>Desglose original:</strong><br />
                🇲🇽 {fmt(collectedBreakdown.MXN)} MXN <span style={{color: 'rgba(255,255,255,0.2)'}}>|</span> 
                💵 {collectedBreakdown.USD.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} USD <span style={{color: 'rgba(255,255,255,0.2)'}}>|</span> 
                🧬 {collectedBreakdown.UDI.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} UDI
              </div>
            )}
            <p style={{ fontSize: '0.7rem', color: activeSubTab === 'gmm' ? '#ffaa00' : 'var(--accent-gold)', marginTop: '8px', margin: '14px 0 0 0', textAlign: 'right' }}>🔎 Ver desglose</p>
          </div>
          
          {/* KPI 2: Pendientes */}
          <div 
            className="glass-card stat-widget" 
            onClick={() => setDrillDown({ title: `Pendientes de Cobro - ${activeSubTab.toUpperCase()}`, list: getSubTabClients(activeSubTab).filter(c => c.status !== 'Pagada') })}
            style={{ padding: '24px', position: 'relative', cursor: 'pointer', overflow: 'hidden', border: '1px solid var(--glass-border)' }}
          >
            <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: 'rgba(255,255,255,0.4)' }}></div>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px 0', fontWeight: '600' }}>
              Pendiente de Cobro ({activeSubTab === 'consolidado' || activeSubTab === 'gmm' ? 'Pesos' : activeSubTab.toUpperCase()})
            </p>
            <p style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--text-main)', margin: 0 }}>
              {activeSubTab === 'consolidado' ? fmtPesos(data.kpis.pendingMXN) : formatRawValue(subTabKPIs.pending, activeSubTab === 'gmm' ? 'MXN' : activeSubTab)}
            </p>
            
            {activeSubTab !== 'consolidado' && activeSubTab !== 'gmm' && (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', margin: '4px 0 0 0', fontWeight: '600' }}>
                ~ {fmtPesos(convertAmount(subTabKPIs.pending, activeSubTab))}
              </p>
            )}

            {activeSubTab === 'consolidado' && (
              <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: '0.75rem', color: 'var(--text-dim)', lineHeight: '1.4' }}>
                <strong>Desglose original:</strong><br />
                🇲🇽 {fmt(pendingBreakdown.MXN)} MXN <span style={{color: 'rgba(255,255,255,0.2)'}}>|</span> 
                💵 {pendingBreakdown.USD.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} USD <span style={{color: 'rgba(255,255,255,0.2)'}}>|</span> 
                🧬 {pendingBreakdown.UDI.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} UDI
              </div>
            )}
            <p style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '8px', margin: '14px 0 0 0', textAlign: 'right' }}>🔎 Ver desglose</p>
          </div>

          {/* KPI 3: Ventas Cerradas */}
          <div 
            className="glass-card stat-widget" 
            onClick={() => setDrillDown({ title: `Ventas Cerradas - ${activeSubTab.toUpperCase()}`, list: getSubTabClients(activeSubTab).filter(c => c.status === 'Pagada') })}
            style={{ padding: '24px', position: 'relative', cursor: 'pointer', overflow: 'hidden', border: '1px solid var(--glass-border)' }}
          >
            <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: 'var(--accent-mint)' }}></div>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px 0', fontWeight: '600' }}>Ventas Cobradas</p>
            <p style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--accent-mint)', margin: 0 }}>{subTabKPIs.closedSales} Pólizas</p>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '8px', margin: '8px 0 0 0', lineHeight: '1.4' }}>
              Pólizas de esta cartera que realizaron exitosamente su cobro programado.
            </p>
            <p style={{ fontSize: '0.7rem', color: 'var(--accent-mint)', marginTop: '8px', margin: '14px 0 0 0', textAlign: 'right' }}>🔎 Ver desglose</p>
          </div>

          {/* KPI 4: Cartera Total */}
          <div 
            className="glass-card stat-widget" 
            onClick={() => setDrillDown({ title: `Cartera Activa - ${activeSubTab.toUpperCase()}`, list: getSubTabClients(activeSubTab) })}
            style={{ padding: '24px', position: 'relative', cursor: 'pointer', overflow: 'hidden', border: '1px solid var(--glass-border)' }}
          >
            <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: '#e2b042' }}></div>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px 0', fontWeight: '600' }}>
              Valor Total Cartera ({activeSubTab === 'consolidado' || activeSubTab === 'gmm' ? 'Pesos' : activeSubTab.toUpperCase()})
            </p>
            <p style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--text-main)', margin: 0 }}>
              {activeSubTab === 'consolidado' ? fmtPesos(data.kpis.totalActiveMXN) : formatRawValue(subTabKPIs.totalActive, activeSubTab === 'gmm' ? 'MXN' : activeSubTab)}
            </p>
            
            {activeSubTab !== 'consolidado' && activeSubTab !== 'gmm' && (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', margin: '4px 0 0 0', fontWeight: '600' }}>
                ~ {fmtPesos(convertAmount(subTabKPIs.totalActive, activeSubTab))}
              </p>
            )}


            <p style={{ fontSize: '0.7rem', color: 'var(--accent-gold)', marginTop: '8px', margin: '14px 0 0 0', textAlign: 'right' }}>🔎 Ver desglose</p>
          </div>
        </div>

        {/* GRÁFICAS DE ALTO IMPACTO FILTRADAS POR SUBPESTAÑA */}
        <div style={{ display: 'grid', gridTemplateColumns: activeSubTab === 'consolidado' ? '2fr 1fr' : '1fr 1fr', gap: '24px', marginBottom: '40px' }}>
          
          {/* Gráfica de Área Suave: Flujo Mensual */}
          <div className="glass-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.1rem', fontWeight: '700' }}>
                Flujo de Caja Mensual ({activeSubTab === 'consolidado' ? 'Consolidado Pesos' : activeSubTab.toUpperCase()}) - {year}
              </h3>
              <span style={{ 
                fontSize: '0.75rem', 
                color: activeSubTab === 'gmm' ? '#ffaa00' : 'var(--accent-gold)', 
                background: activeSubTab === 'gmm' ? 'rgba(255,170,0,0.1)' : 'rgba(226,176,66,0.1)', 
                padding: '4px 10px', 
                borderRadius: '20px', 
                fontWeight: 'bold' 
              }}>
                Unidad: {activeSubTab === 'consolidado' || activeSubTab === 'gmm' ? 'Pesos MXN' : activeSubTab.toUpperCase()}
              </span>
            </div>
            <div style={{ height: '320px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={subTabFlow}>
                  <defs>
                    <linearGradient id="colorCobradoSub" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={activeSubTab === 'gmm' ? '#ffaa00' : 'var(--accent-gold)'} stopOpacity={0.4}/>
                      <stop offset="95%" stopColor={activeSubTab === 'gmm' ? '#ffaa00' : 'var(--accent-gold)'} stopOpacity={0.0}/>
                    </linearGradient>
                    <linearGradient id="colorPendienteSub" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="rgba(255,255,255,0.3)" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="rgba(255,255,255,0.3)" stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="name" stroke="var(--text-dim)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis 
                    stroke="var(--text-dim)" 
                    fontSize={11} 
                    tickLine={false} 
                    axisLine={false} 
                    tickFormatter={(value) => activeSubTab === 'consolidado' || activeSubTab === 'gmm' ? `$${(value/1000).toFixed(0)}k` : `${value.toLocaleString()}`} 
                  />
                  <Tooltip 
                    cursor={{stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1}}
                    contentStyle={{ backgroundColor: 'rgba(10,10,10,0.95)', border: '1px solid var(--accent-gold)', borderRadius: '12px', backdropFilter: 'blur(10px)', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}
                    itemStyle={{ color: '#fff' }}
                    formatter={(value) => activeSubTab === 'consolidado' || activeSubTab === 'gmm' ? fmtPesos(value) : formatRawValue(value, activeSubTab)}
                  />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: '15px', fontSize: '0.8rem' }} />
                  <Area type="monotone" dataKey="cobrado" name="Pagado" stroke={activeSubTab === 'gmm' ? '#ffaa00' : 'var(--accent-gold)'} strokeWidth={2.5} fillOpacity={1} fill="url(#colorCobradoSub)" />
                  <Area type="monotone" dataKey="pendiente" name="Pendiente" stroke="rgba(255,255,255,0.4)" strokeWidth={2} fillOpacity={1} fill="url(#colorPendienteSub)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Gráfica Auxiliar según pestaña */}
          {activeSubTab === 'consolidado' ? (
            /* Dona de Participación de Ramos General */
            <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ margin: '0 0 16px 0', color: 'var(--text-main)', fontSize: '1.1rem', fontWeight: '700', textAlign: 'center' }}>Distribución de Cartera</h3>
              <div style={{ flex: 1, minHeight: '180px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie 
                      data={data.pieProducts} 
                      cx="50%" 
                      cy="50%" 
                      innerRadius={50} 
                      outerRadius={75} 
                      paddingAngle={5} 
                      dataKey="value"
                    >
                      {data.pieProducts.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} stroke="rgba(0,0,0,0.5)" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: 'rgba(0,0,0,0.9)', border: 'none', borderRadius: '8px' }} />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '0.8rem' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            /* Dona de Distribución de Planes Específicos */
            <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ margin: '0 0 16px 0', color: 'var(--text-main)', fontSize: '1.1rem', fontWeight: '700', textAlign: 'center' }}>Planes Vendidos ({activeSubTab.toUpperCase()})</h3>
              <div style={{ flex: 1, minHeight: '180px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                {subTabPlans.length === 0 ? (
                  <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>No hay registros de planes para este periodo.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie 
                        data={subTabPlans} 
                        cx="50%" 
                        cy="50%" 
                        innerRadius={50} 
                        outerRadius={75} 
                        paddingAngle={5} 
                        dataKey="value"
                        label={{ fill: '#aaa', fontSize: 10 }}
                      >
                        {subTabPlans.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="rgba(0,0,0,0.5)" strokeWidth={2} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: 'rgba(0,0,0,0.9)', border: 'none', borderRadius: '8px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )}
        </div>

        {/* TENDENCIA Y CIERRES COMPARATIVO */}
        <div style={{ display: 'grid', gridTemplateColumns: activeSubTab === 'consolidado' ? '1fr 2fr' : '1fr', gap: '24px' }}>
          
          {activeSubTab === 'consolidado' && (
            <div className="glass-card" style={{ padding: '24px' }}>
              <h3 style={{ color: 'var(--text-main)', fontSize: '1.1rem', fontWeight: '700', marginBottom: '16px', textAlign: 'center' }}>Planes Totales</h3>
              <div style={{ height: '220px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data.piePlans} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={{ fill: '#aaa', fontSize: 10 }}>
                      {data.piePlans.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="rgba(0,0,0,0.5)" strokeWidth={1} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: 'rgba(0,0,0,0.9)', border: 'none', borderRadius: '8px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="glass-card" style={{ padding: '24px' }}>
            <h3 style={{ marginBottom: '24px', color: 'var(--text-main)', fontSize: '1.1rem', fontWeight: '700' }}>Velocidad de Cierres (Tendencia Mensual en Periodo)</h3>
            <div style={{ height: '220px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={subTabFlow}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="name" stroke="var(--text-dim)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--text-dim)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'rgba(10,10,10,0.95)', border: '1px solid var(--accent-mint)', borderRadius: '8px' }}
                  />
                  <Line type="monotone" dataKey="ventas" name="Ventas Cobradas" stroke="var(--accent-mint)" strokeWidth={3} dot={{ fill: 'var(--bg-deep)', strokeWidth: 2, r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

      </div>

      {/* HISTORIAL DE CIERRES */}
      {!data.isSnapshot && data.snapshots?.length > 0 && (
        <div className="glass-card" style={{ marginTop: '40px', padding: '24px' }}>
          <h3 style={{ marginBottom: '20px', color: 'var(--accent-gold)', fontWeight: '700' }}>📦 Historial de Cierres (Fotos Archivadas)</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
            {data.snapshots.map((s) => (
              <div 
                key={s.id} 
                onClick={() => loadSnapshot(s)}
                style={{ padding: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', borderRadius: '12px', cursor: 'pointer', transition: '0.3s', position: 'relative' }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent-gold)'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--glass-border)'}
              >
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    const confirmDel = window.confirm(`¿Estás seguro de eliminar el cierre de ${s.month}/${s.year} del historial? Esta acción no se puede deshacer.`);
                    if (!confirmDel) return;
                    try {
                      const res = await authFetch(`/api/analytics/snapshot/${s.id}`, { method: 'DELETE' });
                      if (res.ok) {
                        alert('Cierre eliminado correctamente.');
                        fetchAnalytics();
                      }
                    } catch (err) {
                      console.error(err);
                    }
                  }}
                  style={{
                    position: 'absolute',
                    top: '12px',
                    right: '12px',
                    background: 'rgba(255, 68, 68, 0.1)',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#ff4444',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    padding: '4px 6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s',
                    zIndex: 10
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#ff4444';
                    e.currentTarget.style.color = 'black';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 68, 68, 0.1)';
                    e.currentTarget.style.color = '#ff4444';
                  }}
                  title="Eliminar Cierre"
                >
                  🗑️
                </button>
                <p style={{ fontWeight: 'bold', color: 'var(--accent-gold)', margin: 0, paddingRight: '24px' }}>{s.month}/{s.year}</p>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-dim)', margin: '4px 0 0 0' }}>Cerrado: {new Date(s.date).toLocaleDateString()}</p>
                <p style={{ fontSize: '0.95rem', margin: '8px 0 0 0', fontWeight: 'bold' }}>{fmtPesos(s.kpis.collectedMXN || s.kpis.collected)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL DE DESGLOSE DRILL-DOWN */}
      {drillDown && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000, padding: '40px' }}>
          <div className="glass-card animate-up" style={{ width: '100%', maxWidth: '1050px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '16px' }}>
              <h2 style={{ fontSize: '1.8rem', margin: 0 }}>
                {drillDown.title} <span style={{ fontSize: '1rem', color: 'var(--text-dim)', fontWeight: 'normal' }}>({drillDown.list.length} registros)</span>
              </h2>
              <button 
                onClick={() => setDrillDown(null)}
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                ✖ Cerrar
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-surface)', zIndex: 10 }}>
                  <tr style={{ borderBottom: '2px solid var(--glass-border)' }}>
                    <th style={{ padding: '12px 8px', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase' }}>Contratante</th>
                    <th style={{ padding: '12px 8px', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase' }}>Póliza</th>
                    <th style={{ padding: '12px 8px', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase' }}>Ramo / Plan</th>
                    <th style={{ padding: '12px 8px', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase' }}>Emisión</th>
                    <th style={{ padding: '12px 8px', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase' }}>Pago / Frecuencia</th>
                    <th style={{ padding: '12px 8px', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase' }}>Monto Original</th>
                    <th style={{ padding: '12px 8px', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', textAlign: 'right' }}>Equiv. Pesos MXN</th>
                  </tr>
                </thead>
                <tbody>
                  {drillDown.list.length === 0 ? (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>No hay datos para mostrar en este periodo o segmento.</td>
                    </tr>
                  ) : drillDown.list.map((c, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.2s' }}>
                      <td style={{ padding: '14px 8px', fontWeight: '600' }}>{c.contractor}</td>
                      <td style={{ padding: '14px 8px', color: 'var(--accent-gold)', fontWeight: 'bold' }}>{c.policyNumber}</td>
                      <td style={{ padding: '14px 8px', fontSize: '0.85rem' }}>
                        <span style={{ 
                          fontSize: '0.75rem', 
                          background: String(c.product || 'Vida').trim().toLowerCase().includes('gastos') || String(c.product || 'Vida').trim().toLowerCase().includes('gmm') ? 'rgba(255,170,0,0.1)' : 'rgba(226,176,66,0.1)', 
                          color: String(c.product || 'Vida').trim().toLowerCase().includes('gastos') || String(c.product || 'Vida').trim().toLowerCase().includes('gmm') ? '#ffaa00' : 'var(--accent-gold)', 
                          padding: '2px 8px', 
                          borderRadius: '10px', 
                          fontWeight: 'bold',
                          marginRight: '6px'
                        }}>
                          {c.product}
                        </span>
                        <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>{c.planType || 'N/A'}</span>
                      </td>
                      <td style={{ padding: '14px 8px', fontSize: '0.85rem', color: 'var(--text-dim)' }}>{c.emissionDate || 'N/A'}</td>
                      <td style={{ padding: '14px 8px', fontSize: '0.85rem' }}>
                        {c.status === 'Pagada' ? (
                          <span style={{ color: 'var(--accent-mint)', fontWeight: '600' }}>Pagado el {c.paymentDate}</span>
                        ) : (
                          <span style={{ color: '#ff4444' }}>Pendiente</span>
                        )}
                        <br />
                        <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>Frecuencia: {c.paymentFrequency || 'MENSUAL'}</span>
                      </td>
                      <td style={{ padding: '14px 8px', fontWeight: '600', color: 'var(--text-main)' }}>
                        {formatRawValue(c.premium || 0, c.currency)}
                      </td>
                      <td style={{ padding: '14px 8px', fontWeight: 'bold', color: 'var(--accent-gold)', textAlign: 'right' }}>
                        {fmtPesos(convertAmount(c.premium || 0, c.currency))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Analytics;
