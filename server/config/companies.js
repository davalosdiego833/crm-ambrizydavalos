// Configuración estática por despacho (multi-tenant).
// El aislamiento de datos ya ocurre porque cada usuario trae sus propios
// clients/prospects/snapshots anidados (ver server/index.js) — este módulo
// solo documenta reglas de negocio por despacho para referencia y validación.
const COMPANIES = {
  ambriz: {
    id: 'ambriz',
    displayName: 'Ambriz & Dávalos',
    allowedProducts: ['Vida', 'GMM'],
    allowedCurrencies: ['UDI', 'USD', 'MXN'],
  },
  novaris: {
    id: 'novaris',
    displayName: 'Novaris',
    allowedProducts: ['Automotriz'],
    allowedCurrencies: ['MXN'],
  },
};

const DEFAULT_COMPANY = 'ambriz';

const getCompanyConfig = (companyId) => COMPANIES[companyId] || COMPANIES[DEFAULT_COMPANY];

module.exports = { COMPANIES, DEFAULT_COMPANY, getCompanyConfig };
