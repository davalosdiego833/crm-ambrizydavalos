import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../App';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, BarChart, Bar, FunnelChart, Funnel, LabelList
} from 'recharts';

const COLORS = ['#e2b042', '#333333', '#1e1e1e', '#a37a24', '#ffffff'];
const PIE_COLORS = ['#e2b042', '#00ffaa', '#ffaa00', '#ff4444'];

const Analytics = () => {
  const { user, authFetch } = useAuth();
  const isAmbriz = user?.company === 'ambriz';
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

  const calculatePolicyAgeInMonths = (emissionDateStr) => {
    if (!emissionDateStr) return 0;
    const emission = new Date(emissionDateStr);
    if (isNaN(emission.getTime())) return 0;
    const hoy = new Date();
    
    let anosDif = hoy.getFullYear() - emission.getFullYear();
    let mesesDif = hoy.getMonth() - emission.getMonth();
    
    let totalMeses = (anosDif * 12) + mesesDif;
    
    if (hoy.getDate() < emission.getDate()) {
      totalMeses--;
    }
    
    return Math.max(0, totalMeses);
  };

  const formatAgeInYearsAndMonths = (totalMonths) => {
    if (totalMonths === 0) return '0 meses';
    
    const years = Math.floor(totalMonths / 12);
    const months = totalMonths % 12;
    
    let parts = [];
    if (years > 0) {
      parts.push(`${years} ${years === 1 ? 'año' : 'años'}`);
    }
    if (months > 0 || years === 0) {
      parts.push(`${months} ${months === 1 ? 'mes' : 'meses'}`);
    }
    
    return parts.join(' ');
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

      const emissionStr = c.emissionDate || c.collectionDate || c.paymentDate || '';
      if (!emissionStr) return;
      const [eYearStr, eMonthStr] = emissionStr.split('-');
      const eYear = parseInt(eYearStr);
      const eMonth = parseInt(eMonthStr);
      const freq = String(c.paymentFrequency || 'MENSUAL').toUpperCase().trim();

      const monthsToCheck = month ? [parseInt(month)] : Array.from({ length: 12 }, (_, i) => i + 1);

      monthsToCheck.forEach(m => {
        // Ignorar cobros programados de meses anteriores al mes de emisión de la póliza sólo en el año de emisión
        if (eYear === parseInt(year) && m < eMonth) return;

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
    const filterFn = (c) => {
      const prod = String(c.product || 'Vida').trim().toLowerCase();
      const isGMM = prod.includes('gastos') || prod.includes('gmm') || prod.includes('médicos');
      const cur = String(c.currency || 'MXN').toUpperCase().trim();
      if (subTab === 'consolidado') return true;
      if (subTab === 'udi') return !isGMM && cur === 'UDI';
      if (subTab === 'usd') return !isGMM && cur === 'USD';
      if (subTab === 'gmm') return isGMM;
      return true;
    };

    const activeList = (data.lists.active || []).filter(filterFn);
    const newSalesList = (data.lists.newSales || []).filter(filterFn);
    const renewalsList = (data.lists.renewals || []).filter(filterFn);
    const lateList = (data.lists.late || []).filter(filterFn);
    
    let collected = 0;
    let pending = 0;
    let closedSales = 0;
    
    let newSalesValue = 0;
    let renewalsValue = 0;
    let lateValue = 0;
    
    activeList.forEach(c => {
      const val = subTab === 'consolidado' ? convertAmount(c.premium || 0, c.currency) : (c.premium || 0);
      if (c.status === 'Pagada') {
        collected += val;
        closedSales++;
      } else {
        pending += val;
      }
    });

    newSalesList.forEach(c => {
      const val = subTab === 'consolidado' ? convertAmount(c.premium || 0, c.currency) : (c.premium || 0);
      newSalesValue += val;
    });
    renewalsList.forEach(c => {
      const val = subTab === 'consolidado' ? convertAmount(c.premium || 0, c.currency) : (c.premium || 0);
      renewalsValue += val;
    });
    lateList.forEach(c => {
      const val = subTab === 'consolidado' ? convertAmount(c.premium || 0, c.currency) : (c.premium || 0);
      lateValue += val;
    });

    return { 
      collected, 
      pending, 
      closedSales, 
      newSalesValue, 
      renewalsValue, 
      lateValue,
      lateList,
      count: activeList.length,
      newSalesList,
      renewalsList
    };
  };

  const getSubTabAllActiveClients = (subTab) => {
    return (data.lists.allActive || []).filter(c => {
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

  const getSubTabAgeBreakdown = (subTab) => {
    const clients = getSubTabAllActiveClients(subTab);
    
    let countNew = 0;
    let countOld = 0;
    let valueNew = 0;
    let valueOld = 0;
    
    let listNew = [];
    let listOld = [];
    
    clients.forEach(c => {
      const age = calculatePolicyAgeInMonths(c.emissionDate);
      
      let divisor = 1;
      const freq = String(c.paymentFrequency || 'ANUAL').toUpperCase().trim();
      if (freq.includes('MENS')) divisor = 12;
      else if (freq.includes('TRIM')) divisor = 4;
      else if (freq.includes('SEME')) divisor = 2;
      
      const annualized = (c.annualPremium && c.annualPremium > 0) ? c.annualPremium : ((c.premium || 0) * divisor);
      const mxnVal = convertAmount(annualized, c.currency);
      
      if (age <= 13) {
        countNew++;
        valueNew += subTab === 'consolidado' || subTab === 'gmm' ? mxnVal : annualized;
        listNew.push(c);
      } else {
        countOld++;
        valueOld += subTab === 'consolidado' || subTab === 'gmm' ? mxnVal : annualized;
        listOld.push(c);
      }
    });
    
    return {
      countNew,
      countOld,
      valueNew,
      valueOld,
      listNew,
      listOld
    };
  };

  // Genera el flujo de caja mensual para la subpestaña seleccionada (proyección anual)
  const getSubTabFlowData = (subTab) => {
    const flow = Array.from({ length: 12 }, (_, i) => ({
      name: new Date(2000, i, 1).toLocaleString('es-MX', { month: 'short' }).replace('.', '').toUpperCase(),
      mes: i + 1,
      cobrado: 0,
      pendiente: 0,
      cobradoNuevas: 0,
      cobradoSubsecuentes: 0,
      pendienteNuevas: 0,
      pendienteSubsecuentes: 0,
      ventas: 0
    }));

    const clients = getSubTabAllActiveClients(subTab);

    const now = new Date();
    const nowYear = now.getFullYear();
    const nowMonth = now.getMonth() + 1;
    const tYear = parseInt(year);

    clients.forEach(c => {
      const emissionStr = c.emissionDate || c.collectionDate || c.paymentDate || '';
      if (!emissionStr) return;

      const [eYearStr, eMonthStr] = emissionStr.split('-');
      const eYear = parseInt(eYearStr);
      const eMonth = parseInt(eMonthStr);

      const freq = String(c.paymentFrequency || 'MENSUAL').toUpperCase().trim();
      let activeMonths = [];

      for (let m = 1; m <= 12; m++) {
        // Ignorar cobros programados de meses anteriores al mes de emisión de la póliza sólo en el año de emisión
        if (eYear === tYear && m < eMonth) continue;

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
        const isNewSaleInM = (eYear === tYear && eMonth === m);

        let isPaidThisMonth = false;
        if (c.status !== 'Anulada') {
          if (c.status === 'Atrasada') {
            isPaidThisMonth = false;
          } else if (isNewSaleInM) {
            isPaidThisMonth = true;
          } else if (tYear < nowYear || (tYear === nowYear && m < nowMonth)) {
            isPaidThisMonth = true;
          } else {
            isPaidThisMonth = Boolean(c.paymentDate && c.paymentDate.startsWith(`${year}-${mStr}`));
          }
        }

        if (isPaidThisMonth) {
          flow[mIndex].cobrado += val;
          if (isNewSaleInM) {
            flow[mIndex].cobradoNuevas += val;
          } else {
            flow[mIndex].cobradoSubsecuentes += val;
          }
        } else {
          flow[mIndex].pendiente += val;
          if (isNewSaleInM) {
            flow[mIndex].pendienteNuevas += val;
          } else {
            flow[mIndex].pendienteSubsecuentes += val;
          }
        }

        if (isNewSaleInM) {
          flow[mIndex].ventas += 1;
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
    <div style={{ paddingBottom: '60px' }}>
      <style>{`
        .analytics-grid-row-1 {
          display: grid;
          grid-template-columns: 1fr;
          gap: 24px;
          margin-bottom: 32px;
        }
        .analytics-grid-row-2 {
          display: grid;
          grid-template-columns: 1fr;
          gap: 24px;
          margin-bottom: 32px;
        }
        .analytics-grid-row-3 {
          display: grid;
          grid-template-columns: 1fr;
          gap: 24px;
          margin-bottom: 32px;
        }
        @media (min-width: 1025px) {
          .analytics-grid-row-1 {
            grid-template-columns: 1fr 1fr;
          }
          .analytics-grid-row-2 {
            grid-template-columns: 1fr 1fr 1.2fr;
          }
          .analytics-grid-row-3 {
            grid-template-columns: 1fr;
          }
        }
        .sparkline-glow-ventas {
          filter: drop-shadow(0 2px 4px rgba(0, 255, 170, 0.2));
        }
        .sparkline-glow-subsecuentes {
          filter: drop-shadow(0 2px 4px rgba(68, 136, 255, 0.2));
        }
        
        /* Progress bars styling matching mobile mockup.
           'body.dark-theme' es la variante oscura; sin esa clase (default) es el
           modo claro/ejecutivo, que es la base del rediseño actual. */
        .progress-bar-container {
          background: rgba(0, 0, 0, 0.02);
          border: 1px solid var(--glass-border);
          border-radius: 10px;
          padding: 12px 16px;
          cursor: pointer;
          transition: all 0.3s var(--transition-premium);
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .progress-bar-container:hover {
          transform: translateY(-2px);
          background: rgba(0, 0, 0, 0.04);
          border-color: var(--accent-gold-glow);
          box-shadow: 0 8px 20px rgba(15, 23, 42, 0.05);
        }
        .progress-bar-track {
          width: 100%;
          height: 6px;
          background: rgba(0, 0, 0, 0.08);
          border-radius: 3px;
          overflow: hidden;
        }
        body.dark-theme .progress-bar-container {
          background: rgba(255, 255, 255, 0.02);
        }
        body.dark-theme .progress-bar-container:hover {
          background: rgba(255, 255, 255, 0.04);
          border-color: var(--accent-gold-glow);
          box-shadow: 0 8px 20px rgba(0,0,0,0.3);
        }
        body.dark-theme .progress-bar-track {
          background: rgba(255, 255, 255, 0.05);
        }
        .progress-bar-fill {
          height: 100%;
          border-radius: 3px;
          transition: width 1s cubic-bezier(0.22, 1, 0.36, 1);
        }
      `}</style>
      <div className="animate-up">
      
      {/* CABECERA Y FILTROS */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', flexWrap: 'wrap', gap: '20px' }}>
        <div>
          <h1 style={{ fontSize: '2.2rem', margin: 0, fontWeight: '700', color: 'var(--text-main)' }}>
            Estadísticas <span className="text-gradient-gold">{isAmbriz ? 'Financieras' : 'Automotrices'}</span>
          </h1>
          <p style={{ color: 'var(--text-dim)', marginTop: '4px', fontSize: '0.95rem' }}>
            {isAmbriz
              ? 'Análisis integral de cartera, ventas y salud financiera multi-moneda'
              : 'Análisis integral de cartera, ventas y salud financiera en Pesos (MXN)'}
          </p>
        </div>

        {/* Filtros Globales */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <select 
            value={year} 
            onChange={(e) => setYear(e.target.value)}
            style={{ padding: '10px 16px', background: 'var(--bg-surface)', border: '1px solid var(--accent-gold)', borderRadius: '8px', color: 'var(--accent-gold)', outline: 'none', cursor: 'pointer', fontWeight: 'bold' }}
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
            style={{ padding: '10px 16px', background: 'var(--bg-surface)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: 'var(--text-main)', outline: 'none', cursor: 'pointer' }}
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
              Cerrar Mes
            </button>
          )}

          {data.isSnapshot && (
            <button 
              onClick={fetchAnalytics}
              style={{ padding: '10px 20px', background: 'var(--bg-surface)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: 'var(--text-main)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600' }}
            >
              Ver Datos Vivos
            </button>
          )}
        </div>
      </div>

      {/* SELECTOR DE SUBPESTAÑAS (Consolidado/UDI/USD/GMM) — exclusivo Ambriz & Dávalos,
          Novaris solo maneja Automotriz/MXN y se queda fijo en 'consolidado'. */}
      {isAmbriz && (
        <div style={{
          display: 'flex',
          gap: '6px',
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
              color: activeSubTab === 'consolidado' ? 'var(--bg-deep)' : 'var(--text-main)',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
              fontWeight: '700',
              transition: 'all 0.3s',
              fontSize: '0.85rem',
              boxShadow: activeSubTab === 'consolidado' ? '0 4px 15px var(--accent-gold-glow)' : 'none'
            }}
          >
            🏆 Consolidado Pesos (MXN)
          </button>
          <button
            onClick={() => setActiveSubTab('udi')}
            style={{
              padding: '12px 24px',
              background: activeSubTab === 'udi' ? 'var(--accent-gold)' : 'transparent',
              color: activeSubTab === 'udi' ? 'var(--bg-deep)' : 'var(--text-main)',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
              fontWeight: '700',
              transition: 'all 0.3s',
              fontSize: '0.85rem',
              boxShadow: activeSubTab === 'udi' ? '0 4px 15px var(--accent-gold-glow)' : 'none'
            }}
          >
            🧬 Cartera UDI
          </button>
          <button
            onClick={() => setActiveSubTab('usd')}
            style={{
              padding: '12px 24px',
              background: activeSubTab === 'usd' ? 'var(--accent-gold)' : 'transparent',
              color: activeSubTab === 'usd' ? 'var(--bg-deep)' : 'var(--text-main)',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
              fontWeight: '700',
              transition: 'all 0.3s',
              fontSize: '0.85rem',
              boxShadow: activeSubTab === 'usd' ? '0 4px 15px var(--accent-gold-glow)' : 'none'
            }}
          >
            💵 Cartera USD
          </button>
          <button
            onClick={() => setActiveSubTab('gmm')}
            style={{
              padding: '12px 24px',
              background: activeSubTab === 'gmm' ? 'var(--accent-gold)' : 'transparent',
              color: activeSubTab === 'gmm' ? 'var(--bg-deep)' : 'var(--text-main)',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
              fontWeight: '700',
              transition: 'all 0.3s',
              fontSize: '0.85rem',
              boxShadow: activeSubTab === 'gmm' ? '0 4px 15px var(--accent-gold-glow)' : 'none'
            }}
          >
            🏥 GMM
          </button>
        </div>
      )}

      {data.isSnapshot && (
        <div style={{ background: 'rgba(37, 99, 235, 0.08)', padding: '16px', borderRadius: '12px', marginBottom: '24px', border: '1px solid var(--accent-gold)', textAlign: 'center' }}>
          <p style={{ color: 'var(--accent-gold)', fontWeight: 'bold', fontSize: '0.95rem', margin: 0 }}>
            REPORTE CERRADO Y ARCHIVADO ({data.month}/{data.year})
          </p>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: '4px 0 0 0' }}>Cierre realizado el {new Date(data.date).toLocaleString()}</p>
        </div>
      )}

      {/* CONTENIDO DINÁMICO DE LA SUBPESTAÑA SELECCIONADA */}
      <div className="animate-up" key={activeSubTab}>
        
        {/* FILA 1: EL TABLERO DE CONTROL MENSUAL (Dona y Metas de Cobro) */}
        <div className="analytics-grid-row-1">
          
          {/* COLUMNA 1: DISTRIBUCIÓN DE PLANES DE SEGUROS DE AUTO (DONA) */}
          <div 
            className="glass-card" 
            style={{ padding: '24px', display: 'flex', flexDirection: 'column', height: '380px', cursor: 'pointer', border: '1px solid var(--glass-border)' }}
            onClick={() => setDrillDown({ 
              title: `Distribución de Planes - ${activeSubTab.toUpperCase()}`, 
              list: getSubTabClients(activeSubTab) 
            })}
          >
            <h3 style={{ margin: '0 0 16px 0', color: 'var(--text-main)', fontSize: '0.95rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Distribución de Planes {isAmbriz ? '' : '(Seguros de Auto)'}
            </h3>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: '16px', minHeight: '180px' }}>
              {subTabPlans.length === 0 ? (
                <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>No hay registros de planes para este periodo.</p>
              ) : (
                <>
                  <div style={{ width: '55%', height: '100%', minHeight: '180px' }}>
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
                        >
                          {subTabPlans.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="rgba(0,0,0,0.5)" strokeWidth={2} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: 'rgba(0,0,0,0.9)', border: 'none', borderRadius: '8px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ width: '45%', display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '200px', overflowY: 'auto' }}>
                    {subTabPlans.map((entry, index) => (
                      <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: COLORS[index % COLORS.length], flexShrink: 0 }}></div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '0.78rem', fontWeight: 'bold', color: 'var(--text-main)' }}>{entry.name}</span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{entry.value} {entry.value === 1 ? 'póliza' : 'pólizas'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* COLUMNA 2: EL CUADRO DE BARRAS DE PROGRESO DE COBRANZA */}
          <div 
            className="glass-card" 
            style={{ padding: '24px', display: 'flex', flexDirection: 'column', height: '380px', border: '1px solid var(--glass-border)' }}
          >
            <h3 style={{ margin: '0 0 16px 0', color: 'var(--text-main)', fontSize: '0.95rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Efectividad de Cobro Mensual ({activeSubTab === 'consolidado' || activeSubTab === 'gmm' ? 'Pesos' : activeSubTab.toUpperCase()})
            </h3>
            
            {(() => {
              const totalExpected = subTabKPIs.collected + subTabKPIs.pending;
              const collectedReal = subTabKPIs.collected;
              const pendingInTimeValue = subTabKPIs.pending - subTabKPIs.lateValue;
              const lateValue = subTabKPIs.lateValue;

              const formatVal = (val) => {
                if (activeSubTab === 'consolidado' || activeSubTab === 'gmm') {
                  return fmtPesos(val);
                }
                return formatRawValue(val, activeSubTab);
              };

              const pctPagado = totalExpected > 0 ? Math.round((collectedReal / totalExpected) * 100) : 0;
              const pctATiempo = totalExpected > 0 ? Math.round((pendingInTimeValue / totalExpected) * 100) : 0;
              const pctAtrasado = totalExpected > 0 ? Math.round((lateValue / totalExpected) * 100) : 0;

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, justifyContent: 'center' }}>
                  
                  {/* Total Esperado */}
                  <div 
                    className="progress-bar-container"
                    onClick={() => setDrillDown({ 
                      title: `Total Esperado del Mes - ${activeSubTab.toUpperCase()}`, 
                      list: getSubTabClients(activeSubTab) 
                    })}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--accent-gold)' }}>TOTAL ESPERADO</span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-main)' }}>{formatVal(totalExpected)} (100%)</span>
                    </div>
                    <div className="progress-bar-track">
                      <div className="progress-bar-fill" style={{ width: '100%', background: 'var(--accent-gold)', boxShadow: '0 0 10px var(--accent-gold-glow)' }}></div>
                    </div>
                  </div>

                  {/* Pagado */}
                  <div 
                    className="progress-bar-container"
                    onClick={() => setDrillDown({ 
                      title: `Ingresos Pagados del Mes - ${activeSubTab.toUpperCase()}`, 
                      list: getSubTabClients(activeSubTab).filter(c => c.status === 'Pagada') 
                    })}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--accent-mint)' }}>PAGADO (REAL)</span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--accent-mint)' }}>{formatVal(collectedReal)} ({pctPagado}%)</span>
                    </div>
                    <div className="progress-bar-track">
                      <div className="progress-bar-fill" style={{ width: `${pctPagado}%`, background: 'var(--accent-mint)', boxShadow: '0 0 10px var(--accent-mint-glow)' }}></div>
                    </div>
                  </div>

                  {/* A Tiempo */}
                  <div 
                    className="progress-bar-container"
                    onClick={() => setDrillDown({ 
                      title: `Cobranza Pendiente en Tiempo - ${activeSubTab.toUpperCase()}`, 
                      list: getSubTabClients(activeSubTab).filter(c => c.status !== 'Pagada' && !subTabKPIs.lateList.some(l => l.policyNumber === c.policyNumber)) 
                    })}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#4488ff' }}>PENDIENTE A TIEMPO</span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#4488ff' }}>{formatVal(pendingInTimeValue)} ({pctATiempo}%)</span>
                    </div>
                    <div className="progress-bar-track">
                      <div className="progress-bar-fill" style={{ width: `${pctATiempo}%`, background: '#4488ff', boxShadow: '0 0 10px rgba(68,136,255,0.3)' }}></div>
                    </div>
                  </div>

                  {/* Atrasado */}
                  <div 
                    className="progress-bar-container"
                    onClick={() => setDrillDown({ 
                      title: `Pólizas Atrasadas - ${activeSubTab.toUpperCase()}`, 
                      list: subTabKPIs.lateList || [] 
                    })}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#ff4444' }}>ATRASADO</span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#ff4444' }}>{formatVal(lateValue)} ({pctAtrasado}%)</span>
                    </div>
                    <div className="progress-bar-track">
                      <div className="progress-bar-fill" style={{ width: `${pctAtrasado}%`, background: '#ff4444', boxShadow: '0 0 10px rgba(255,68,68,0.3)' }}></div>
                    </div>
                  </div>

                </div>
              );
            })()}
          </div>
        </div>

        {/* FILA 2: INDICADORES RÁPIDOS Y TENDENCIAS (Ventas Nuevas, Subsecuentes y Cartera) */}
        <div className="analytics-grid-row-2">
          
          {/* Card Ventas Nuevas */}
          <div 
            className="glass-card" 
            onClick={() => setDrillDown({ title: `Ventas Nuevas del Mes - ${activeSubTab.toUpperCase()}`, list: subTabKPIs.newSalesList || [] })}
            style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', cursor: 'pointer', position: 'relative', overflow: 'hidden', border: '1px solid var(--glass-border)', height: '210px' }}
          >
            <div style={{ position: 'absolute', top: 0, left: 0, width: '3px', height: '100%', background: 'var(--accent-mint)' }}></div>
            <div>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: '600', margin: 0 }}>Ventas Nuevas</p>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.62rem', margin: '1px 0 0 0', textTransform: 'none' }}>Primer pago emitido en el mes</p>
              <p style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--accent-mint)', margin: '4px 0 0 0' }}>
                {`${subTabKPIs.newSalesList?.length || 0} ${subTabKPIs.newSalesList?.length === 1 ? 'póliza' : 'pólizas'}`}
              </p>
            </div>
            
            {/* Live Sparkline */}
            <div style={{ height: '80px', marginTop: '10px', width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={subTabFlow} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                  <defs>
                    <linearGradient id="glowVentas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent-mint)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="var(--accent-mint)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis 
                    dataKey="name" 
                    stroke="var(--text-dim)" 
                    fontSize={8} 
                    tickLine={false} 
                    axisLine={false} 
                    dy={4}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'rgba(10,10,10,0.95)', border: '1px solid var(--accent-mint)', borderRadius: '6px', fontSize: '9px', padding: '4px 8px' }}
                    itemStyle={{ color: '#fff', padding: 0 }}
                    labelStyle={{ color: 'var(--text-dim)', fontWeight: 'bold', margin: 0 }}
                    formatter={(value) => [`${value} ${value === 1 ? 'póliza' : 'pólizas'}`, 'Ventas']}
                  />
                  <Area 
                    type="linear" 
                    dataKey="ventas" 
                    stroke="var(--accent-mint)" 
                    strokeWidth={2} 
                    fillOpacity={1} 
                    fill="url(#glowVentas)" 
                    dot={false}
                    activeDot={{ r: 4 }}
                    className="sparkline-glow-ventas"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Card Pagos Subsecuentes */}
          <div 
            className="glass-card" 
            onClick={() => setDrillDown({ title: `Pagos Subsecuentes - ${activeSubTab.toUpperCase()}`, list: subTabKPIs.renewalsList || [] })}
            style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', cursor: 'pointer', position: 'relative', overflow: 'hidden', border: '1px solid var(--glass-border)', height: '210px' }}
          >
            <div style={{ position: 'absolute', top: 0, left: 0, width: '3px', height: '100%', background: '#4488ff' }}></div>
            <div>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: '600', margin: 0 }}>Subsecuentes</p>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.62rem', margin: '1px 0 0 0', textTransform: 'none' }}>Pagos a partir del 2° mes o renovaciones</p>
              <p style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#4488ff', margin: '4px 0 0 0' }}>
                {activeSubTab === 'consolidado' ? fmt(data.kpis.renewalsMXN) : formatRawValue(subTabKPIs.renewalsValue, activeSubTab)}
              </p>
            </div>
            
            {/* Live Sparkline */}
            <div style={{ height: '80px', marginTop: '10px', width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={subTabFlow} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                  <defs>
                    <linearGradient id="glowSubsecuentes" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4488ff" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#4488ff" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis 
                    dataKey="name" 
                    stroke="var(--text-dim)" 
                    fontSize={8} 
                    tickLine={false} 
                    axisLine={false} 
                    dy={4}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'rgba(10,10,10,0.95)', border: '1px solid #4488ff', borderRadius: '6px', fontSize: '9px', padding: '4px 8px' }}
                    itemStyle={{ color: '#fff', padding: 0 }}
                    labelStyle={{ color: 'var(--text-dim)', fontWeight: 'bold', margin: 0 }}
                    formatter={(value) => [activeSubTab === 'consolidado' ? fmt(value) : formatRawValue(value, activeSubTab), 'Subsecuente Cobrado']}
                  />
                  <Area 
                    type="linear" 
                    dataKey="cobradoSubsecuentes" 
                    stroke="#4488ff" 
                    strokeWidth={2} 
                    fillOpacity={1} 
                    fill="url(#glowSubsecuentes)" 
                    dot={false} 
                    activeDot={{ r: 4 }}
                    className="sparkline-glow-subsecuentes"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Card Valor Total Cartera Anual */}
          <div 
            className="glass-card" 
            onClick={() => setDrillDown({ title: `Valor Total de la Cartera - ${activeSubTab.toUpperCase()}`, list: getSubTabAllActiveClients(activeSubTab) })}
            style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'center', cursor: 'pointer', position: 'relative', overflow: 'hidden', border: '1px solid var(--glass-border)', height: '210px' }}
          >
            <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: activeSubTab === 'gmm' ? '#ffaa00' : 'var(--accent-gold)' }}></div>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: '600', margin: 0, letterSpacing: '0.5px' }}>
              Valor Total Cartera Anual ({activeSubTab === 'consolidado' || activeSubTab === 'gmm' ? 'Pesos' : activeSubTab.toUpperCase()})
            </p>
            <p style={{ fontSize: '1.6rem', fontWeight: 'bold', color: 'var(--text-main)', margin: '6px 0 0 0' }}>
              {activeSubTab === 'consolidado' ? fmtPesos(data.kpis.portfolio.totalMXN) :
               activeSubTab === 'gmm' ? fmtPesos(data.kpis.portfolio.GMM) :
               activeSubTab === 'usd' ? formatRawValue(data.kpis.portfolio.USD, 'USD') :
               formatRawValue(data.kpis.portfolio.UDI, 'UDI')}
            </p>
            {activeSubTab !== 'consolidado' && activeSubTab !== 'gmm' && (
              <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: '2px 0 0 0', fontWeight: '600' }}>
                ~ {fmtPesos(activeSubTab === 'usd' ? data.kpis.portfolio.USD * data.exchangeRates?.USD : data.kpis.portfolio.UDI * data.exchangeRates?.UDI)}
              </p>
            )}
          </div>
        </div>

        {/* FILA 3: EL FLUJO HISTÓRICO Y LA DISTRIBUCIÓN PLANES (2 Columnas) */}
        <div className="analytics-grid-row-3">
          
          {/* Gráfica de Barras Apiladas: Flujo Mensual */}
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
                <BarChart data={subTabFlow} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" vertical={false} />
                  <XAxis dataKey="name" stroke="var(--text-dim)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis 
                    stroke="var(--text-dim)" 
                    fontSize={11} 
                    tickLine={false} 
                    axisLine={false} 
                    tickFormatter={(value) => activeSubTab === 'consolidado' || activeSubTab === 'gmm' ? `$${(value/1000).toFixed(0)}k` : `${value.toLocaleString()}`} 
                  />
                  <Tooltip 
                    cursor={{fill: 'var(--glass-border)'}}
                    contentStyle={{ backgroundColor: 'rgba(10,10,10,0.95)', border: '1px solid var(--accent-gold)', borderRadius: '12px', backdropFilter: 'blur(10px)', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}
                    itemStyle={{ color: '#fff' }}
                    formatter={(value) => activeSubTab === 'consolidado' || activeSubTab === 'gmm' ? fmtPesos(value) : formatRawValue(value, activeSubTab)}
                  />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: '15px', fontSize: '0.85rem' }} />
                  <Bar dataKey="cobrado" name="Pagado" stackId="a" fill={activeSubTab === 'gmm' ? '#ffaa00' : 'var(--accent-gold)'} radius={[0, 0, 4, 4]} />
                  <Bar dataKey="pendiente" name="Pendiente" stackId="a" fill="var(--bar-pending-color)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>


        {/* CONTROL DE ANTIGÜEDAD Y PERSISTENCIA DE CARTERA */}
        <div className="glass-card" style={{ padding: '28px', marginTop: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '16px' }}>
            <h3 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.2rem', fontWeight: '700' }}>
              Control de Persistencia y Antigüedad de Cartera ({activeSubTab.toUpperCase()})
            </h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Medido a partir de la Fecha de Emisión</span>
          </div>

          {(() => {
            const { countNew, countOld, valueNew, valueOld, listNew, listOld } = getSubTabAgeBreakdown(activeSubTab);
            const total = countNew + countOld;
            const pctNew = total > 0 ? (countNew / total) * 100 : 0;
            const pctOld = total > 0 ? (countOld / total) * 100 : 0;
            
            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
                {/* 13 Meses o Menos */}
                <div 
                  className="glass-card stat-widget" 
                  onClick={() => setDrillDown({ title: `Cartera Nueva (≤ 13 Meses) - ${activeSubTab.toUpperCase()}`, list: listNew })}
                  style={{ padding: '24px', border: '1px solid rgba(5, 150, 105, 0.2)', cursor: 'pointer', position: 'relative', overflow: 'hidden' }}
                >
                  <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: '#059669' }}></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', textTransform: 'uppercase', fontWeight: '600', margin: '0 0 8px 0' }}>
                        Pólizas Nuevas (Primeros 13 Meses)
                      </p>
                      <p style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#059669', margin: 0 }}>
                        {activeSubTab === 'consolidado' || activeSubTab === 'gmm' ? fmtPesos(valueNew) : formatRawValue(valueNew, activeSubTab)}
                      </p>
                    </div>
                    <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#059669', background: 'rgba(5, 150, 105, 0.1)', padding: '6px 12px', borderRadius: '20px' }}>
                      {countNew} ({Math.round(pctNew)}%)
                    </span>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '12px', lineHeight: '1.4', whiteSpace: 'normal' }}>
                    Negocios en periodo crítico de primer año. Requieren alta atención para garantizar su persistencia.
                  </p>
                  <p style={{ fontSize: '0.7rem', color: '#059669', marginTop: '14px', margin: '14px 0 0 0', textAlign: 'right' }}>Ver desglose</p>
                </div>

                {/* 14 Meses o Más */}
                <div 
                  className="glass-card stat-widget" 
                  onClick={() => setDrillDown({ title: `Cartera Consolidada (≥ 14 Meses) - ${activeSubTab.toUpperCase()}`, list: listOld })}
                  style={{ padding: '24px', border: '1px solid rgba(37, 99, 235, 0.2)', cursor: 'pointer', position: 'relative', overflow: 'hidden' }}
                >
                  <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: '#1e40af' }}></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', textTransform: 'uppercase', fontWeight: '600', margin: '0 0 8px 0' }}>
                        Cartera Conservada (14+ Meses)
                      </p>
                      <p style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#1e40af', margin: 0 }}>
                        {activeSubTab === 'consolidado' || activeSubTab === 'gmm' ? fmtPesos(valueOld) : formatRawValue(valueOld, activeSubTab)}
                      </p>
                    </div>
                    <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#1e40af', background: 'rgba(37, 99, 235, 0.1)', padding: '6px 12px', borderRadius: '20px' }}>
                      {countOld} ({Math.round(pctOld)}%)
                    </span>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '12px', lineHeight: '1.4', whiteSpace: 'normal' }}>
                    Pólizas consolidadas y recurrentes. Representan la base sólida e ingresos recurrentes del negocio.
                  </p>
                  <p style={{ fontSize: '0.7rem', color: '#1e40af', marginTop: '14px', margin: '14px 0 0 0', textAlign: 'right' }}>Ver desglose</p>
                </div>
              </div>
            );
          })()}
        </div>

      </div>

      {/* HISTORIAL DE CIERRES */}
      {!data.isSnapshot && data.snapshots?.length > 0 && (
        <div className="glass-card" style={{ marginTop: '40px', padding: '24px' }}>
          <h3 style={{ marginBottom: '20px', color: 'var(--accent-gold)', fontWeight: '700' }}>Historial de Cierres (Fotos Archivadas)</h3>
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
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#dc2626',
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
                    e.currentTarget.style.background = '#dc2626';
                    e.currentTarget.style.color = 'white';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                    e.currentTarget.style.color = '#dc2626';
                  }}
                  title="Eliminar Cierre"
                >
                  Eliminar
                </button>
                <p style={{ fontWeight: 'bold', color: 'var(--accent-gold)', margin: 0, paddingRight: '24px' }}>{s.month}/{s.year}</p>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-dim)', margin: '4px 0 0 0' }}>Cerrado: {new Date(s.date).toLocaleDateString()}</p>
                <p style={{ fontSize: '0.95rem', margin: '8px 0 0 0', fontWeight: 'bold' }}>{fmtPesos(s.kpis.collectedMXN || s.kpis.collected)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>

      {/* MODAL DE DESGLOSE DRILL-DOWN */}
      {drillDown && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(6px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000, padding: '40px' }}>
          <div className="glass-card animate-up" style={{ width: '100%', maxWidth: '1050px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: '32px', background: '#ffffff', color: '#0f172a', border: '1px solid #cbd5e1', boxShadow: '0 20px 40px rgba(15,23,42,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid #e2e8f0', paddingBottom: '16px' }}>
              <h2 style={{ fontSize: '1.5rem', margin: 0, color: '#0f172a', fontWeight: '700' }}>
                {drillDown.title} <span style={{ fontSize: '1rem', color: '#64748b', fontWeight: 'normal' }}>({drillDown.list.length} registros)</span>
              </h2>
              <button 
                onClick={() => setDrillDown(null)}
                style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#0f172a', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                ✕ Cerrar
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 10 }}>
                  <tr style={{ borderBottom: '2px solid #cbd5e1' }}>
                    <th style={{ padding: '12px 8px', color: '#334155', fontSize: '0.85rem', textTransform: 'uppercase' }}>Contratante</th>
                    <th style={{ padding: '12px 8px', color: '#334155', fontSize: '0.85rem', textTransform: 'uppercase' }}>Póliza</th>
                    <th style={{ padding: '12px 8px', color: '#334155', fontSize: '0.85rem', textTransform: 'uppercase' }}>Ramo / Plan</th>
                    <th style={{ padding: '12px 8px', color: '#334155', fontSize: '0.85rem', textTransform: 'uppercase' }}>Emisión</th>
                    <th style={{ padding: '12px 8px', color: '#334155', fontSize: '0.85rem', textTransform: 'uppercase' }}>Antigüedad</th>
                    <th style={{ padding: '12px 8px', color: '#334155', fontSize: '0.85rem', textTransform: 'uppercase' }}>Pago / Frecuencia</th>
                    <th style={{ padding: '12px 8px', color: '#334155', fontSize: '0.85rem', textTransform: 'uppercase' }}>Monto Original</th>
                    <th style={{ padding: '12px 8px', color: '#334155', fontSize: '0.85rem', textTransform: 'uppercase', textAlign: 'right' }}>Equiv. Pesos MXN</th>
                  </tr>
                </thead>
                <tbody>
                  {drillDown.list.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>No hay datos para mostrar en este periodo o segmento.</td>
                    </tr>
                  ) : drillDown.list.map((c, i) => {
                    const isAnnulled = c.status === 'Anulada';
                    const isPortfolioModal = drillDown.title.includes('Cartera') || drillDown.title.includes('Valor Total');
                    
                    let displayVal = c.premium || 0;
                    if (isPortfolioModal) {
                      let divisor = 1;
                      const freq = String(c.paymentFrequency || 'ANUAL').toUpperCase().trim();
                      if (freq.includes('MENS')) divisor = 12;
                      else if (freq.includes('TRIM')) divisor = 4;
                      else if (freq.includes('SEME')) divisor = 2;
                      displayVal = (c.annualPremium && c.annualPremium > 0) ? c.annualPremium : ((c.premium || 0) * divisor);
                    }

                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #e2e8f0', transition: 'background 0.2s', opacity: isAnnulled ? 0.4 : 1 }}>
                        <td style={{ padding: '14px 8px', fontWeight: '600', textDecoration: isAnnulled ? 'line-through' : 'none' }}>{c.contractor}</td>
                        <td style={{ padding: '14px 8px', color: '#1e40af', fontWeight: 'bold', textDecoration: isAnnulled ? 'line-through' : 'none' }}>{c.policyNumber}</td>
                        <td style={{ padding: '14px 8px', fontSize: '0.85rem', textDecoration: isAnnulled ? 'line-through' : 'none' }}>
                          <span style={{ 
                            fontSize: '0.75rem', 
                            background: 'rgba(37, 99, 235, 0.1)', 
                            color: '#1e40af', 
                            padding: '2px 8px', 
                            borderRadius: '10px', 
                            fontWeight: 'bold',
                            marginRight: '6px'
                          }}>
                            {c.product || 'Automotriz'}
                          </span>
                          <span style={{ color: '#64748b', fontSize: '0.8rem' }}>{c.planType || 'N/A'}</span>
                        </td>
                        <td style={{ padding: '14px 8px', fontSize: '0.85rem', color: '#64748b', textDecoration: isAnnulled ? 'line-through' : 'none' }}>{c.emissionDate || 'N/A'}</td>
                        <td style={{ padding: '14px 8px', fontSize: '0.85rem' }}>
                          {(() => {
                            const age = calculatePolicyAgeInMonths(c.emissionDate);
                            const isNewPolicy = age <= 13;
                            if (isAnnulled) return <span style={{ color: '#64748b' }}>ANULADA</span>;
                            return (
                              <span style={{ 
                                fontSize: '0.75rem', 
                                background: isNewPolicy ? 'rgba(5, 150, 105, 0.1)' : 'rgba(37, 99, 235, 0.1)', 
                                color: isNewPolicy ? '#059669' : '#1e40af', 
                                padding: '2px 8px', 
                                borderRadius: '6px', 
                                fontWeight: 'bold'
                              }}>
                                {formatAgeInYearsAndMonths(age)}
                              </span>
                            );
                          })()}
                        </td>
                        <td style={{ padding: '14px 8px', fontSize: '0.85rem' }}>
                          {c.status === 'Pagada' ? (
                            <span style={{ color: '#059669', fontWeight: '600' }}>Pagado el {c.paymentDate}</span>
                          ) : (
                            <span style={{ color: isAnnulled ? '#64748b' : '#dc2626', fontWeight: isAnnulled ? 'normal' : 'bold' }}>{isAnnulled ? 'Anulada' : 'Pendiente'}</span>
                          )}
                          <br />
                          <span style={{ color: '#64748b', fontSize: '0.75rem' }}>Frecuencia: {c.paymentFrequency || 'MENSUAL'}</span>
                          {!isAnnulled && c.status !== 'Pagada' && c.collectionDate && (
                            (() => {
                              const dueDate = new Date(c.collectionDate + 'T00:00:00');
                              const today = new Date();
                              today.setHours(0,0,0,0);
                              dueDate.setHours(0,0,0,0);
                              if (today > dueDate) {
                                const diffTime = today - dueDate;
                                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                                const daysLeft = Math.max(0, 30 - diffDays);
                                return (
                                  <div style={{ color: '#dc2626', fontSize: '0.72rem', fontWeight: 'bold', marginTop: '6px', padding: '4px 8px', background: 'rgba(220,38,38,0.08)', borderRadius: '4px', border: '1px solid rgba(220,38,38,0.15)', display: 'inline-block' }}>
                                    Aviso: {diffDays}d atraso. {daysLeft}d p/ cancelar.
                                  </div>
                                );
                              }
                              return null;
                            })()
                          )}
                        </td>
                        <td style={{ padding: '14px 8px', fontWeight: '600', color: '#0f172a', textDecoration: isAnnulled ? 'line-through' : 'none' }}>
                          {formatRawValue(displayVal, c.currency)}
                        </td>
                        <td style={{ padding: '14px 8px', fontWeight: 'bold', color: 'var(--accent-gold)', textAlign: 'right', textDecoration: isAnnulled ? 'line-through' : 'none' }}>
                          {fmtPesos(convertAmount(displayVal, c.currency))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Analytics;
