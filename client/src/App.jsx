import React, { useState, useEffect, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import Clients from './views/Clients';
import Analytics from './views/Analytics';
import TemplatesPanel from './views/TemplatesPanel';
import Prospects from './views/Prospects';
import novarisLogo from './assets/logo.png';
import ambrizLogo from './assets/ambriz_logo.png';

// Branding por despacho (multi-tenant) — mismo dominio, mismo login, distinta identidad visual.
const COMPANY_BRANDING = {
  ambriz: {
    logo: ambrizLogo,
    logoAlt: 'Ambriz & Dávalos',
    sidebarTitle: 'AMBRIZ CRM',
    sidebarSubtitle: 'SEGUROS DE VIDA Y GMM',
    pageTitle: 'CRM AMBRIZ & DÁVALOS',
  },
  novaris: {
    logo: novarisLogo,
    logoAlt: 'Novaris',
    sidebarTitle: 'NOVARIS CRM',
    sidebarSubtitle: 'SEGUROS DE AUTO',
    pageTitle: 'NOVARIS CRM | Seguros de Auto',
  },
};



// ======================================
// CONTEXTO DE AUTENTICACIÓN
// ======================================
const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('crm_token'));

  useEffect(() => {
    if (token) {
      // Verificar que el token es válido haciendo una petición
      fetch('/api/dashboard', {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(res => {
        if (!res.ok) throw new Error('Token inválido');
        return res.json();
      })
      .then(data => {
        if (data.user) {
          setUser(data.user);
          localStorage.setItem('crm_user', JSON.stringify(data.user));
        } else {
          const savedUser = JSON.parse(localStorage.getItem('crm_user'));
          if (savedUser) setUser(savedUser);
          else logout();
        }
      })
      .catch(() => logout());
    }
  }, []);

  const login = async (email, password) => {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('crm_token', data.token);
    localStorage.setItem('crm_user', JSON.stringify(data.user));
    return data.user;
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('crm_token');
    localStorage.removeItem('crm_user');
  };

  const authFetch = (url, options = {}) => {
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`
      }
    });
  };

  return (
    <AuthContext.Provider value={{ user, setUser, token, login, logout, authFetch }}>
      {children}
    </AuthContext.Provider>
  );
};

// ======================================
// PANTALLA DE LOGIN
// ======================================
const LoginPage = ({ theme, toggleTheme }) => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-deep)',
      position: 'relative',
      padding: '24px'
    }}>
      {/* Botón de tema claro/oscuro flotante */}
      <button
        onClick={toggleTheme}
        type="button"
        style={{
          position: 'absolute',
          top: '24px',
          right: '24px',
          width: '44px',
          height: '44px',
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--glass-border)',
          color: 'var(--text-main)',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          fontSize: '1.2rem',
          boxShadow: 'var(--glass-shadow)',
          transition: 'all 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
          zIndex: 10
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.borderColor = 'var(--accent-gold)'; e.currentTarget.style.transform = 'scale(1.05)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'var(--glass-border)'; e.currentTarget.style.transform = 'scale(1)'; }}
        title="Cambiar Tema"
      >
        {theme === 'light' ? '☀️' : '🌙'}
      </button>

      <div className="glass-card animate-up" style={{ width: '420px', padding: '48px', textAlign: 'center', border: '1px solid var(--glass-border)' }}>
        {/* Ícono genérico: el login es una pantalla compartida entre despachos,
            así que no lleva logo ni nombre de marca. El logo y nombre del
            despacho correspondiente aparecen recién después de autenticarse
            (ver COMPANY_BRANDING / useEffect de data-company más abajo). */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
          <div style={{
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(148, 163, 184, 0.1)',
            border: '1px solid var(--glass-border)'
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="10" width="18" height="11" rx="2" />
              <path d="M7 10V7a5 5 0 0 1 10 0v3" />
            </svg>
          </div>
        </div>

        <h1 style={{ fontSize: '1.6rem', marginBottom: '8px', letterSpacing: '1px', color: 'var(--text-main)', fontWeight: '800' }}>
          Iniciar Sesión
        </h1>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: '40px' }}>
          Plataforma de Gestión de Cartera y Cobranza
        </p>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ textAlign: 'left' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '6px', display: 'block' }}>Correo electrónico</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              style={{
                width: '100%',
                padding: '14px 16px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--glass-border)',
                borderRadius: '10px',
                color: 'var(--text-main)',
                fontSize: '0.95rem',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'all 0.3s'
              }}
              onFocus={(e) => e.target.style.borderColor = 'var(--accent-gold)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--glass-border)'}
            />
          </div>

          <div style={{ textAlign: 'left' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '6px', display: 'block' }}>Contraseña</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  paddingRight: '48px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '10px',
                  color: 'var(--text-main)',
                  fontSize: '0.95rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'all 0.3s'
                }}
                onFocus={(e) => e.target.style.borderColor = 'var(--accent-gold)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--glass-border)'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '14px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-dim)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '4px',
                  transition: 'color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-gold)'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-dim)'}
              >
                {showPassword ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error && (
            <p style={{ color: '#ff4444', fontSize: '0.85rem', textAlign: 'left' }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
            style={{ marginTop: '8px', fontSize: '1rem', padding: '14px' }}
          >
            {loading ? 'Verificando...' : 'Acceder'}
          </button>
        </form>
      </div>
    </div>
  );
};

// ======================================
// COMPONENTES INTERNOS
// ======================================
const StatWidget = ({ title, value, subValue, trend, type = 'gold' }) => (
  <div className="glass-card stat-widget animate-up">
    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '8px' }}>{title}</p>
    <h2 style={{ fontSize: '2rem', marginBottom: '4px' }}>
      {type === 'gold' ? <span className="text-gradient-gold">{value}</span> : value}
    </h2>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: '0.85rem', color: trend > 0 ? 'var(--accent-mint)' : trend < 0 ? '#ff4444' : 'var(--text-dim)' }}>
        {trend > 0 ? '↑' : trend < 0 ? '↓' : '–'} {Math.abs(trend)}% este mes
      </span>
      <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{subValue}</span>
    </div>
  </div>
);

const Dashboard = () => {
  const { user, authFetch } = useAuth();
  const isAmbriz = user?.company === 'ambriz';
  const [data, setData] = useState(null);
  const [rates, setRates] = useState({ USD: 17.50, UDI: 8.25, lastUpdated: null });
  const [dashboardTab, setDashboardTab] = useState('Vida'); // 'Vida' or 'GMM'
  const [payModalData, setPayModalData] = useState(null);
  const [paymentDateStr, setPaymentDateStr] = useState(new Date().toISOString().slice(0, 10));
  const [fullReportModal, setFullReportModal] = useState(null); // 'birthdays', 'anniversaries', or 'collected'

  const fetchDashboard = () => {
    authFetch('/api/dashboard')
      .then(res => res.json())
      .then(d => setData(d))
      .catch(err => console.error(err));
  };

  const fetchRates = () => {
    authFetch('/api/rates')
      .then(res => res.json())
      .then(r => setRates(r))
      .catch(err => console.error(err));
  };

  useEffect(() => {
    fetchDashboard();
    fetchRates();
  }, []);

  const handleMarkPaid = async (e) => {
    e.preventDefault();
    if(!payModalData) return;
    try {
      const res = await authFetch(`/api/clients/${payModalData.id}/pay`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentDate: paymentDateStr })
      });
      if(res.ok) {
        setPayModalData(null);
        fetchDashboard();
      }
    } catch(err) {
      console.error(err);
    }
  };

  if (!data) return <div style={{ textAlign: 'center', marginTop: '100px', color: 'var(--text-dim)' }}>Cargando tu información...</div>;

  const firstName = user.name.split(' ')[0];
  const nextMonthDateObj = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);
  const nextMonthLabel = nextMonthDateObj.toLocaleString('es-MX', { month: 'long' }).replace(/^./, c => c.toUpperCase());
  const fmt = (n) => '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtCurrency = (n, curr) => {
    if (curr === 'USD') return `USD ${n.toLocaleString('en-US')}`;
    if (curr === 'UDI') return `${n.toLocaleString('es-MX')} UDI`;
    return fmt(n);
  };

  const handleWhatsAppReminder = (c, title) => {
    let planName = c.planType || c.product || (isAmbriz ? (dashboardTab === 'Vida' ? 'Vida' : 'Gastos Médicos Mayores') : 'Automotriz');
    if (planName.includes('(')) {
      planName = planName.split('(')[0].trim();
    }
    
    // Formatear monto
    let formattedMonto = '';
    if (c.currency === 'USD') {
      formattedMonto = `USD ${c.amount.toLocaleString('en-US')}`;
    } else if (c.currency === 'UDI') {
      formattedMonto = `${c.amount.toLocaleString('es-MX')} UDI`;
    } else {
      formattedMonto = `${c.amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })} MXN`;
    }

    const freq = (c.paymentFrequency || 'MENSUAL').toUpperCase();
    const dateStr = c.collectionDate || 'la fecha correspondiente';

    const DEFAULT_TEMPLATES = {
      atraso: "Hola {Nombre}, espero que te encuentres muy bien. Te contacto de manera atenta para comentarte que tu póliza de *{Plan}* (No. *{Poliza}*) presenta un atraso de *{Dias}* en su pago programado.\n\nEl monto pendiente es de *{Monto}* con frecuencia de pago *{Frecuencia}*. Te comparto este aviso para poder regularizar tu cuenta a la brevedad y garantizar que tu protección siga completamente activa y sin interrupciones. Estoy a tu entera disposición si requieres apoyo con las formas de pago. ¡Saludos afectuosos!",
      mes: "Hola {Nombre}, ¡qué gusto saludarte! Te contacto con buena anticipación para comentarte que en un mes, el día *{Fecha}*, corresponde el cobro programado de tu póliza de *{Plan}* (No. *{Poliza}*).\n\nEl monto a cubrir es de *{Monto}* con frecuencia de pago *{Frecuencia}*. Nos gusta avisarte con tiempo para que puedas programarlo con total tranquilidad en tus presupuestos mensuales. ¡Que tengas un excelente día!",
      quinceDias: "Estimado(a) {Nombre}, espero que te encuentres muy bien. Te envío este breve recordatorio: en 15 días corresponde el pago de tu protección de *{Plan}* (Póliza *{Poliza}*).\n\nEl importe correspondiente es de *{Monto}* (Frecuencia: *{Frecuencia}*). Recuerda que estoy a tu entera disposición si requieres apoyo con los métodos de pago autorizados. ¡Saludos afectuosos!",
      cincoDias: "Hola {Nombre}, espero que estés teniendo una excelente semana. Te escribo para recordarte que el pago de tu póliza de *{Plan}* (No. *{Poliza}*) está próximo a vencer en 5 días.\n\nEl monto a cubrir es de *{Monto}* y tu frecuencia de pago es *{Frecuencia}*. Te comparto este aviso para que mantengamos tu protección y la de tu familia siempre activas y sin ningún contratiempo. ¡Quedo a tus órdenes si tienes alguna duda!",
      hoy: "Estimado(a) {Nombre}, gusto en saludarte. Te contacto para informarte que el día de hoy corresponde realizar el cobro programado de tu póliza de *{Plan}* (No. *{Poliza}*).\n\nEl monto correspondiente es de *{Monto}* (*{Frecuencia}*). Para tu comodidad y asegurar la continuidad de tus beneficios sin interrupciones, quedo al pendiente en este chat para recibir tu comprobante de pago o apoyarte en la transacción. ¡Muchas gracias por tu confianza!"
    };

    const saved = localStorage.getItem('crm_message_templates');
    const templates = saved ? JSON.parse(saved) : DEFAULT_TEMPLATES;

    let rawTemplate = '';
    if (c.days < 0) {
      rawTemplate = templates.atraso || DEFAULT_TEMPLATES.atraso;
    } else if (title === 'En 1 mes') {
      rawTemplate = templates.mes || DEFAULT_TEMPLATES.mes;
    } else if (title === 'En 15 días') {
      rawTemplate = templates.quinceDias || DEFAULT_TEMPLATES.quinceDias;
    } else if (title === 'En 5 días') {
      rawTemplate = templates.cincoDias || DEFAULT_TEMPLATES.cincoDias;
    } else {
      rawTemplate = templates.hoy || DEFAULT_TEMPLATES.hoy;
    }

    const delayDays = Math.abs(c.days);
    const delayDaysStr = `${delayDays} ${delayDays === 1 ? 'día' : 'días'}`;

    let template = rawTemplate
      .replace(/{Nombre}/g, c.name)
      .replace(/{Plan}/g, planName)
      .replace(/{Poliza}/g, c.policyNumber)
      .replace(/{Monto}/g, formattedMonto)
      .replace(/{Frecuencia}/g, freq)
      .replace(/{Dias}/g, delayDaysStr)
      .replace(/{Fecha}/g, dateStr);

    // Copiar al portapapeles
    navigator.clipboard.writeText(template)
      .then(() => {
        const toast = document.createElement('div');
        toast.textContent = '📋 ¡Recordatorio copiado al portapapeles!';
        toast.style.position = 'fixed';
        toast.style.bottom = '24px';
        toast.style.right = '24px';
        toast.style.background = 'var(--accent-mint)';
        toast.style.color = '#000';
        toast.style.padding = '12px 24px';
        toast.style.borderRadius = '8px';
        toast.style.fontWeight = 'bold';
        toast.style.boxShadow = '0 4px 15px rgba(0,255,170,0.3)';
        toast.style.zIndex = '9999';
        toast.style.transition = 'all 0.3s';
        document.body.appendChild(toast);
        setTimeout(() => {
          toast.style.opacity = '0';
          setTimeout(() => toast.remove(), 300);
        }, 2500);
      })
      .catch(err => console.error('Error al copiar:', err));


  };

  // Filtrado de listas: para Ambriz, separa Vida de GMM según dashboardTab
  // (mismo criterio que Analytics.jsx: product default 'Vida', GMM detectado
  // por substring). Novaris no tiene este split, se queda sin filtrar.
  const filterList = (list) => {
    if (!list) return [];
    if (!isAmbriz) return list;
    return list.filter(c => {
      const prod = String(c.product || 'Vida').trim().toLowerCase();
      const isGMM = prod.includes('gastos') || prod.includes('gmm') || prod.includes('médicos');
      return dashboardTab === 'Vida' ? !isGMM : isGMM;
    });
  };

  const currentLists = {
    atrasados: filterList(data.upcomingLists?.atrasados),
    hoy: filterList(data.upcomingLists?.hoy),
    en5Dias: filterList(data.upcomingLists?.en5Dias),
    en15Dias: filterList(data.upcomingLists?.en15Dias),
    enMes: filterList(data.upcomingLists?.enMes),
    collected: filterList(data.collectedList)
  };

  const totalAlerts = (currentLists.atrasados?.length || 0) + (currentLists.hoy?.length || 0) + (currentLists.en5Dias?.length || 0) + (currentLists.en15Dias?.length || 0) + (currentLists.enMes?.length || 0);

  // KPIs por pestaña: Novaris consolida todo en MXN; Ambriz desglosa por
  // moneda real del cliente (USD/UDI en Vida, MXN en GMM) — currentLists ya
  // viene filtrado por ramo arriba, así que aquí solo se suma por moneda.
  const getTabKPIs = () => {
    if (!isAmbriz) {
      const stats = { MXN: { paid: 0, pend: 0, late: 0 } };
      currentLists.collected?.forEach(c => { stats.MXN.paid += (c.amount || 0); });
      [...currentLists.hoy, ...currentLists.en5Dias, ...currentLists.en15Dias, ...currentLists.enMes].forEach(c => {
        stats.MXN.pend += (c.amount || 0);
      });
      currentLists.atrasados?.forEach(c => { stats.MXN.late += (c.amount || 0); });
      return stats;
    }

    if (dashboardTab === 'Vida') {
      const vidaStats = { USD: { paid: 0, pend: 0, late: 0 }, UDI: { paid: 0, pend: 0, late: 0 } };
      const addTo = (bucket, c) => { if (vidaStats[c.currency]) vidaStats[c.currency][bucket] += (c.amount || 0); };
      currentLists.collected?.forEach(c => addTo('paid', c));
      [...currentLists.hoy, ...currentLists.en5Dias, ...currentLists.en15Dias, ...currentLists.enMes].forEach(c => addTo('pend', c));
      currentLists.atrasados?.forEach(c => addTo('late', c));
      return vidaStats;
    }

    const gmmStats = { MXN: { paid: 0, pend: 0, late: 0 } };
    currentLists.collected?.forEach(c => { gmmStats.MXN.paid += (c.amount || 0); });
    [...currentLists.hoy, ...currentLists.en5Dias, ...currentLists.en15Dias, ...currentLists.enMes].forEach(c => {
      gmmStats.MXN.pend += (c.amount || 0);
    });
    currentLists.atrasados?.forEach(c => { gmmStats.MXN.late += (c.amount || 0); });
    return gmmStats;
  };

  const tabKPIs = getTabKPIs();

  const renderClientList = (clientsList, title, emptyMsg, titleColor = 'var(--text-main)') => (
    <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', height: '420px', padding: '20px' }}>
      <h4 style={{ color: titleColor, marginBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px', flexShrink: 0 }}>
        {title} ({clientsList.length})
      </h4>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingRight: '4px' }}>
        {clientsList.length === 0 ? (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{emptyMsg}</p>
        ) : (
          clientsList.map((c, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', borderLeft: `2px solid ${titleColor}` }}>
              <p style={{ fontWeight: '600', fontSize: '0.9rem', marginBottom: '4px' }}>{c.name}</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '8px', lineHeight: '1.4' }}>
                Póliza: <span style={{ color: 'var(--accent-gold)' }}>{c.policyNumber}</span><br/>
                Frecuencia: <span style={{ color: 'var(--accent-mint)', fontWeight: 'bold' }}>{c.paymentFrequency || 'MENSUAL'}</span><br/>
                Cobro: <span style={{ color: 'var(--text-main)' }}>{c.collectionDate || 'Mensual'}</span>
              </p>
              {c.days < 0 && (
                (() => {
                  const diffDays = Math.abs(c.days);
                  const daysLeft = Math.max(0, 30 - diffDays);
                  return (
                    <div style={{ color: '#dc2626', fontSize: '0.72rem', fontWeight: 'bold', margin: '4px 0 8px 0', padding: '6px 10px', background: 'rgba(220,38,38,0.08)', borderRadius: '6px', border: '1px solid rgba(220,38,38,0.15)', lineHeight: '1.3' }}>
                      Aviso: {diffDays} {diffDays === 1 ? 'día' : 'días'} de atraso. Quedan {daysLeft} {daysLeft === 1 ? 'día' : 'días'} para cancelarse.
                    </div>
                  );
                })()
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontWeight: 'bold', fontSize: '1.1rem', color: titleColor }}>
                    {fmtCurrency(c.amount, c.currency)}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button 
                    onClick={() => { setPayModalData(c); setPaymentDateStr(new Date().toISOString().slice(0, 10)); }}
                    style={{ 
                      fontSize: '0.7rem', 
                      color: 'var(--accent-mint)', 
                      background: 'rgba(5, 150, 105, 0.1)', 
                      border: '1px solid rgba(5, 150, 105, 0.2)', 
                      padding: '6px 10px', 
                      borderRadius: '6px', 
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontWeight: 'bold',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(5, 150, 105, 0.2)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(5, 150, 105, 0.1)'; }}
                  >
                    Pagado
                  </button>
                  <button 
                    onClick={() => handleWhatsAppReminder(c, title)}
                    style={{ 
                      fontSize: '0.7rem', 
                      color: 'var(--accent-gold)', 
                      background: 'rgba(37, 99, 235, 0.08)', 
                      border: '1px solid rgba(37, 99, 235, 0.2)', 
                      padding: '6px 10px', 
                      borderRadius: '6px', 
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontWeight: 'bold',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(37, 99, 235, 0.15)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(37, 99, 235, 0.08)'; }}
                  >
                    Recordar
                  </button>
                </div>
              </div>
              {c.days < 0 && (
                <p style={{ fontSize: '0.7rem', color: '#dc2626', marginTop: '6px' }}>Atrasado por {Math.abs(c.days)} días</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );

  // Tarjeta de KPIs por moneda (Pagado/Pendiente/Atrasado) — usada por el
  // Dashboard de Ambriz para Vida (Dólares, UDI) y GMM (Pesos).
  const renderCurrencyCard = (title, badge, stats, currency, maxWidth) => (
    <div className="glass-card stat-widget animate-up" style={{ flex: 1, maxWidth, padding: '32px', minHeight: '220px', display: 'flex', flexDirection: 'column', justifyContent: 'center', border: '1px solid var(--glass-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--accent-gold)', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#000', fontSize: '1rem', fontWeight: 'bold' }}>{badge}</div>
        <h3 style={{ fontSize: '1.2rem', color: 'var(--text-main)', fontWeight: '700' }}>{title}</h3>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
        <div style={{ padding: '20px', background: 'rgba(5, 150, 105, 0.08)', borderRadius: '16px', border: '1px solid rgba(5, 150, 105, 0.2)', textAlign: 'center' }}>
          <p style={{ color: 'var(--accent-mint)', fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '8px' }}>Pagado</p>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--text-main)' }}>{fmtCurrency(stats.paid, currency)}</h2>
          {currency !== 'MXN' && <p style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '4px' }}>≈ {fmt(stats.paid * (currency === 'USD' ? rates.USD : rates.UDI))} MXN</p>}
        </div>
        <div style={{ padding: '20px', background: 'rgba(37, 99, 235, 0.06)', borderRadius: '16px', border: '1px solid rgba(37, 99, 235, 0.2)', textAlign: 'center' }}>
          <p style={{ color: 'var(--accent-gold)', fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '8px' }}>Pendiente</p>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--text-main)' }}>{fmtCurrency(stats.pend, currency)}</h2>
          {currency !== 'MXN' && <p style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '4px' }}>≈ {fmt(stats.pend * (currency === 'USD' ? rates.USD : rates.UDI))} MXN</p>}
        </div>
        <div style={{ padding: '20px', background: 'rgba(239, 68, 68, 0.08)', borderRadius: '16px', border: '1px solid rgba(239, 68, 68, 0.2)', textAlign: 'center' }}>
          <p style={{ color: '#ef4444', fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '8px' }}>Atrasado</p>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#ef4444' }}>{fmtCurrency(stats.late, currency)}</h2>
          {currency !== 'MXN' && <p style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '4px' }}>≈ {fmt(stats.late * (currency === 'USD' ? rates.USD : rates.UDI))} MXN</p>}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <header style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '20px' }}>
        <div>
          <h1 style={{ fontSize: '2.5rem', fontWeight: '800', color: 'var(--text-main)' }}>Hola, <span className="text-gradient-gold">{firstName}.</span></h1>
          <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>
            Tienes <span style={{ color: 'var(--accent-gold)', fontWeight: 'bold' }}>{totalAlerts} cobranzas activas</span> en tu {isAmbriz ? `dashboard de ${dashboardTab}` : 'panel de Seguros de Auto'}.
          </p>
        </div>

        {/* Robot Financiero (tipo de cambio) — solo aplica a Ambriz, que maneja UDI/USD */}
        {isAmbriz && (
          <div style={{ display: 'flex', gap: '16px' }}>
            <div className="glass-card" style={{ padding: '10px 16px', textAlign: 'center', border: '1px solid var(--accent-gold-glow)' }}>
              <p style={{ fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '4px' }}>Dólar (USD)</p>
              <p style={{ fontWeight: 'bold', color: 'var(--accent-gold)', fontSize: '1rem' }}>${rates.USD.toFixed(2)}</p>
            </div>
            <div className="glass-card" style={{ padding: '10px 16px', textAlign: 'center', border: '1px solid var(--accent-gold-glow)' }}>
              <p style={{ fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '4px' }}>UDI</p>
              <p style={{ fontWeight: 'bold', color: 'var(--accent-gold)', fontSize: '1rem' }}>${rates.UDI.toFixed(4)}</p>
            </div>
          </div>
        )}
      </header>

      {/* Selector Dashboard VIDA / GMM — exclusivo Ambriz */}
      {isAmbriz && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '32px', background: 'rgba(128,128,128,0.1)', padding: '6px', borderRadius: '12px', width: 'fit-content' }}>
          <button
            onClick={() => setDashboardTab('Vida')}
            style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: dashboardTab === 'Vida' ? 'var(--accent-gold)' : 'transparent', color: dashboardTab === 'Vida' ? '#000000' : 'var(--text-main)', fontWeight: 'bold', cursor: 'pointer', transition: '0.3s' }}
          >
            ☂️ Dashboard VIDA
          </button>
          <button
            onClick={() => setDashboardTab('GMM')}
            style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: dashboardTab === 'GMM' ? 'var(--accent-gold)' : 'transparent', color: dashboardTab === 'GMM' ? '#000000' : 'var(--text-main)', fontWeight: 'bold', cursor: 'pointer', transition: '0.3s' }}
          >
            🏥 Dashboard GMM
          </button>
        </div>
      )}

      {/* Tarjetas KPIs: Ambriz desglosa por moneda (Dólares/UDI en Vida, Pesos en
          GMM); Novaris se queda con la tarjeta única consolidada en MXN. */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '32px', marginBottom: '48px', flexWrap: 'wrap' }}>
        {isAmbriz ? (
          dashboardTab === 'Vida' ? (
            <>
              {renderCurrencyCard('Cobranza VIDA (Dólares)', '$', tabKPIs.USD, 'USD')}
              {renderCurrencyCard('Cobranza VIDA (UDI)', 'UDI', tabKPIs.UDI, 'UDI')}
            </>
          ) : (
            renderCurrencyCard('Resumen de Cobranza GMM (Pesos)', '🏥', tabKPIs.MXN, 'MXN', '800px')
          )
        ) : (
          <div className="glass-card stat-widget animate-up" style={{ flex: 1, maxWidth: '1000px', padding: '32px', minHeight: '220px', display: 'flex', flexDirection: 'column', justifyContent: 'center', border: '1px solid var(--glass-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '1.3rem', color: 'var(--text-main)', fontWeight: '700' }}>Resumen de Cobranza (Seguros de Auto - MXN)</h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
              <div style={{ padding: '24px', background: 'rgba(5, 150, 105, 0.08)', borderRadius: '20px', border: '1px solid rgba(5, 150, 105, 0.2)', textAlign: 'center' }}>
                <p style={{ color: 'var(--accent-mint)', fontSize: '0.85rem', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '8px' }}>Pagado del Mes</p>
                <h2 style={{ fontSize: '2.1rem', fontWeight: '800', color: 'var(--text-main)' }}>{fmt(tabKPIs.MXN.paid)}</h2>
              </div>
              <div style={{ padding: '24px', background: 'rgba(37, 99, 235, 0.06)', borderRadius: '20px', border: '1px solid rgba(37, 99, 235, 0.2)', textAlign: 'center' }}>
                <p style={{ color: 'var(--accent-gold)', fontSize: '0.85rem', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '8px' }}>Cobranza Pendiente</p>
                <h2 style={{ fontSize: '2.1rem', fontWeight: '800', color: 'var(--text-main)' }}>{fmt(tabKPIs.MXN.pend)}</h2>
              </div>
              <div style={{ padding: '24px', background: 'rgba(239, 68, 68, 0.08)', borderRadius: '20px', border: '1px solid rgba(239, 68, 68, 0.2)', textAlign: 'center' }}>
                <p style={{ color: '#ef4444', fontSize: '0.85rem', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '8px' }}>Cobranza Atrasada</p>
                <h2 style={{ fontSize: '2.1rem', fontWeight: '800', color: '#ef4444' }}>{fmt(tabKPIs.MXN.late)}</h2>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sección Cobranza Próxima */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '1.4rem', margin: 0, color: 'var(--text-main)' }}>Cobranza Próxima <span style={{ fontSize: '0.9rem', color: 'var(--text-dim)', fontWeight: 'normal' }}>({isAmbriz ? dashboardTab : 'Autos'})</span></h2>
        <button 
          onClick={() => setFullReportModal('upcoming')}
          style={{ fontSize: '0.8rem', padding: '8px 16px', borderRadius: '8px', background: 'var(--bg-surface)', border: '1px solid var(--glass-border)', color: 'var(--accent-gold)', cursor: 'pointer', fontWeight: '600', transition: 'all 0.3s' }}
        >
          Ver reporte completo
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '40px' }}>
        {renderClientList(currentLists.hoy, 'Hoy', 'Libre por hoy.', '#ffaa00')}
        {renderClientList(currentLists.en5Dias, 'En 5 días', 'Nada en 5 días.', '#e2b042')}
        {renderClientList(currentLists.en15Dias, 'En 15 días', 'Nada en 15 días.')}
        {renderClientList(currentLists.enMes, 'En 1 mes', 'Nada en el mes.')}
      </div>

      {/* Sección Pagos Atrasados */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '1.4rem', margin: 0, color: '#ff4444' }}>Pagos Atrasados <span style={{ fontSize: '0.9rem', color: 'var(--text-dim)', fontWeight: 'normal' }}>({isAmbriz ? dashboardTab : 'Autos'})</span></h2>
      </div>
      <div className="glass-card" style={{ marginBottom: '40px', padding: '24px', border: '1px solid rgba(255, 68, 68, 0.15)' }}>
        {currentLists.atrasados.length === 0 ? (
          <p style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '20px 0' }}>Sin cobros atrasados en este ramo.</p>
        ) : (
          <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <th style={{ padding: '12px 8px', color: 'var(--text-muted)', fontWeight: 'normal' }}>Contratante</th>
                <th style={{ padding: '12px 8px', color: 'var(--text-muted)', fontWeight: 'normal' }}>Póliza</th>
                <th style={{ padding: '12px 8px', color: 'var(--text-muted)', fontWeight: 'normal' }}>Monto Original</th>
                {dashboardTab === 'Vida' && <th style={{ padding: '12px 8px', color: 'var(--text-muted)', fontWeight: 'normal' }}>Equiv. Pesos</th>}
                <th style={{ padding: '12px 8px', color: 'var(--text-muted)', fontWeight: 'normal' }}>Días de Atraso / Alerta</th>
                <th style={{ padding: '12px 8px', color: 'var(--text-muted)', fontWeight: 'normal' }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {currentLists.atrasados.map((c, i) => {
                const diffDays = Math.abs(c.days);
                const daysLeft = Math.max(0, 30 - diffDays);
                return (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '12px 8px', fontWeight: 'bold' }}>{c.name}</td>
                    <td style={{ padding: '12px 8px', color: 'var(--accent-gold)' }}>{c.policyNumber}</td>
                    <td style={{ padding: '12px 8px', fontWeight: 'bold' }}>{fmtCurrency(c.amount, c.currency)}</td>
                    {dashboardTab === 'Vida' && (
                      <td style={{ padding: '12px 8px', color: 'var(--text-dim)', fontSize: '0.9rem' }}>
                        {fmt(c.amount * (c.currency === 'USD' ? rates.USD : rates.UDI))}
                      </td>
                    )}
                    <td style={{ padding: '12px 8px' }}>
                      <span style={{ color: '#ff4444', fontSize: '0.85rem', fontWeight: 'bold' }}>
                        ⚠️ {diffDays} {diffDays === 1 ? 'día' : 'días'} de atraso. Quedan {daysLeft} {daysLeft === 1 ? 'día' : 'días'} para cancelarse.
                      </span>
                    </td>
                    <td style={{ padding: '12px 8px' }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                          onClick={() => { setPayModalData(c); setPaymentDateStr(new Date().toISOString().slice(0, 10)); }}
                          style={{ 
                            fontSize: '0.7rem', 
                            color: 'var(--accent-mint)', 
                            background: 'rgba(0, 200, 83, 0.1)', 
                            border: '1px solid rgba(0, 200, 83, 0.2)', 
                            padding: '6px 10px', 
                            borderRadius: '6px', 
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            transition: 'all 0.2s'
                          }}
                        >
                          Pagado
                        </button>
                        <button 
                          onClick={() => handleWhatsAppReminder(c, 'Atrasados')}
                          style={{ 
                            fontSize: '0.7rem', 
                            color: 'var(--accent-gold)', 
                            background: 'rgba(226, 176, 66, 0.1)', 
                            border: '1px solid rgba(226, 176, 66, 0.2)', 
                            padding: '6px 10px', 
                            borderRadius: '6px', 
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            transition: 'all 0.2s'
                          }}
                        >
                          Recordar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Sección Cobranzas Realizadas */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '1.4rem', margin: 0, color: 'var(--accent-gold)' }}>Cobrado del Mes ({isAmbriz ? dashboardTab : 'Autos'})</h2>
        <button 
          onClick={() => setFullReportModal('collected')}
          style={{ fontSize: '0.8rem', padding: '6px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--accent-gold)', cursor: 'pointer', transition: 'all 0.3s' }}
        >
          📊 Ver reporte completo
        </button>
      </div>
      <div className="glass-card" style={{ marginBottom: '40px', padding: '24px' }}>
        {currentLists.collected.length === 0 ? (
          <p style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '20px 0' }}>Aún no hay pólizas {isAmbriz ? `de ${dashboardTab}` : 'de Autos'} pagadas este mes.</p>
        ) : (
          <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <th style={{ padding: '12px 8px', color: 'var(--text-muted)', fontWeight: 'normal' }}>Contratante</th>
                <th style={{ padding: '12px 8px', color: 'var(--text-muted)', fontWeight: 'normal' }}>Póliza</th>
                <th style={{ padding: '12px 8px', color: 'var(--text-muted)', fontWeight: 'normal' }}>Monto Original</th>
                {dashboardTab === 'Vida' && <th style={{ padding: '12px 8px', color: 'var(--text-muted)', fontWeight: 'normal' }}>Equiv. Pesos</th>}
                <th style={{ padding: '12px 8px', color: 'var(--text-muted)', fontWeight: 'normal' }}>Pagado el</th>
                <th style={{ padding: '12px 8px', color: 'var(--text-muted)', fontWeight: 'normal' }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {currentLists.collected.map((c, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '12px 8px', fontWeight: 'bold' }}>{c.name}</td>
                  <td style={{ padding: '12px 8px', color: 'var(--accent-gold)' }}>{c.policyNumber}</td>
                  <td style={{ padding: '12px 8px', fontWeight: 'bold' }}>{fmtCurrency(c.amount, c.currency)}</td>
                  {dashboardTab === 'Vida' && (
                    <td style={{ padding: '12px 8px', color: 'var(--text-dim)', fontSize: '0.9rem' }}>
                      {fmt(c.amount * (c.currency === 'USD' ? rates.USD : rates.UDI))}
                    </td>
                  )}
                  <td style={{ padding: '12px 8px', color: 'var(--text-main)' }}>{c.paymentDate}</td>
                  <td style={{ padding: '12px 8px' }}>
                    <button 
                      onClick={() => { setPayModalData(c); setPaymentDateStr(c.paymentDate); }}
                      style={{ background: 'none', border: 'none', color: 'var(--accent-gold)', cursor: 'pointer', fontSize: '0.8rem' }}
                    >
                      ✏️ Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Analytics Adicionales (Cumpleaños y Aniversarios) */}
      <div className="glass-card portfolio-widget animate-up" style={{ animationDelay: '0.3s', padding: '24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '1.1rem', margin: 0 }}>🎂 Cumpleaños del Mes</h3>
              <button 
                onClick={() => setFullReportModal('birthdays')}
                style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--accent-gold)', cursor: 'pointer' }}
              >
                🔎 Ver completo
              </button>
            </div>
            <div style={{ maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
               {data.birthdays?.length === 0 ? (
                <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>No hay cumpleaños este mes.</p>
              ) : data.birthdays?.map((b, i) => (
                <div key={i} style={{ padding: '12px 16px', background: 'rgba(226, 176, 66, 0.05)', borderRadius: '12px', border: '1px solid rgba(226, 176, 66, 0.1)', marginBottom: '10px' }}>
                  <p style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{b.name}</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--accent-gold)', margin: '4px 0' }}>{b.type}</p>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Póliza: {b.policy}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '1.1rem', margin: 0 }}>🎉 Aniversarios de Clientes</h3>
              <button 
                onClick={() => setFullReportModal('anniversaries')}
                style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--accent-mint)', cursor: 'pointer' }}
              >
                🔎 Ver completo
              </button>
            </div>
            <div style={{ maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
              {!data.anniversaries || data.anniversaries.length === 0 ? (
                <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>No hay aniversarios este mes.</p>
              ) : data.anniversaries.map((ann, i) => (
                <div key={i} style={{ padding: '12px 16px', background: 'rgba(0, 255, 170, 0.03)', borderRadius: '12px', border: '1px solid rgba(0, 255, 170, 0.1)', marginBottom: '10px' }}>
                  <p style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{ann.name}</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--accent-mint)', margin: '4px 0' }}>🎈 Cumple {ann.years} {ann.years === 1 ? 'año' : 'años'} con nosotros (Día {ann.day})</p>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Póliza: {ann.policy}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Cumpleaños y Aniversarios del PRÓXIMO MES — aviso con anticipación,
          especialmente para quien cumple justo al inicio del mes que sigue,
          que antes no aparecía hasta que ya había arrancado ese mes. */}
      <div className="glass-card portfolio-widget animate-up" style={{ animationDelay: '0.32s', padding: '24px', marginTop: '24px', opacity: 0.9 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
          <div>
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '1.1rem', margin: 0, color: 'var(--text-muted)' }}>🎂 Cumpleaños de {nextMonthLabel}</h3>
            </div>
            <div style={{ maxHeight: '160px', overflowY: 'auto', paddingRight: '4px' }}>
               {!data.birthdaysNextMonth || data.birthdaysNextMonth.length === 0 ? (
                <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>No hay cumpleaños el próximo mes.</p>
              ) : data.birthdaysNextMonth.map((b, i) => (
                <div key={i} style={{ padding: '12px 16px', background: 'rgba(226, 176, 66, 0.03)', borderRadius: '12px', border: '1px dashed rgba(226, 176, 66, 0.15)', marginBottom: '10px' }}>
                  <p style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{b.name}</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--accent-gold)', margin: '4px 0' }}>{b.type}</p>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Póliza: {b.policy}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '1.1rem', margin: 0, color: 'var(--text-muted)' }}>🎉 Aniversarios de {nextMonthLabel}</h3>
            </div>
            <div style={{ maxHeight: '160px', overflowY: 'auto', paddingRight: '4px' }}>
              {!data.anniversariesNextMonth || data.anniversariesNextMonth.length === 0 ? (
                <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>No hay aniversarios el próximo mes.</p>
              ) : data.anniversariesNextMonth.map((ann, i) => (
                <div key={i} style={{ padding: '12px 16px', background: 'rgba(0, 255, 170, 0.02)', borderRadius: '12px', border: '1px dashed rgba(0, 255, 170, 0.15)', marginBottom: '10px' }}>
                  <p style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{ann.name}</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--accent-mint)', margin: '4px 0' }}>🎈 Cumplirá {ann.years} {ann.years === 1 ? 'año' : 'años'} con nosotros (Día {ann.day})</p>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Póliza: {ann.policy}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* MODAL DE PAGO */}
      {payModalData && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="glass-card animate-up" style={{ width: '400px', padding: '32px' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>Confirmar Pago</h2>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginBottom: '24px' }}>
              Registrando el pago de la póliza <span style={{ color: 'var(--accent-gold)' }}>{payModalData.policyNumber}</span> de {payModalData.name}.
            </p>
            <form onSubmit={handleMarkPaid}>
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px' }}>Fecha real de pago</label>
                <input 
                  type="date" 
                  value={paymentDateStr}
                  onChange={(e) => setPaymentDateStr(e.target.value)}
                  required
                  style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: 'var(--text-main)', fontSize: '1rem', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setPayModalData(null)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.2)', color: 'var(--text-main)', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer' }}>Cancelar</button>
                <button type="submit" className="btn-primary">Guardar Pago</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL REPORTE COMPLETO (TABLAS PARA CAPTURAS) */}
      {fullReportModal && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(10,12,18,0.95)', backdropFilter: 'blur(10px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '40px' }}>
          <div className="glass-card animate-up" style={{ width: '90%', maxWidth: '1000px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: '32px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexShrink: 0 }}>
              <div>
                <h2 style={{ fontSize: '1.8rem', fontWeight: '800', letterSpacing: '1px' }}>
                  {fullReportModal === 'birthdays' && '🎂 Reporte de Cumpleaños del Mes'}
                  {fullReportModal === 'anniversaries' && '🎉 Reporte de Aniversarios de Clientes'}
                  {fullReportModal === 'collected' && `📊 Reporte de Cobros Realizados (${isAmbriz ? dashboardTab : 'Autos'})`}
                  {fullReportModal === 'upcoming' && `📅 Reporte de Cobranza Próxima (${isAmbriz ? dashboardTab : 'Autos'})`}
                </h2>
                <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginTop: '4px' }}>
                  Lista completa y organizada para reportes rápidos y capturas de pantalla.
                </p>
              </div>
              <button 
                onClick={() => setFullReportModal(null)} 
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-main)', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                ✖ Cerrar
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', background: 'rgba(255,255,255,0.01)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', padding: '16px' }}>
              {fullReportModal === 'birthdays' && (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid rgba(226, 176, 66, 0.3)', color: 'var(--accent-gold)' }}>
                      <th style={{ padding: '12px' }}>Día</th>
                      <th style={{ padding: '12px' }}>Nombre</th>
                      <th style={{ padding: '12px' }}>Tipo</th>
                      <th style={{ padding: '12px' }}>Póliza Vinculada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.birthdays?.length === 0 ? (
                      <tr><td colSpan="4" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-dim)' }}>No hay cumpleaños este mes.</td></tr>
                    ) : (
                      [...data.birthdays].sort((a,b) => a.day - b.day).map((b, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                          <td style={{ padding: '12px', fontWeight: 'bold', color: 'var(--accent-gold)' }}>{b.day}</td>
                          <td style={{ padding: '12px', fontWeight: '600' }}>{b.name}</td>
                          <td style={{ padding: '12px', color: 'var(--text-main)' }}>{b.type.split(' (')[0]}</td>
                          <td style={{ padding: '12px', color: 'var(--text-dim)' }}>{b.policy}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {fullReportModal === 'anniversaries' && (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid rgba(0, 255, 170, 0.3)', color: 'var(--accent-mint)' }}>
                      <th style={{ padding: '12px' }}>Día</th>
                      <th style={{ padding: '12px' }}>Nombre del Cliente</th>
                      <th style={{ padding: '12px' }}>Número de Póliza</th>
                      <th style={{ padding: '12px', textAlign: 'center' }}>Antigüedad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!data.anniversaries || data.anniversaries.length === 0 ? (
                      <tr><td colSpan="4" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-dim)' }}>No hay aniversarios este mes.</td></tr>
                    ) : (
                      [...data.anniversaries].sort((a,b) => a.day - b.day).map((ann, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                          <td style={{ padding: '12px', fontWeight: 'bold', color: 'var(--accent-mint)' }}>{ann.day}</td>
                          <td style={{ padding: '12px', fontWeight: '600' }}>{ann.name}</td>
                          <td style={{ padding: '12px', color: 'var(--text-dim)' }}>{ann.policy}</td>
                          <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', color: 'var(--accent-mint)' }}>🎈 {ann.years} {ann.years === 1 ? 'año' : 'años'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {fullReportModal === 'collected' && (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid rgba(226, 176, 66, 0.3)', color: 'var(--accent-gold)' }}>
                      <th style={{ padding: '12px' }}>Nombre Cliente</th>
                      <th style={{ padding: '12px' }}>Póliza</th>
                      <th style={{ padding: '12px' }}>Frecuencia</th>
                      <th style={{ padding: '12px' }}>Fecha Cobro</th>
                      <th style={{ padding: '12px' }}>Fecha Pago</th>
                      <th style={{ padding: '12px', textAlign: 'right' }}>Monto Pagado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentLists.collected.length === 0 ? (
                      <tr><td colSpan="6" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-dim)' }}>Aún no hay pólizas pagadas este mes.</td></tr>
                    ) : (
                      currentLists.collected.map((c, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                          <td style={{ padding: '12px', fontWeight: '600' }}>{c.name}</td>
                          <td style={{ padding: '12px', color: 'var(--text-dim)' }}>{c.policyNumber}</td>
                          <td style={{ padding: '12px', color: 'var(--accent-mint)', fontWeight: 'bold' }}>{c.paymentFrequency}</td>
                          <td style={{ padding: '12px', color: 'var(--text-dim)' }}>{c.collectionDate || 'Mensual'}</td>
                          <td style={{ padding: '12px', color: 'var(--accent-gold)', fontWeight: 'bold' }}>{c.paymentDate}</td>
                          <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold' }}>
                            {fmtCurrency(c.amount, c.currency)}
                            {dashboardTab === 'Vida' && (
                              <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 'normal' }}>
                                ≈ {fmt(c.amount * (c.currency === 'USD' ? rates.USD : rates.UDI))} MXN
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {fullReportModal === 'upcoming' && (() => {
                const upcomingCollectedList = [
                  ...currentLists.atrasados.map(item => ({ ...item, timeframe: 'Atrasado', color: '#ff4444' })),
                  ...currentLists.hoy.map(item => ({ ...item, timeframe: 'Hoy', color: '#ffaa00' })),
                  ...currentLists.en5Dias.map(item => ({ ...item, timeframe: 'En 5 días', color: '#e2b042' })),
                  ...currentLists.en15Dias.map(item => ({ ...item, timeframe: 'En 15 días', color: 'var(--accent-mint)' })),
                  ...currentLists.enMes.map(item => ({ ...item, timeframe: 'En 1 mes', color: 'var(--text-main)' }))
                ];
                
                return (
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid rgba(0, 255, 170, 0.3)', color: 'var(--accent-mint)' }}>
                        <th style={{ padding: '12px' }}>Vencimiento</th>
                        <th style={{ padding: '12px' }}>Nombre Cliente</th>
                        <th style={{ padding: '12px' }}>Póliza</th>
                        <th style={{ padding: '12px' }}>Frecuencia</th>
                        <th style={{ padding: '12px' }}>Fecha Cobro</th>
                        <th style={{ padding: '12px', textAlign: 'right' }}>Monto Pendiente</th>
                      </tr>
                    </thead>
                    <tbody>
                      {upcomingCollectedList.length === 0 ? (
                        <tr><td colSpan="6" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-dim)' }}>No hay cobranza pendiente programada para este mes.</td></tr>
                      ) : (
                        upcomingCollectedList.map((c, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                            <td style={{ padding: '12px' }}>
                              <span style={{ 
                                padding: '4px 8px', 
                                borderRadius: '6px', 
                                background: c.color + '20', 
                                color: c.color, 
                                border: `1px solid ${c.color}40`,
                                fontSize: '0.75rem',
                                fontWeight: 'bold' 
                              }}>
                                {c.timeframe}
                              </span>
                            </td>
                            <td style={{ padding: '12px', fontWeight: '600' }}>{c.name}</td>
                            <td style={{ padding: '12px', color: 'var(--text-dim)' }}>{c.policyNumber}</td>
                            <td style={{ padding: '12px', color: 'var(--accent-mint)', fontWeight: 'bold' }}>{c.paymentFrequency || 'MENSUAL'}</td>
                            <td style={{ padding: '12px', color: 'var(--text-dim)' }}>{c.collectionDate || 'Mensual'}</td>
                            <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold' }}>
                              {fmtCurrency(c.amount, c.currency)}
                              {dashboardTab === 'Vida' && (
                                <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 'normal' }}>
                                  ≈ {fmt(c.amount * (c.currency === 'USD' ? rates.USD : rates.UDI))} MXN
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                );
              })()}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px', flexShrink: 0 }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', margin: 0, alignSelf: 'center', marginRight: 'auto' }}>
                Tip: Toma una captura de pantalla completa presionando <kbd style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px' }}>Cmd + Shift + 4</kbd> en tu Mac.
              </p>
              <button 
                onClick={() => setFullReportModal(null)} 
                className="btn-primary" 
                style={{ padding: '10px 24px' }}
              >
                Entendido
              </button>
            </div>

          </div>
        </div>,
        document.body
      )}
    </>
  );
};

// ======================================
// PANEL DE ADMINISTRACIÓN (Solo Master)
// ======================================
const AdminPanel = () => {
  const { user, authFetch } = useAuth();
  const [usersList, setUsersList] = useState([]);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [newRole, setNewRole] = useState('advisor');
  const [editRole, setEditRole] = useState('advisor');
  const [newCompany, setNewCompany] = useState(user?.company === 'novaris' ? 'novaris' : 'ambriz');
  const isMasterAdmin = user?.role === 'admin';
  const companyLabel = (c) => (c === 'novaris' ? 'Novaris' : 'Ambriz & Dávalos');

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = () => {
    authFetch('/api/admin/users')
      .then(res => res.json())
      .then(setUsersList);
  };

  const handleCopyWelcome = (u) => {
    const message = `¡Hola, ${u.name}! Bienvenido(a) al CRM de ${companyLabel(u.company)}. 💼✨\n\nAquí tienes tus credenciales para acceder a la plataforma:\n🔗 Enlace: https://crm.ambrizydavalos.com\n📧 Usuario: ${u.email}\n🔑 Contraseña: ${u.rawPassword}\n\nCualquier duda, estoy a tus órdenes. ¡Mucho éxito! 🚀`;
    
    navigator.clipboard.writeText(message)
      .then(() => {
        alert('📋 ¡Mensaje de bienvenida copiado al portapapeles! Ya puedes pegarlo donde prefieras.');
      })
      .catch(err => {
        console.error('Error al copiar:', err);
        alert('Error al copiar al portapapeles. Inténtalo de nuevo.');
      });
  };

  const createUser = () => {
    if (!newName || !newEmail || !newPassword) return alert('Llena todos los campos');
    // Un administrador de despacho (no Master) siempre crea dentro de su propio
    // despacho — el backend lo fuerza igual, pero aquí reflejamos lo mismo en
    // el mensaje de bienvenida.
    const companyToUse = isMasterAdmin ? newCompany : (user?.company || 'ambriz');
    authFetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, email: newEmail.trim(), password: newPassword, role: newRole, company: companyToUse })
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        alert(`✅ CRM creado para ${newName} (${companyLabel(companyToUse)})`);
        const tempUser = { name: newName, email: newEmail.trim(), rawPassword: newPassword, company: companyToUse };
        handleCopyWelcome(tempUser);
        setNewName(''); setNewEmail(''); setNewPassword('');
        setNewRole('advisor');
        loadUsers();
      } else { alert(data.error); }
    });
  };

  const startEdit = (u) => {
    setEditingUser(u.id);
    setEditName(u.name);
    setEditEmail(u.email);
    setEditPassword('');
    setEditRole(u.role || 'advisor');
  };

  const saveEdit = (id) => {
    const body = {};
    if (editName) body.name = editName;
    if (editEmail) body.email = editEmail.trim();
    if (editPassword) body.password = editPassword;
    body.role = editRole;

    authFetch(`/api/admin/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        setEditingUser(null);
        loadUsers();
      } else { alert(data.error); }
    });
  };

  const toggleBlock = (id) => {
    authFetch(`/api/admin/users/${id}/toggle-block`, { method: 'PUT' })
      .then(res => res.json())
      .then(() => loadUsers());
  };

  const deleteUser = (id) => {
    if (!confirm('¿Estás seguro de eliminar este usuario y toda su información?')) return;
    authFetch(`/api/admin/users/${id}`, { method: 'DELETE' })
      .then(() => loadUsers());
  };

  const filteredUsers = usersList.filter(u => 
    u.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const inputStyle = { padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: 'var(--text-main)', fontSize: '0.85rem', width: '100%', boxSizing: 'border-box' };

  return (
    <div className="animate-up">
      <h1 style={{ fontSize: '2rem', marginBottom: '32px' }}>Panel de <span className="text-gradient-gold">Administración</span></h1>

      <div className="dashboard-grid">
        {/* Formulario de Apertura */}
        <div className="glass-card" style={{ gridColumn: 'span 4' }}>
          <h3 style={{ marginBottom: '24px' }}>Aperturar CRM</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nombre completo" style={inputStyle} />
            <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="Correo electrónico" style={inputStyle} />
            <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Contraseña" style={inputStyle} />
            <select value={newRole} onChange={(e) => setNewRole(e.target.value)} style={inputStyle}>
              <option value="advisor" style={{ background: 'var(--bg-surface)' }}>Asesor</option>
              <option value="administrador" style={{ background: 'var(--bg-surface)' }}>Administrador</option>
            </select>
            {isMasterAdmin ? (
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '6px', display: 'block' }}>Despacho</label>
                <select value={newCompany} onChange={(e) => setNewCompany(e.target.value)} style={inputStyle}>
                  <option value="ambriz" style={{ background: 'var(--bg-surface)' }}>Ambriz & Dávalos (Vida/GMM)</option>
                  <option value="novaris" style={{ background: 'var(--bg-surface)' }}>Novaris (Autos)</option>
                </select>
              </div>
            ) : (
              <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: 0 }}>
                Se creará en tu propio despacho: <strong style={{ color: 'var(--accent-gold)' }}>{companyLabel(user?.company)}</strong>
              </p>
            )}
            <button onClick={createUser} className="btn-primary">Crear Cuenta</button>
          </div>
        </div>

        {/* Tabla de Credenciales */}
        <div className="glass-card" style={{ gridColumn: 'span 8', padding: '0', overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px', borderBottom: '1px solid var(--glass-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Base de Datos de Usuarios</h3>
              <button onClick={() => setShowPasswords(!showPasswords)} style={{ background: 'none', border: 'none', fontSize: '0.75rem', color: 'var(--accent-gold)', cursor: 'pointer' }}>
                {showPasswords ? '🔒 Ocultar Contraseñas' : '👁️ Ver Contraseñas'}
              </button>
            </div>

            {/* Filtro de búsqueda */}
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="🔍 Buscar por nombre o correo..."
                style={{
                  ...inputStyle,
                  padding: '10px 14px 10px 38px',
                  borderRadius: '8px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--glass-border)',
                  color: 'var(--text-main)',
                  width: '100%'
                }}
              />
            </div>
          </div>

          <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface)' }}>
                <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <th style={{ padding: '16px' }}>Nombre</th>
                  <th style={{ padding: '16px' }}>Correo</th>
                  <th style={{ padding: '16px' }}>Despacho</th>
                  <th style={{ padding: '16px' }}>Contraseña</th>
                  <th style={{ padding: '16px' }}>Clientes</th>
                  <th style={{ padding: '16px' }}>Estatus</th>
                  <th style={{ padding: '16px' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No se encontraron usuarios
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map(u => (
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--glass-border)', opacity: u.blocked ? 0.5 : 1 }}>
                      <td style={{ padding: '16px' }}>
                        {editingUser === u.id ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <input value={editName} onChange={(e) => setEditName(e.target.value)} style={{ ...inputStyle, padding: '6px 8px' }} />
                            {u.role === 'admin' ? (
                              <span style={{ alignSelf: 'flex-start', fontSize: '0.65rem', padding: '2px 8px', borderRadius: '20px', background: 'rgba(226,176,66,0.15)', color: 'var(--accent-gold)' }}>
                                MASTER
                              </span>
                            ) : (
                              <select value={editRole} onChange={(e) => setEditRole(e.target.value)} style={{ ...inputStyle, padding: '4px 8px', fontSize: '0.75rem' }}>
                                <option value="advisor" style={{ background: 'var(--bg-surface)' }}>Asesor</option>
                                <option value="administrador" style={{ background: 'var(--bg-surface)' }}>Administrador</option>
                              </select>
                            )}
                          </div>
                        ) : (
                          <div>
                            <p style={{ fontWeight: '600' }}>{u.name}</p>
                            {u.role === 'admin' && (
                              <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: '20px', background: 'rgba(226,176,66,0.15)', color: 'var(--accent-gold)' }}>
                                MASTER
                              </span>
                            )}
                            {u.role === 'administrador' && (
                              <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: '20px', background: 'rgba(0, 255, 170, 0.12)', color: 'var(--accent-mint)' }}>
                                ADMINISTRADOR
                              </span>
                            )}
                            {u.role !== 'admin' && u.role !== 'administrador' && (
                              <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: '20px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-dim)' }}>
                                ASESOR
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '16px', fontSize: '0.85rem' }}>
                        {editingUser === u.id ? (
                          <input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} style={{ ...inputStyle, padding: '6px 8px' }} />
                        ) : u.email}
                      </td>
                      <td style={{ padding: '16px' }}>
                        <span style={{
                          fontSize: '0.7rem',
                          padding: '4px 10px',
                          borderRadius: '20px',
                          fontWeight: '600',
                          background: u.company === 'novaris' ? 'rgba(37, 99, 235, 0.12)' : 'rgba(226, 176, 66, 0.15)',
                          color: u.company === 'novaris' ? '#2563eb' : 'var(--accent-gold)'
                        }}>
                          {companyLabel(u.company)}
                        </span>
                      </td>
                      <td style={{ padding: '16px', fontSize: '0.85rem', fontFamily: 'monospace' }}>
                        {editingUser === u.id ? (
                          <input value={editPassword} onChange={(e) => setEditPassword(e.target.value)} placeholder="(sin cambio)" style={{ ...inputStyle, padding: '6px 8px' }} />
                        ) : (
                          showPasswords ? u.rawPassword : '••••••'
                        )}
                      </td>
                      <td style={{ padding: '16px', textAlign: 'center', fontWeight: 'bold' }}>{u.totalClients}</td>
                      <td style={{ padding: '16px' }}>
                        {u.blocked ? (
                          <span style={{ fontSize: '0.7rem', padding: '4px 10px', borderRadius: '20px', background: 'rgba(255,68,68,0.15)', color: '#ff4444' }}>BLOQUEADO</span>
                        ) : (
                          <span style={{ fontSize: '0.7rem', padding: '4px 10px', borderRadius: '20px', background: 'rgba(0,255,170,0.1)', color: 'var(--accent-mint)' }}>ACTIVO</span>
                        )}
                      </td>
                      <td style={{ padding: '16px' }}>
                        {editingUser === u.id ? (
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={() => saveEdit(u.id)} style={{ color: 'var(--accent-mint)', fontSize: '0.8rem', cursor: 'pointer' }}>Guardar</button>
                            <button onClick={() => setEditingUser(null)} style={{ color: 'var(--text-dim)', fontSize: '0.8rem', cursor: 'pointer' }}>Cancelar</button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {(u.role !== 'admin' || user.role === 'admin') && (
                              <button onClick={() => startEdit(u)} style={{ color: 'var(--accent-gold)', fontSize: '0.75rem', cursor: 'pointer' }}>Editar</button>
                            )}
                            <button onClick={() => handleCopyWelcome(u)} style={{ color: 'var(--accent-mint)', fontSize: '0.75rem', cursor: 'pointer' }}>Copiar Bienvenida</button>
                            {u.role !== 'admin' && (
                              <>
                                <button onClick={() => toggleBlock(u.id)} style={{ color: u.blocked ? 'var(--accent-mint)' : '#ff8800', fontSize: '0.75rem', cursor: 'pointer' }}>
                                  {u.blocked ? 'Desbloquear' : 'Bloquear'}
                                </button>
                                <button onClick={() => deleteUser(u.id)} style={{ color: '#ff4444', fontSize: '0.75rem', cursor: 'pointer' }}>Eliminar</button>
                              </>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

const AvatarRenderer = ({ user, size = 40, style = {} }) => {
  if (user?.avatarUrl) {
    return (
      <img 
        src={user.avatarUrl} 
        alt={user?.name} 
        style={{ 
          width: `${size}px`, 
          height: `${size}px`, 
          borderRadius: '50%', 
          objectFit: 'cover', 
          border: '2px solid var(--accent-gold)', 
          boxShadow: 'var(--glass-shadow)',
          ...style 
        }} 
      />
    );
  }

  // Luxury modern letter avatar using user initials
  const name = user?.name || 'Usuario';
  const parts = name.split(' ');
  const initials = parts.length >= 2 
    ? (parts[0][0] + parts[1][0]).toUpperCase() 
    : parts[0][0].toUpperCase();

  return (
    <div 
      style={{ 
        width: `${size}px`, 
        height: `${size}px`, 
        borderRadius: '50%', 
        background: 'linear-gradient(135deg, #e2b042 0%, #805b10 100%)',
        color: '#121214',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: '700',
        fontSize: `${size * 0.4}px`,
        fontFamily: '"Outfit", "Inter", system-ui, -apple-system, sans-serif',
        letterSpacing: '0.5px',
        border: '2px solid var(--accent-gold)',
        boxShadow: 'var(--glass-shadow)',
        userSelect: 'none',
        ...style 
      }}
      title={name}
    >
      {initials}
    </div>
  );
};



// ======================================
// APP PRINCIPAL
// ======================================
const AppContent = () => {
  const { user, setUser, logout, authFetch } = useAuth();
  const [currentView, setCurrentView] = useState('Dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showProfileModal, setShowProfileModal] = useState(false);

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('crm_theme') || 'dark';
  });

  useEffect(() => {
    // 'light' es la base (:root) desde el rediseño ejecutivo; 'dark' es la variante
    // que activa el bloque body.dark-theme en index.css. (Antes decía 'light-theme',
    // una clase que index.css nunca definió, así que el oscuro nunca se veía.)
    document.body.className = theme === 'dark' ? 'dark-theme' : '';
    localStorage.setItem('crm_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  // Multi-tenant: adapta paleta (vía [data-company] en index.css), título de
  // pestaña y favicon al despacho del usuario autenticado. Al cerrar sesión
  // (user === null) vuelve todo a lo neutral de index.html — el login es
  // una pantalla compartida, sin marca de ningún despacho.
  useEffect(() => {
    const iconLink = document.querySelector('link[rel="icon"]');
    if (!user) {
      document.body.removeAttribute('data-company');
      document.title = 'Iniciar Sesión | CRM';
      if (iconLink) iconLink.href = '/favicon.svg';
      return;
    }
    const company = user.company === 'ambriz' ? 'ambriz' : 'novaris';
    document.body.setAttribute('data-company', company);
    const branding = COMPANY_BRANDING[company];
    document.title = branding.pageTitle;
    if (iconLink) iconLink.href = branding.logo;
  }, [user]);

  if (!user) return <LoginPage theme={theme} toggleTheme={toggleTheme} />;

  const firstName = user.name.split(' ')[0];
  const branding = COMPANY_BRANDING[user.company === 'ambriz' ? 'ambriz' : 'novaris'];

  const navItems = [
    { name: 'Dashboard', id: 'Dashboard' },
    { name: 'Base de Datos', id: 'Database' },
    { name: 'Prospección', id: 'Prospects' },
    { name: 'Estadísticas', id: 'Analytics' },
    { name: 'Plantillas', id: 'Templates' },
  ];

  if (user.role === 'admin' || user.role === 'administrador') {
    navItems.push({ name: 'Administración', id: 'Admin' });
  }

  return (
    <div className="app-container">
      <aside className="sidebar" style={{ transform: isSidebarOpen ? 'translateX(0)' : 'translateX(-280px)', transition: 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)' }}>
        {/* Botón para colapsar/expandir */}
        <button 
           onClick={() => setIsSidebarOpen(!isSidebarOpen)}
           style={{
              position: 'absolute', right: '-15px', top: '48px',
              width: '30px', height: '30px', borderRadius: '50%',
              background: 'var(--bg-surface)', border: '1px solid var(--accent-gold)',
              color: 'var(--accent-gold)', cursor: 'pointer', zIndex: 101,
              display: 'flex', justifyContent: 'center', alignItems: 'center',
              boxShadow: 'var(--glass-shadow)', fontSize: '0.8rem',
              transition: 'all 0.3s'
           }}>
           {isSidebarOpen ? '◀' : '▶'}
        </button>

        <div style={{ marginBottom: '36px', opacity: isSidebarOpen ? 1 : 0, transition: 'opacity 0.2s', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
          <img src={branding.logo} alt={branding.logoAlt} style={{ height: '45px', objectFit: 'contain' }} />
          <div>
            <h1 style={{ fontSize: '1.2rem', letterSpacing: '1px', color: 'var(--text-main)', fontWeight: '800' }}>{branding.sidebarTitle}</h1>
            <p style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: '2px', fontWeight: '600' }}>{branding.sidebarSubtitle}</p>
          </div>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {navItems.map((item, index) => (
            <div
              key={index}
              onClick={() => setCurrentView(item.id)}
              style={{
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                color: currentView === item.id ? 'var(--text-main)' : 'var(--text-muted)',
                background: currentView === item.id ? 'rgba(226, 176, 66, 0.1)' : 'transparent',
                borderLeft: currentView === item.id ? '2px solid var(--accent-gold)' : 'none',
                cursor: 'pointer',
                transition: '0.3s'
              }}
            >
              {item.name}
            </div>
          ))}
        </nav>

        <div style={{ marginTop: 'auto', paddingTop: '24px', borderTop: '1px solid var(--glass-border)' }}>
          {/* Botón de cambio de tema claro/oscuro */}
          <button
            onClick={toggleTheme}
            type="button"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderRadius: '8px',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--glass-border)',
              color: 'var(--text-main)',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: '500',
              marginBottom: '16px',
              transition: 'all 0.3s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = 'var(--accent-gold)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = 'var(--glass-border)'; }}
            title="Cambiar Tema"
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {theme === 'light' ? '☀️' : '🌙'} {theme === 'light' ? 'Modo Claro' : 'Modo Oscuro'}
            </span>
            <span style={{
              fontSize: '0.7rem',
              color: 'var(--accent-gold)',
              background: 'var(--accent-gold-glow)',
              padding: '2px 8px',
              borderRadius: '12px',
              fontWeight: '600'
            }}>
              Cambiar
            </span>
          </button>

          <div
            onClick={() => setShowProfileModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', cursor: 'pointer', padding: '8px', borderRadius: '10px', background: 'rgba(255,255,255,0.02)', border: '1px solid transparent', transition: 'all 0.2s' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(226,176,66,0.05)'; e.currentTarget.style.borderColor = 'rgba(226,176,66,0.2)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = 'transparent'; }}
            title="Personalizar Perfil"
          >
            <AvatarRenderer user={user} size={40} />
            <div>
              <p style={{ fontSize: '0.9rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-main)' }}>
                {user.name}
              </p>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                {user.role === 'admin' && 'Cuenta Maestra'}
                {user.role === 'administrador' && 'Administrador'}
                {user.role !== 'admin' && user.role !== 'administrador' && 'Asesor'}
              </p>
            </div>
          </div>
          <button onClick={logout} style={{ width: '100%', padding: '8px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-dim)', fontSize: '0.8rem', cursor: 'pointer', border: '1px solid var(--glass-border)' }}>
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="main-content" style={{ marginLeft: isSidebarOpen ? '280px' : '0', transition: 'margin-left 0.4s cubic-bezier(0.22, 1, 0.36, 1)' }}>
        {currentView === 'Dashboard' && <Dashboard />}
        {currentView === 'Database' && <Clients />}
        {currentView === 'Prospects' && <Prospects />}
        {currentView === 'Analytics' && <Analytics />}
        {currentView === 'Templates' && <TemplatesPanel />}
        {currentView === 'Admin' && (user.role === 'admin' || user.role === 'administrador') && <AdminPanel />}
      </main>

      {/* MODAL DE PERFIL DE USUARIO */}
      {showProfileModal && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(6px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 3000, padding: '20px' }}>
          <div className="glass-card animate-up" style={{ width: '100%', maxWidth: '420px', padding: '36px', position: 'relative', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px', background: '#ffffff', color: '#0f172a', border: '1px solid #cbd5e1', boxShadow: '0 20px 40px rgba(15,23,42,0.2)' }}>
            
            <button 
              onClick={() => setShowProfileModal(false)}
              style={{ position: 'absolute', top: '16px', right: '16px', background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#0f172a', fontSize: '1.2rem', cursor: 'pointer', transition: '0.2s', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}
              title="Cerrar"
            >
              ✕
            </button>

            <div>
              <h3 className="text-gradient-gold" style={{ fontSize: '1.4rem', margin: '0 0 4px 0', letterSpacing: '1px' }}>Mi Perfil</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', margin: 0 }}>Gestiona la foto de tu cuenta institucional</p>
            </div>

            {/* Contenedor de Foto de Perfil */}
            <div style={{ position: 'relative' }}>
              <AvatarRenderer user={user} size={150} style={{ border: '3px solid var(--accent-gold)', boxShadow: '0 8px 24px rgba(226,176,66,0.15)' }} />
            </div>

            <div>
              <h4 style={{ margin: '0 0 4px 0', fontSize: '1.3rem', fontWeight: '700', color: 'var(--text-main)' }}>{user.name}</h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--accent-gold)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>
                {user.role === 'admin' && 'Cuenta Maestra'}
                {user.role === 'administrador' && 'Administrador'}
                {user.role !== 'admin' && user.role !== 'administrador' && 'Asesor Asociado'}
              </p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px', margin: 0 }}>{user.email}</p>
            </div>

            {/* Acciones de Foto */}
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label 
                className="btn-primary" 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  gap: '8px', 
                  padding: '14px', 
                  fontSize: '0.9rem', 
                  cursor: 'pointer', 
                  background: 'var(--accent-gold)', 
                  color: 'black', 
                  borderRadius: '10px', 
                  fontWeight: '700',
                  transition: 'all 0.3s'
                }}
              >
                📷 Subir Nueva Foto
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onloadend = async () => {
                      const base64 = reader.result;
                      try {
                        const res = await authFetch('/api/user/profile', {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ avatarUrl: base64, avatarConfig: null })
                        });
                        const result = await res.json();
                        if (result.success) {
                          const updatedUser = { ...user, avatarUrl: base64, avatarConfig: null };
                          setUser(updatedUser);
                          localStorage.setItem('crm_user', JSON.stringify(updatedUser));
                          alert('¡Foto de perfil actualizada con éxito!');
                        } else {
                          alert('Error al subir la foto: ' + result.error);
                        }
                      } catch(err) {
                        console.error(err);
                        alert('Error de conexión al intentar subir la foto.');
                      }
                    };
                    reader.readAsDataURL(file);
                  }}
                  style={{ display: 'none' }} 
                />
              </label>
              
              {user.avatarUrl && (
                <button
                  onClick={async () => {
                    if (window.confirm('¿Estás seguro de que deseas eliminar tu foto de perfil actual?')) {
                      try {
                        const res = await authFetch('/api/user/profile', {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ avatarUrl: null, avatarConfig: null })
                        });
                        const result = await res.json();
                        if (result.success) {
                          const updatedUser = { ...user, avatarUrl: null, avatarConfig: null };
                          setUser(updatedUser);
                          localStorage.setItem('crm_user', JSON.stringify(updatedUser));
                          alert('Foto de perfil eliminada correctamente.');
                        } else {
                          alert('Error al eliminar la foto: ' + result.error);
                        }
                      } catch(err) {
                        console.error(err);
                        alert('Error de conexión al intentar eliminar la foto.');
                      }
                    }
                  }}
                  style={{ 
                    padding: '12px', 
                    background: 'rgba(255,68,68,0.08)', 
                    border: '1px solid rgba(255,68,68,0.2)', 
                    color: '#ff4444', 
                    borderRadius: '10px', 
                    cursor: 'pointer', 
                    fontSize: '0.85rem',
                    fontWeight: '600',
                    transition: 'all 0.3s'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,68,68,0.15)'; e.currentTarget.style.borderColor = 'rgba(255,68,68,0.4)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,68,68,0.08)'; e.currentTarget.style.borderColor = 'rgba(255,68,68,0.2)'; }}
                >
                  🗑️ Eliminar Foto Actual
                </button>
              )}
            </div>

            <button 
              onClick={() => setShowProfileModal(false)}
              className="btn-primary" 
              style={{ 
                width: '100%', 
                padding: '12px', 
                background: 'rgba(255,255,255,0.05)', 
                border: '1px solid var(--glass-border)', 
                color: 'var(--text-main)', 
                borderRadius: '10px', 
                cursor: 'pointer', 
                fontSize: '0.85rem',
                fontWeight: '600',
                transition: 'all 0.3s'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
            >
              Volver al Menú
            </button>


          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

const App = () => (
  <AuthProvider>
    <AppContent />
  </AuthProvider>
);

export default App;
