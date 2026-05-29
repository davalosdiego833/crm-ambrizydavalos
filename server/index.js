require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const xlsx = require('xlsx');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { PDFParse } = require('pdf-parse');
const fs = require('fs');



const app = express();
const PORT = process.env.PORT || 5001;
const JWT_SECRET = 'ambriz-crm-elite-2024-secret';

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Configuración de Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.resolve(__dirname, 'uploads');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// ======================================
// ROBOT FINANCIERO (Tipos de Cambio)
// ======================================
let exchangeRates = {
  USD: 17.3477, // Official fallback
  UDI: 8.8427,  // Official fallback
  lastUpdated: null
};

const fetchRates = async () => {
  try {
    // Disable TLS unauthorized rejection temporarily for government site connection
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    
    console.log('🤖 Robot Financiero: Consultando Diario Oficial de la Federación (DOF)...');
    const response = await fetch('https://www.dof.gob.mx/indicadores.php');
    const html = await response.text();
    
    // Parse official USD (Dolar FIX) from DOF
    const dollarMatch = html.match(/<span class="tituloBloque4">DOLAR<\/span>\s*<br\s*\/?>\s*([0-9.]+)/i);
    const officialUSD = dollarMatch ? parseFloat(dollarMatch[1]) : null;
    
    // Parse official UDI from DOF
    const udiMatch = html.match(/<span class="tituloBloque4">UDIS<\/span>\s*<br\s*\/?>\s*([0-9.]+)/i);
    const officialUDI = udiMatch ? parseFloat(udiMatch[1]) : null;
    
    if (officialUSD) {
      exchangeRates.USD = officialUSD;
      console.log('🤖 Robot Financiero: USD Oficial del DOF obtenido:', officialUSD);
    } else {
      console.warn('⚠️ Robot Financiero: No se pudo parsear el USD del DOF. Usando API pública de respaldo...');
      const usdRes = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
      const usdData = await usdRes.json();
      if (usdData && usdData.rates && usdData.rates.MXN) {
        exchangeRates.USD = usdData.rates.MXN;
      }
    }
    
    if (officialUDI) {
      exchangeRates.UDI = officialUDI;
      console.log('🤖 Robot Financiero: UDI Oficial del DOF obtenido:', officialUDI);
    } else {
      console.warn('⚠️ Robot Financiero: No se pudo parsear la UDI del DOF. Usando valor estimado de respaldo...');
      // Fallback UDI logic (gently increases or remains stable around 8.84)
      exchangeRates.UDI = 8.8427;
    }
    
    exchangeRates.lastUpdated = new Date().toISOString();
    console.log('🤖 Robot Financiero: Tipos de cambio actualizados con éxito:', exchangeRates);
  } catch (error) {
    console.error('❌ Robot Financiero: Error consultando tipos de cambio:', error);
  } finally {
    // Restore default TLS rejection settings
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  }
};

// Initial fetch & set 1-hour interval to keep rates fresh and sync'd
fetchRates();
setInterval(fetchRates, 1000 * 60 * 60 * 1);
// ======================================
// BASE DE DATOS PERSISTENTE DE USUARIOS
// ======================================
const DB_FILE = path.join(__dirname, 'db.json');

const defaultUsers = [
  {
    id: 1,
    email: 'davalosdiego833@gmail.com',
    password: bcrypt.hashSync('Diego00', 10),
    rawPassword: 'Diego00',
    name: 'Diego Dávalos',
    role: 'admin',
    blocked: false,
    clients: [
      {
        id: 1,
        contractor: 'Carlos Mendoza',
        contractorBirthDate: '1988-06-12',
        insureds: [
          { name: 'Carlos Mendoza', birthDate: '1988-06-12' },
          { name: 'Lucia Mendoza', birthDate: '2012-05-13' }
        ],
        policyNumber: 'GMM-55001',
        emissionDate: '2024-01-15',
        collectionDay: 15,
        paymentFrequency: 'MENSUAL',
        product: 'Gastos Médicos Mayores',
        premium: 8500,
        phone: '525512345678',
        status: 'Pagada',
        documents: []
      },
      {
        id: 2,
        contractor: 'Ana García López',
        contractorBirthDate: '1992-03-20',
        insureds: [{ name: 'Ana García López', birthDate: '1992-03-20' }],
        policyNumber: 'VIDA-8820',
        emissionDate: '2024-03-01',
        collectionDay: 20,
        paymentFrequency: 'TRIMESTRAL',
        product: 'Vida Respaldo',
        premium: 12000,
        phone: '525587654321',
        status: 'Pendiente',
        documents: []
      }
    ]
  }
];

const loadDB = () => {
  if (fs.existsSync(DB_FILE)) {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(defaultUsers, null, 2));
  return defaultUsers;
};

const saveDB = () => {
  fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
};

let users = loadDB();

// ======================================
// INTELLECTUAL AND AUTONOMOUS HELPERS
// ======================================

// Función robusta para formatear y analizar fechas (formatos DD/MM/YYYY, YYYY-MM-DD o serie de Excel)
const parseDate = (val) => {
  if (!val) return '';
  if (typeof val === 'number') {
    try {
      const date = new Date((val - (25567 + 2)) * 86400 * 1000);
      if (!isNaN(date.getTime())) {
        return date.toISOString().slice(0, 10);
      }
    } catch(e) {}
  }
  
  const str = String(val).trim();
  if (!str) return '';
  
  const slashParts = str.split('/');
  if (slashParts.length === 3) {
    let day = slashParts[0].padStart(2, '0');
    let month = slashParts[1].padStart(2, '0');
    let year = slashParts[2];
    if (year.length === 2) {
      year = parseInt(year) > 50 ? '19' + year : '20' + year;
    }
    return `${year}-${month}-${day}`;
  }
  
  const dashParts = str.split('-');
  if (dashParts.length === 3) {
    if (dashParts[0].length === 4) {
      return str; // Ya está en YYYY-MM-DD
    } else {
      let day = dashParts[0].padStart(2, '0');
      let month = dashParts[1].padStart(2, '0');
      let year = dashParts[2];
      if (year.length === 2) {
        year = parseInt(year) > 50 ? '19' + year : '20' + year;
      }
      return `${year}-${month}-${day}`;
    }
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return '';
};

// Calcular el cobro inicial de forma inteligente (para fecha de emisión y frecuencia)
const getInitialCollectionDate = (emissionDateStr, paymentFrequency, status) => {
  const parsed = parseDate(emissionDateStr);
  if (!parsed) return '';

  const d = new Date(parsed + 'T00:00:00');
  if (isNaN(d.getTime())) return '';

  const day = d.getDate();
  const emissionMonth = d.getMonth(); // 0-indexed (0-11)
  
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed (0-11)

  const freq = String(paymentFrequency).toUpperCase();
  let scheduledMonths = [];

  if (freq.includes('MENS')) {
    for (let i = 0; i < 12; i++) scheduledMonths.push(i);
  } else if (freq.includes('TRIM')) {
    for (let i = 0; i < 4; i++) {
      scheduledMonths.push((emissionMonth + i * 3) % 12);
    }
  } else if (freq.includes('SEME')) {
    for (let i = 0; i < 2; i++) {
      scheduledMonths.push((emissionMonth + i * 6) % 12);
    }
  } else {
    // ANUAL
    scheduledMonths.push(emissionMonth);
  }

  scheduledMonths.sort((a, b) => a - b);

  if (status === 'Pendiente') {
    // Debe ser en el mes corriente (mayo 2026)
    const colDate = new Date(currentYear, currentMonth, day);
    return colDate.toISOString().slice(0, 10);
  } else {
    // Pagada: buscamos el siguiente mes de cobro programado estrictamente posterior al mes corriente
    const nextMonthInYear = scheduledMonths.find(m => m > currentMonth);
    if (nextMonthInYear !== undefined) {
      const colDate = new Date(currentYear, nextMonthInYear, day);
      return colDate.toISOString().slice(0, 10);
    } else {
      const colDate = new Date(currentYear + 1, scheduledMonths[0], day);
      return colDate.toISOString().slice(0, 10);
    }
  }
};

// Función inteligente para determinar si un cobro cae en el mes corriente
const isPaymentDueInCurrentMonth = (emissionDateStr, paymentFrequency) => {
  if (!emissionDateStr) return false;
  
  const d = new Date(emissionDateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return false;
  
  const emissionMonth = d.getMonth() + 1; // 1-indexed (1-12)
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-indexed (1-12)
  
  const freq = String(paymentFrequency).toUpperCase();
  
  if (freq.includes('MENS')) {
    return true; // Mensual tiene cobro todos los meses
  }
  
  if (freq.includes('TRIM')) {
    // Trimestral tiene cobro cada 3 meses
    return (
      emissionMonth === currentMonth ||
      (emissionMonth + 3) % 12 === currentMonth % 12 ||
      (emissionMonth + 6) % 12 === currentMonth % 12 ||
      (emissionMonth + 9) % 12 === currentMonth % 12
    );
  }
  
  if (freq.includes('SEME')) {
    // Semestral tiene cobro cada 6 meses
    return (
      emissionMonth === currentMonth ||
      (emissionMonth + 6) % 12 === currentMonth % 12
    );
  }
  
  if (freq.includes('ANUA')) {
    // Anual solo tiene cobro en el mes de emisión
    return emissionMonth === currentMonth;
  }
  
  return false;
};

// Función inteligente para parsear cumpleaños sin inventar año si en Excel solo está "dia-mes" (ej: "15-sep")
const parseBirthday = (cellVal, cellW) => {
  if (!cellVal) return '';
  
  // Si tenemos el texto formateado de Excel (ej: "15-sep", "26-May")
  if (cellW) {
    const cleanW = String(cellW).trim().toLowerCase();
    
    // Regex para detectar patrones como "15-sep", "26-May", "7/Oct" sin año al final
    const monthsPattern = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|ene|ago|dic)';
    const noYearRegex = new RegExp(`^\\d{1,2}[-/]${monthsPattern}$`, 'i');
    
    if (noYearRegex.test(cleanW)) {
      const parts = cleanW.split(/[-/]/);
      const day = parts[0].padStart(2, '0');
      const monthName = parts[1];
      
      const monthsMap = {
        jan: '01', ene: '01',
        feb: '02',
        mar: '03',
        apr: '04', abr: '04',
        may: '05',
        jun: '06',
        jul: '07',
        aug: '08', ago: '08',
        sep: '09',
        oct: '10',
        nov: '11',
        dec: '12', dic: '12'
      };
      
      const month = monthsMap[monthName.substring(0, 3)];
      if (month) {
        return `${month}-${day}`; // Guarda "MM-DD"
      }
    }
  }
  
  // Si no coincide con cumpleaños sin año, lo parseamos como fecha normal YYYY-MM-DD
  return parseDate(cellVal);
};

// Función inteligente para parsear la prima anual base desde fórmulas o sanar montos brutos en UDI o USD
const parseAnnualPremiumFromFormula = (formulaStr, currency, defaultVal, emissionDateStr) => {
  // 1. Si no hay fórmula y es un valor numérico bruto, aplicamos lógica de auto-sanación (self-healing)
  if (!formulaStr) {
    if (currency === 'UDI' && defaultVal > 18000) {
      // Asumimos que está en pesos y lo convertimos de regreso a UDI según el año de emisión
      const year = emissionDateStr ? new Date(emissionDateStr + 'T00:00:00').getFullYear() : 2026;
      let rate = 8.3; // UDI en 2026
      if (year <= 2018) rate = 6.0;
      else if (year === 2019) rate = 6.3;
      else if (year === 2020) rate = 6.6;
      else if (year === 2021) rate = 7.0;
      else if (year === 2022) rate = 7.3;
      else if (year === 2023) rate = 7.6;
      else if (year === 2024) rate = 7.8;
      else if (year === 2025) rate = 8.1;
      return parseFloat((defaultVal / rate).toFixed(2));
    }
    
    if (currency === 'USD' && defaultVal > 12000) {
      // Asumimos que está en pesos y lo convertimos a USD usando un tipo de cambio histórico estándar (18.5)
      return parseFloat((defaultVal / 18.5).toFixed(2));
    }
    
    return defaultVal;
  }
  
  // 2. Si hay fórmula, la desestructuramos inteligentemente
  const parts = formulaStr.split('*').map(p => parseFloat(p.trim())).filter(p => !isNaN(p));
  if (parts.length === 0) return defaultVal;
  
  if (currency !== 'UDI' && currency !== 'USD') {
    return defaultVal;
  }
  
  let exchangeRateValue = 0;
  let frequencyMultiplier = 1;
  let baseAmount = 0;
  
  if (parts.length === 3) {
    // Caso típico: base * freq * tc (ej: 727 * 12 * 7.65)
    const freqIndex = parts.findIndex(p => p === 12 || p === 4 || p === 2);
    if (freqIndex !== -1) {
      frequencyMultiplier = parts[freqIndex];
      const remaining = parts.filter((_, idx) => idx !== freqIndex);
      const p1 = remaining[0];
      const p2 = remaining[1];
      
      const isP1Rate = (currency === 'UDI' && p1 >= 5.0 && p1 <= 8.8) || (currency === 'USD' && p1 >= 14.0 && p1 <= 27.0);
      const isP2Rate = (currency === 'UDI' && p2 >= 5.0 && p2 <= 8.8) || (currency === 'USD' && p2 >= 14.0 && p2 <= 27.0);
      
      if (isP1Rate && !isP2Rate) {
        exchangeRateValue = p1;
        baseAmount = p2;
      } else if (isP2Rate && !isP1Rate) {
        exchangeRateValue = p2;
        baseAmount = p1;
      } else {
        exchangeRateValue = Math.min(p1, p2);
        baseAmount = Math.max(p1, p2);
      }
    } else {
      // No hay multiplicador obvio, buscamos el que parezca TC y multiplicamos los demás
      const tc = parts.find(p => (currency === 'UDI' && p >= 5.0 && p <= 8.8) || (currency === 'USD' && p >= 14.0 && p <= 27.0));
      if (tc) {
        const remaining = parts.filter(p => p !== tc);
        baseAmount = remaining.reduce((a, b) => a * b, 1);
      } else {
        baseAmount = parts.reduce((a, b) => a * b, 1);
      }
    }
  } else if (parts.length === 2) {
    // Caso típico: base * tc (ej: 3053.68 * 8.1) o base * freq (ej: 727 * 12, ya en UDI)
    const p1 = parts[0];
    const p2 = parts[1];
    
    const isP1Rate = (currency === 'UDI' && p1 >= 5.0 && p1 <= 8.8) || (currency === 'USD' && p1 >= 14.0 && p1 <= 27.0);
    const isP2Rate = (currency === 'UDI' && p2 >= 5.0 && p2 <= 8.8) || (currency === 'USD' && p2 >= 14.0 && p2 <= 27.0);
    
    if (isP1Rate && !isP2Rate) {
      exchangeRateValue = p1;
      baseAmount = p2;
    } else if (isP2Rate && !isP1Rate) {
      exchangeRateValue = p2;
      baseAmount = p1;
    } else {
      // Ninguno se parece a un tipo de cambio típico, lo que significa que es base * freq ya en UDI (ej: 727 * 12)
      // En este caso, mantenemos ambos multiplicados
      baseAmount = p1 * p2;
    }
  } else if (parts.length === 1) {
    baseAmount = parts[0];
  }
  
  if (baseAmount > 0) {
    return parseFloat((baseAmount * frequencyMultiplier).toFixed(2));
  }
  
  return defaultVal;
};

// ======================================
// MIDDLEWARE DE AUTENTICACIÓN
// ======================================
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Sin autorización' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = users.find(u => u.id === decoded.id);
    if (!user) throw new Error();
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token inválido' });
  }
};

// Endpoint para el tipo de cambio
app.get('/api/rates', authMiddleware, (req, res) => {
  res.json(exchangeRates);
});

// Middleware para verificar Admin
const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acceso denegado' });
  next();
};

// ======================================
// ENDPOINTS DE AUTENTICACIÓN
// ======================================
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }

  if (user.blocked) {
    return res.status(403).json({ error: 'Tu cuenta ha sido bloqueada. Contacta a tu promotor.' });
  }

  const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatarUrl: user.avatarUrl || null,
      avatarConfig: user.avatarConfig || null
    }
  });
});

// ======================================
// ENDPOINTS PROTEGIDOS (Multi-Tenant)
// ======================================

// Actualizar perfil de usuario (Avatar y foto)
app.put('/api/user/profile', authMiddleware, (req, res) => {
  const { avatarUrl, avatarConfig } = req.body;
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  if (avatarUrl !== undefined) user.avatarUrl = avatarUrl;
  if (avatarConfig !== undefined) user.avatarConfig = avatarConfig;

  saveDB();
  res.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatarUrl: user.avatarUrl,
      avatarConfig: user.avatarConfig
    }
  });
});

// Clientes del usuario autenticado
app.get('/api/clients', authMiddleware, (req, res) => {
  res.json(req.user.clients);
});

// Crear nuevo cliente
app.post('/api/clients', authMiddleware, (req, res) => {
  const maxId = req.user.clients.reduce((max, c) => Math.max(max, c.id), 0);
  const data = req.body;

  const emDate = parseDate(data.emissionDate || '');
  const initialStatus = 'Pagada';
  
  // Calcular el siguiente vencimiento futuro para que inicie como Pagada y no venza este mes
  const colDate = getInitialCollectionDate(emDate, data.paymentFrequency || 'MENSUAL', 'Pagada');
  const collectionDay = colDate ? new Date(colDate + 'T00:00:00').getDate() : "";

  const newClient = {
    id: maxId + 1,
    contractor: data.contractor || '',
    contractorBirthDate: data.contractorBirthDate || '',
    email: data.email || '',
    insureds: data.insureds || [{ name: data.contractor, birthDate: data.contractorBirthDate || '' }],
    policyNumber: data.policyNumber || '',
    emissionDate: emDate,
    collectionDate: colDate,
    collectionDay: collectionDay,
    paymentFrequency: data.paymentFrequency || 'MENSUAL',
    paymentMethod: data.paymentMethod || 'TC',
    planType: data.planType || '',
    product: data.product || 'Vida',
    annualPremium: parseFloat(data.annualPremium) || 0,
    premium: parseFloat(data.premium) || 0, // Calculated installment
    currency: data.currency || 'UDI',
    phone: data.phone || '',
    status: initialStatus,
    paymentDate: initialStatus === 'Pagada' ? new Date().toISOString().slice(0, 10) : null,
    documents: []
  };

  req.user.clients.push(newClient);
  saveDB();
  res.json({ success: true, client: newClient });
});

// Editar cliente
app.put('/api/clients/:clientId', authMiddleware, (req, res) => {
  const index = req.user.clients.findIndex(c => c.id == req.params.clientId);
  if (index === -1) return res.status(404).json({ error: 'Cliente no encontrado' });

  const data = req.body;
  req.user.clients[index] = {
    ...req.user.clients[index],
    contractor: data.contractor !== undefined ? data.contractor : req.user.clients[index].contractor,
    contractorBirthDate: data.contractorBirthDate !== undefined ? data.contractorBirthDate : req.user.clients[index].contractorBirthDate,
    insureds: data.insureds !== undefined ? data.insureds : req.user.clients[index].insureds,
    email: data.email !== undefined ? data.email : req.user.clients[index].email,
    policyNumber: data.policyNumber !== undefined ? data.policyNumber : req.user.clients[index].policyNumber,
    emissionDate: data.emissionDate !== undefined ? data.emissionDate : req.user.clients[index].emissionDate,
    collectionDate: data.collectionDate !== undefined ? data.collectionDate : req.user.clients[index].collectionDate,
    paymentFrequency: data.paymentFrequency !== undefined ? data.paymentFrequency : req.user.clients[index].paymentFrequency,
    paymentMethod: data.paymentMethod !== undefined ? data.paymentMethod : req.user.clients[index].paymentMethod,
    planType: data.planType !== undefined ? data.planType : req.user.clients[index].planType,
    product: data.product !== undefined ? data.product : req.user.clients[index].product,
    annualPremium: data.annualPremium !== undefined ? parseFloat(data.annualPremium) : req.user.clients[index].annualPremium,
    premium: data.premium !== undefined ? parseFloat(data.premium) : req.user.clients[index].premium,
    currency: data.currency !== undefined ? data.currency : req.user.clients[index].currency,
    phone: data.phone !== undefined ? data.phone : req.user.clients[index].phone,
  };
  
  if (data.collectionDate) {
    req.user.clients[index].collectionDay = new Date(data.collectionDate).getDate();
  }

  saveDB();
  res.json({ success: true, client: req.user.clients[index] });
});


// Eliminar cliente
app.delete('/api/clients/:clientId', authMiddleware, (req, res) => {
  const index = req.user.clients.findIndex(c => c.id == req.params.clientId);
  if (index === -1) return res.status(404).json({ error: 'Cliente no encontrado' });
  req.user.clients.splice(index, 1);
  saveDB();
  res.json({ success: true });
});

// Subir documento a un cliente del usuario
app.post('/api/upload/:clientId', authMiddleware, upload.single('document'), (req, res) => {
  const client = req.user.clients.find(c => c.id == req.params.clientId);
  if (client && req.file) {
    client.documents.push({
      name: req.file.originalname,
      path: req.file.path,
      category: req.body.category || 'Otros'
    });
    saveDB();
    return res.json({ success: true, client });
  }
  res.status(404).json({ error: 'Cliente no encontrado' });
});

// Eliminar documento de un cliente
app.delete('/api/upload/:clientId/:docIndex', authMiddleware, (req, res) => {
  const client = req.user.clients.find(c => c.id == req.params.clientId);
  if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });

  const docIndex = parseInt(req.params.docIndex);
  if (isNaN(docIndex) || docIndex < 0 || docIndex >= client.documents.length) {
    return res.status(400).json({ error: 'Índice de documento inválido' });
  }

  const deletedDoc = client.documents[docIndex];
  
  // Eliminar el archivo físico del disco si existe
  try {
    const fs = require('fs');
    const filePath = path.join(__dirname, deletedDoc.path);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error('Error al eliminar archivo físico:', err);
  }

  client.documents.splice(docIndex, 1);
  saveDB();
  res.json({ success: true, client });
});

// Endpoint para parsear carátula de póliza
app.post('/api/policies/parse', authMiddleware, upload.single('policy'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se subió ningún archivo' });
  }

  try {
    const filePath = path.resolve(req.file.path);
    const dataBuffer = new Uint8Array(fs.readFileSync(filePath));
    
    // Parsear el PDF
    const parser = new PDFParse(dataBuffer);
    const pdfData = await parser.getText();
    const text = pdfData.text;
    console.log('--- EXTRACTED TEXT START ---\n', text.substring(0, 3000), '\n--- EXTRACTED TEXT END ---');

    // Objeto estructurado para almacenar los campos
    const result = {
      policyNumber: '',
      product: 'Vida',
      planType: '',
      contractor: '',
      insureds: [],
      emissionDate: '',
      collectionDate: '',
      paymentFrequency: 'MENSUAL',
      currency: 'UDI',
      premium: 0
    };

    // --- EXPRESIONES REGULARES DE EXTRACCIÓN ---

    // 1. Póliza No. (Regex flexible que extrae GM/VI seguido de dígitos con precisión absoluta)
    const policyMatch = text.match(/\b(GM\d+|VI\d+)/i);
    if (policyMatch) {
      result.policyNumber = policyMatch[1].trim();
      // Auto-detección de ramo
      if (result.policyNumber.toUpperCase().startsWith('VI')) {
        result.product = 'Vida';
      } else if (result.policyNumber.toUpperCase().startsWith('GM')) {
        result.product = 'GMM';
        result.currency = 'MXN'; // GMM siempre es en pesos
      }
    }

    if (result.product === 'GMM') {
      // --- LÓGICA DE EXTRACCIÓN EXCLUSIVA PARA GMM (Gastos Médicos Mayores) ---

      // 2. Plan (Búsqueda global de planes oficiales del CRM)
      const textUpper = text.toUpperCase();
      if (textUpper.includes('PRACTICO') || textUpper.includes('PRÁCTICO')) {
        result.planType = 'PRACTICO';
      } else if (textUpper.includes('INTEGRO') || textUpper.includes('ÍNTEGRO')) {
        result.planType = 'INTEGRO';
      } else if (textUpper.includes('PLENO')) {
        result.planType = 'PLENO';
      } else if (textUpper.includes('FLEX A')) {
        result.planType = 'FLEX A';
      } else if (textUpper.includes('FLEX B')) {
        result.planType = 'FLEX B';
      } else {
        result.planType = 'PLENO';
      }

      // 3. Contratante GMM (Soporta el formato de columnas del PDF de Seguros Monterrey)
      const contractorIndex = text.indexOf('CONTRA TA NTE');
      if (contractorIndex !== -1) {
        const afterContractor = text.substring(contractorIndex);
        const linesAfter = afterContractor.split('\n');
        if (linesAfter.length > 1) {
          let rawLine = linesAfter[1].trim();
          const parts = rawLine.split(/\t|\s{2,}/);
          if (parts.length > 0) {
            rawLine = parts[0].trim();
          }
          rawLine = rawLine.replace(/(PLAN|PÓLIZA|No\.|EMISIÓN|VIGENCIA|EDAD|FECHA|RFC|DOMICILIO|C\.P\.).*/i, '').trim();
          const nameMatch = rawLine.match(/^[A-Z\sÁÉÍÓÚÑ]+/i);
          result.contractor = nameMatch ? nameMatch[0].trim() : rawLine;
        }
      }
      
      // Fallback contratante
      if (!result.contractor) {
        const contractorMatch = text.match(/CONTRATANTE\s*([^\n\r]+)/i);
        if (contractorMatch) {
          let rawName = contractorMatch[1].trim();
          const parts = rawName.split(/\s{2,}/);
          if (parts.length > 0) {
            rawName = parts[0].trim();
          }
          rawName = rawName.replace(/(PLAN|PÓLIZA|No\.|EMISIÓN|VIGENCIA|EDAD|FECHA|RFC|DOMICILIO|C\.P\.).*/i, '').trim();
          const nameMatch = rawName.match(/^[A-Z\sÁÉÍÓÚÑ]+/i);
          result.contractor = nameMatch ? nameMatch[0].trim() : rawName;
        }
      }

      // 4. Asegurado Titular y Fechas de Nacimiento y Alta
      // Buscamos la fila "1. [Nombre] TITULAR GÉNERO EDAD FECHA_NACIMIENTO FECHA_ALTA"
      const insuredLineMatch = text.match(/1\.\s+([A-Z\sÁÉÍÓÚÑ]+?)\s+(?:TITULAR|MUJER|HOMBRE|CONYUGE|HIJO)[^\n\r]+/i);
      if (insuredLineMatch) {
        const lineText = insuredLineMatch[0];
        let rawName = insuredLineMatch[1].trim();
        rawName = rawName.replace(/(PLAN|PÓLIZA|No\.|EMISIÓN|VIGENCIA|EDAD|FECHA|RFC|DOMICILIO|C\.P\.).*/i, '').trim();
        const nameMatch = rawName.match(/^[A-Z\sÁÉÍÓÚÑ]+/i);
        const insuredName = nameMatch ? nameMatch[0].trim() : rawName;

        // Extraer fechas con formato DD-MM-AAAA o DD/MM/AAAA de esa línea
        const dateMatches = lineText.match(/([0-9]{2}[-/][0-9]{2}[-/][0-9]{4})/g);
        let birthDate = '';
        let emissionDate = '';

        if (dateMatches && dateMatches.length >= 2) {
          // Primera fecha: Nacimiento
          const dobParts = dateMatches[0].split(/[-/]/);
          if (dobParts.length === 3) {
            birthDate = `${dobParts[2]}-${dobParts[1]}-${dobParts[0]}`; // YYYY-MM-DD
          }
          // Segunda fecha: Alta (que en GMM es la Emisión)
          const altaParts = dateMatches[1].split(/[-/]/);
          if (altaParts.length === 3) {
            emissionDate = `${altaParts[2]}-${altaParts[1]}-${altaParts[0]}`; // YYYY-MM-DD
          }
        }

        result.insureds.push({ name: insuredName, birthDate: birthDate });
        if (emissionDate) {
          result.emissionDate = emissionDate;
          result.collectionDate = emissionDate;
        }
      }

      // Fallback para fecha de emisión de GMM (en caso de que no venga la tabla de arriba o falle)
      if (!result.emissionDate) {
        const iniciaMatch = text.match(/INICIA\s+A\s+LAS\s+12\s+HRS\s+DEL\s+DÍA\s*([0-9]{2}[-/][0-9]{2}[-/][0-9]{4})/i);
        if (iniciaMatch) {
          const parts = iniciaMatch[1].split(/[-/]/);
          result.emissionDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
          result.collectionDate = result.emissionDate;
        }
      }

      // 5. Forma de Pago GMM
      const frequencyMatch = text.match(/FORMA\s+DE\s*PAGO\s*([A-Z]+)/i);
      if (frequencyMatch) {
        result.paymentFrequency = frequencyMatch[1].trim().toUpperCase();
      }

      // 6. Prima Inicial GMM: Tomar el último TOTAL monetario del texto
      const totalMatches = [...text.matchAll(/TOTAL\s*(?:\$)?\s*([0-9,]+\.[0-9]{2})/gi)];
      if (totalMatches && totalMatches.length > 0) {
        const lastTotalMatch = totalMatches[totalMatches.length - 1];
        result.premium = parseFloat(lastTotalMatch[1].replace(/,/g, ''));
      }

    } else {
      // --- LÓGICA DE EXTRACCIÓN PARA VIDA (ORVI, etc.) ---

      // 2. Plan Básico
      const planMatch = text.match(/PLAN\s+BÁSICO\s*([^\n\r]+)/i);
      if (planMatch) {
        let rawPlan = planMatch[1].trim();
        const planWords = rawPlan.split(/\s+/);
        if (planWords.length > 1) {
          result.planType = (planWords[0] + ' ' + planWords[1]).replace(/[^a-zA-Z0-9\s]/g, '');
        } else {
          result.planType = rawPlan.replace(/[^a-zA-Z0-9\s]/g, '');
        }
      }

      // 3. Contratante
      const contractorMatch = text.match(/CONTRATANTE\s*([^\n\r]+)/i);
      if (contractorMatch) {
        let rawName = contractorMatch[1].trim();
        const parts = rawName.split(/\s{2,}/);
        if (parts.length > 0) {
          rawName = parts[0].trim();
        }
        rawName = rawName.replace(/(PLAN|PÓLIZA|No\.|EMISIÓN|VIGENCIA|EDAD|FECHA|RFC|DOMICILIO|C\.P\.).*/i, '').trim();
        const nameMatch = rawName.match(/^[A-Z\sÁÉÍÓÚÑ]+/i);
        result.contractor = nameMatch ? nameMatch[0].trim() : rawName;
      }

      // 4. Asegurado
      const insuredMatch = text.match(/ASEGURADO\s*([^\n\r]+)/i);
      if (insuredMatch) {
        let rawName = insuredMatch[1].trim();
        const parts = rawName.split(/\s{2,}/);
        if (parts.length > 0) {
          rawName = parts[0].trim();
        }
        rawName = rawName.replace(/(PLAN|PÓLIZA|No\.|EMISIÓN|VIGENCIA|EDAD|FECHA|RFC|DOMICILIO|C\.P\.).*/i, '').trim();
        const nameMatch = rawName.match(/^[A-Z\sÁÉÍÓÚÑ]+/i);
        const insuredName = nameMatch ? nameMatch[0].trim() : rawName;
        // Buscar Fecha de Nacimiento
        const dobMatch = text.match(/FECHA\s+DE\s*NACIMIENTO\s*([0-9]{1,2}\/[A-Z]{3,4}\/[0-9]{4})/i);
        let birthDate = '';
        if (dobMatch) {
          const rawDob = dobMatch[1].trim();
          const months = {
            ENE: '01', JAN: '01', FEB: '02', MAR: '03', ABR: '04', APR: '04', MAY: '05', JUN: '06',
            JUL: '07', AGO: '08', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DIC: '12', DEC: '12'
          };
          const parts = rawDob.split('/');
          if (parts.length === 3) {
            const day = parts[0].padStart(2, '0');
            const monthStr = parts[1].toUpperCase();
            const month = months[monthStr] || '01';
            const year = parts[2];
            birthDate = `${year}-${month}-${day}`;
          }
        }
        result.insureds.push({ name: insuredName, birthDate: birthDate });
      }

      // 5. Fecha de Emisión
      const emissionMatch = text.match(/FECHA\s+DE\s*EMISIÓN\s*([0-9]{1,2}\/[A-Z]{3,4}\/[0-9]{4})/i);
      if (emissionMatch) {
        const rawDate = emissionMatch[1].trim();
        const months = {
          ENE: '01', JAN: '01', FEB: '02', MAR: '03', ABR: '04', APR: '04', MAY: '05', JUN: '06',
          JUL: '07', AGO: '08', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DIC: '12', DEC: '12'
        };
        const parts = rawDate.split('/');
        if (parts.length === 3) {
          const day = parts[0].padStart(2, '0');
          const monthStr = parts[1].toUpperCase();
          const month = months[monthStr] || '01';
          const year = parts[2];
          result.emissionDate = `${year}-${month}-${day}`;
          result.collectionDate = `${year}-${month}-${day}`;
        }
      }

      // 6. Forma de Pago
      const frequencyMatch = text.match(/FORMA\s+DE\s*PAGO\s*([A-Z]+)/i);
      if (frequencyMatch) {
        result.paymentFrequency = frequencyMatch[1].trim().toUpperCase();
      }

      // 7. Moneda
      const currencyMatch = text.match(/MONEDA\s*([A-Z]+)/i);
      if (currencyMatch) {
        result.currency = currencyMatch[1].trim().toUpperCase();
      }

      // 8. Prima Inicial (Sumar la prima del plan básico más las primas de las coberturas adicionales)
      let summedPremium = 0;
      let foundCoverages = false;
      const lines = text.split('\n');
      
      lines.forEach(line => {
        const trimmedLine = line.trim();
        if (trimmedLine.match(/^[0-9,]+\.[0-9]{2}$/)) {
          const val = parseFloat(trimmedLine.replace(/,/g, ''));
          summedPremium += val;
          foundCoverages = true;
        }
      });

      if (foundCoverages && summedPremium > 0) {
        result.premium = parseFloat(summedPremium.toFixed(2));
      } else {
        // Fallback si no se pudieron identificar líneas de coberturas
        if (result.planType) {
          const escapedPlan = result.planType.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          const planLineRegex = new RegExp(escapedPlan + '.*?[0-9,]+\\.[0-9]{2}$', 'i');
          const lineMatch = text.match(planLineRegex);
          if (lineMatch) {
            const numbers = lineMatch[0].match(/([0-9,]+\.[0-9]{2})/g);
            if (numbers && numbers.length > 0) {
              result.premium = parseFloat(numbers[numbers.length - 1].replace(/,/g, ''));
            }
          }
        }

        if (!result.premium) {
          const floatMatches = text.match(/([0-9]{1,3},[0-9]{3}\.[0-9]{2}|[0-9]+\.[0-9]{2})/g);
          if (floatMatches && floatMatches.length > 0) {
            result.premium = parseFloat(floatMatches[0].replace(/,/g, ''));
          }
        }
      }
    }

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error al parsear carátula:', error);
    res.status(500).json({ error: 'Error interno al procesar el documento PDF' });
  } finally {
    try {
      const filePath = path.resolve(req.file.path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      console.error('Error al limpiar archivo temporal:', err);
    }
  }
});

// Dashboard personalizado del usuario
app.get('/api/dashboard', authMiddleware, (req, res) => {
  const now = new Date();
  const today = now.getDate();
  const clientsData = req.user.clients;

  // Auto-rollover de pólizas pagadas cuya fecha de cobro ya pasó
  let dbChanged = false;
  clientsData.forEach(c => {
    if (c.status === 'Pagada' && c.collectionDate) {
      const colDate = new Date(c.collectionDate);
      colDate.setHours(23, 59, 59, 999);
      if (colDate < now) {
        // Calcular el siguiente periodo según frecuencia
        const freq = (c.paymentFrequency || 'MENSUAL').toUpperCase();
        let monthsToAdd = 1;
        if (freq === 'TRIMESTRAL') monthsToAdd = 3;
        else if (freq === 'SEMESTRAL') monthsToAdd = 6;
        else if (freq === 'ANUAL') monthsToAdd = 12;

        const nextDate = new Date(c.collectionDate);
        nextDate.setMonth(nextDate.getMonth() + monthsToAdd);
        
        c.collectionDate = nextDate.toISOString().slice(0, 10);
        c.status = 'Pendiente';
        c.paymentDate = null;
        dbChanged = true;
      }
    }
  });
  if (dbChanged) {
    saveDB();
  }

  const kpis = { collected: 0, total: 0, pending: 0 };
  const upcomingLists = {
    hoy: [],
    en5Dias: [],
    en15Dias: [],
    enMes: []
  };
  const collectedList = [];
  const currentMonthStr = ('0' + (now.getMonth() + 1)).slice(-2);

  clientsData.forEach(c => {
    kpis.total += (c.premium || 0);
    if (c.status === 'Pagada') {
      kpis.collected += (c.premium || 0);
      if (c.paymentDate && c.paymentDate.slice(5, 7) === currentMonthStr) {
        collectedList.push({
          id: c.id,
          name: c.contractor,
          policyNumber: c.policyNumber,
          amount: c.premium,
          currency: c.currency,
          product: c.product,
          collectionDate: c.collectionDate,
          paymentDate: c.paymentDate,
          paymentFrequency: c.paymentFrequency || 'MENSUAL'
        });
      }
    } else {
      kpis.pending += (c.premium || 0);
      
      let diff;
      if (c.collectionDate) {
        // Diferencia exacta en días si hay fecha completa
        const colDate = new Date(c.collectionDate);
        colDate.setHours(23, 59, 59, 999);
        diff = Math.ceil((colDate - now) / (1000 * 60 * 60 * 24));
      } else {
        // Fallback a lógica mensual anterior
        diff = (c.collectionDay || 1) - today;
      }
      
      // We only care about pending policies for "Cobranza Próxima"
      const alertItem = {
        id: c.id,
        name: c.contractor, 
        policyNumber: c.policyNumber,
        amount: c.premium,
        currency: c.currency,
        product: c.product,
        days: diff,
        phone: c.phone,
        collectionDate: c.collectionDate,
        paymentFrequency: c.paymentFrequency || 'MENSUAL'
      };

      if (diff === 0) upcomingLists.hoy.push(alertItem);
      else if (diff > 0 && diff <= 5) upcomingLists.en5Dias.push(alertItem);
      else if (diff > 5 && diff <= 15) upcomingLists.en15Dias.push(alertItem);
      else if (diff > 15 && diff <= 30) upcomingLists.enMes.push(alertItem);
      // Incluimos atrasados en "hoy" para atención urgente
      else if (diff < 0) upcomingLists.hoy.push({...alertItem, days: diff});
    }
  });

  const currentMonth = ('0' + (now.getMonth() + 1)).slice(-2);
  const currentYearInt = now.getFullYear();
  const birthdays = [];
  const anniversaries = [];

  clientsData.forEach(c => {
    // Revisar Cumpleaños del Contratante
    if (c.contractorBirthDate && c.contractorBirthDate.slice(5, 7) === currentMonth) {
      const day = c.contractorBirthDate.slice(8, 10);
      birthdays.push({ 
        name: c.contractor, 
        type: `Contratante (Día ${day})`,
        policy: c.policyNumber,
        day: parseInt(day)
      });
    }

    // Revisar Cumpleaños de los Asegurados
    c.insureds.forEach(ins => {
      // Evitar duplicados si el asegurado es el mismo contratante y tienen la misma fecha
      if (ins.birthDate && ins.birthDate.slice(5, 7) === currentMonth) {
        if (ins.name === c.contractor && ins.birthDate === c.contractorBirthDate) return; 

        const day = ins.birthDate.slice(8, 10);
        birthdays.push({ 
          name: ins.name, 
          type: `Asegurado (Día ${day})`,
          policy: c.policyNumber,
          day: parseInt(day)
        });
      }
    });

    // Revisar Aniversarios de Pólizas (basado en emissionDate)
    if (c.emissionDate && c.emissionDate.slice(5, 7) === currentMonth) {
      const day = c.emissionDate.slice(8, 10);
      const emissionYear = parseInt(c.emissionDate.slice(0, 4));
      const years = currentYearInt - emissionYear;
      if (years > 0) {
        anniversaries.push({
          name: c.contractor,
          policy: c.policyNumber,
          day: parseInt(day),
          years: years
        });
      }
    }
  });
  
  // Ordenar cumpleaños y aniversarios por día del mes
  birthdays.sort((a, b) => a.day - b.day);
  anniversaries.sort((a, b) => a.day - b.day);

  // Ordenar listas
  upcomingLists.hoy.sort((a, b) => a.days - b.days);
  upcomingLists.en5Dias.sort((a, b) => a.days - b.days);
  upcomingLists.en15Dias.sort((a, b) => a.days - b.days);
  upcomingLists.enMes.sort((a, b) => a.days - b.days);
  collectedList.sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate));

  res.json({
    kpis,
    upcomingLists,
    collectedList,
    birthdays,
    anniversaries
  });
});

// Analíticas del CRM con Proyección de Cobros
app.get('/api/analytics', authMiddleware, (req, res) => {
  const { year, month } = req.query;
  let clientsData = req.user.clients || [];

  const currentYear = year || new Date().getFullYear().toString();
  
  let kpiCollected = 0;
  let kpiPending = 0;
  let kpiCollectedMXN = 0;
  let kpiPendingMXN = 0;

  let kpiNewSalesCount = 0;
  let kpiNewSalesMXN = 0;
  let kpiRenewalsMXN = 0;

  const portfolio = {
    USD: 0,
    UDI: 0,
    MXN: 0,
    GMM: 0,
    totalMXN: 0
  };

  const convertToMXN = (amount, currency) => {
    const cur = String(currency || 'MXN').toUpperCase().trim();
    const rate = exchangeRates[cur] || 1;
    return amount * rate;
  };

  const lists = {
    collected: [],
    pending: [],
    newSales: [],
    renewals: [],
    active: [],
    allActive: []
  };

  const segments = {
    vidaUDI: { count: 0, collected: 0, pending: 0, collectedMXN: 0, pendingMXN: 0 },
    vidaUSD: { count: 0, collected: 0, pending: 0, collectedMXN: 0, pendingMXN: 0 },
    vidaMXN: { count: 0, collected: 0, pending: 0, collectedMXN: 0, pendingMXN: 0 },
    gmm: { count: 0, collected: 0, pending: 0, collectedMXN: 0, pendingMXN: 0 }
  };

  const monthlyFlow = Array.from({ length: 12 }, (_, i) => ({
    name: new Date(2000, i, 1).toLocaleString('es-MX', { month: 'short' }).replace('.', '').toUpperCase(),
    mes: i + 1,
    cobrado: 0,
    pendiente: 0,
    cobradoMXN: 0,
    pendienteMXN: 0,
    ventas: 0
  }));

  const productDist = {};
  const planDist = {};

  const isPaymentScheduledIn = (client, targetYearStr, targetMonthStr) => {
    const emissionStr = client.paymentDate || client.collectionDate || client.emissionDate || '';
    if (!emissionStr) return false;

    const [eYearStr, eMonthStr] = emissionStr.split('-');
    const eYear = parseInt(eYearStr);
    const eMonth = parseInt(eMonthStr);
    const tYear = parseInt(targetYearStr);
    const tMonth = parseInt(targetMonthStr);

    if (eYear > tYear) return false;
    if (tMonth < eMonth) return false;

    const freq = String(client.paymentFrequency || 'MENSUAL').toUpperCase().trim();

    if (freq === 'MENSUAL' || freq === 'MENSUALES') return true;
    if (freq === 'TRIMESTRAL' || freq === 'TRIMESTRALES') return Math.abs(tMonth - eMonth) % 3 === 0;
    if (freq === 'SEMESTRAL' || freq === 'SEMESTRALES') return Math.abs(tMonth - eMonth) % 6 === 0;
    if (freq === 'ANUAL' || freq === 'ANUALES') return tMonth === eMonth;

    return false;
  };

  // 1. Calcular Valor Total de Cartera
  clientsData.forEach(c => {
    const prod = String(c.product || 'Vida').trim().toLowerCase();
    const isGMM = prod.includes('gastos') || prod.includes('gmm') || prod.includes('médicos');
    const cur = String(c.currency || 'MXN').toUpperCase().trim();
    const premiumVal = c.premium || 0;
    
    let divisor = 1;
    const freq = String(c.paymentFrequency || 'ANUAL').toUpperCase().trim();
    if (freq.includes('MENS')) divisor = 12;
    else if (freq.includes('TRIM')) divisor = 4;
    else if (freq.includes('SEME')) divisor = 2;

    const annualized = premiumVal * divisor;
    
    if (isGMM) {
      portfolio.GMM += convertToMXN(annualized, cur);
    } else {
      if (cur.includes('USD')) portfolio.USD += annualized;
      else if (cur.includes('UDI')) portfolio.UDI += annualized;
      else portfolio.MXN += annualized;
    }

    portfolio.totalMXN += convertToMXN(annualized, cur);
    lists.allActive.push(c);
  });

  // 2. Procesar KPIs y Lógicas de Mes / Año
  clientsData.forEach(c => {
    const prod = String(c.product || 'Vida').trim().toLowerCase();
    const isGMM = prod.includes('gastos') || prod.includes('gmm') || prod.includes('médicos');
    const cur = String(c.currency || 'MXN').toUpperCase().trim();
    const premiumVal = c.premium || 0;
    const mxnVal = convertToMXN(premiumVal, c.currency);

    const emissionStr = c.emissionDate || c.paymentDate || c.collectionDate || '';
    let eYear = '', eMonth = '';
    if (emissionStr) {
      [eYear, eMonth] = emissionStr.split('-');
    }

    if (month) {
      // Filtrado por mes específico
      const scheduled = isPaymentScheduledIn(c, currentYear, month);
      const isNewSale = (eYear === currentYear && parseInt(eMonth) === parseInt(month));

      if (scheduled) {
        lists.active.push(c);
        
        if (isNewSale) {
          kpiNewSalesCount++;
          kpiNewSalesMXN += mxnVal;
          lists.newSales.push(c);
        } else {
          kpiRenewalsMXN += mxnVal;
          lists.renewals.push(c);
        }

        const isPaidThisMonth = c.status === 'Pagada' && c.paymentDate && c.paymentDate.startsWith(`${currentYear}-${month}`);

        if (isPaidThisMonth) {
          kpiCollected += premiumVal;
          kpiCollectedMXN += mxnVal;
          
          const cCopy = { ...c, status: 'Pagada' };
          lists.collected.push(cCopy);

          if (isGMM) {
            segments.gmm.count++;
            segments.gmm.collected += premiumVal;
            segments.gmm.collectedMXN += mxnVal;
          } else {
            if (cur.includes('UDI')) {
              segments.vidaUDI.count++;
              segments.vidaUDI.collected += premiumVal;
              segments.vidaUDI.collectedMXN += mxnVal;
            } else if (cur.includes('USD')) {
              segments.vidaUSD.count++;
              segments.vidaUSD.collected += premiumVal;
              segments.vidaUSD.collectedMXN += mxnVal;
            } else {
              segments.vidaMXN.count++;
              segments.vidaMXN.collected += premiumVal;
              segments.vidaMXN.collectedMXN += mxnVal;
            }
          }
        } else {
          kpiPending += premiumVal;
          kpiPendingMXN += mxnVal;
          
          const cCopy = { ...c, status: 'Pendiente' };
          lists.pending.push(cCopy);

          if (isGMM) {
            segments.gmm.count++;
            segments.gmm.pending += premiumVal;
            segments.gmm.pendingMXN += mxnVal;
          } else {
            if (cur.includes('UDI')) {
              segments.vidaUDI.count++;
              segments.vidaUDI.pending += premiumVal;
              segments.vidaUDI.pendingMXN += mxnVal;
            } else if (cur.includes('USD')) {
              segments.vidaUSD.count++;
              segments.vidaUSD.pending += premiumVal;
              segments.vidaUSD.pendingMXN += mxnVal;
            } else {
              segments.vidaMXN.count++;
              segments.vidaMXN.pending += premiumVal;
              segments.vidaMXN.pendingMXN += mxnVal;
            }
          }
        }

        const productKey = isGMM ? 'GMM' : 'Vida';
        productDist[productKey] = (productDist[productKey] || 0) + 1;

        const plan = c.planType || c.product || 'Otros';
        planDist[plan] = (planDist[plan] || 0) + 1;
      }
    } else {
      // Vista Anual
      const qualifiesThisYear = c.emissionDate && parseInt(c.emissionDate.split('-')[0]) <= parseInt(currentYear);
      if (qualifiesThisYear) {
        lists.active.push(c);

        if (eYear === currentYear) {
          kpiNewSalesCount++;
          kpiNewSalesMXN += mxnVal; // Simplificación anual
        }

        for (let m = 1; m <= 12; m++) {
          const scheduled = isPaymentScheduledIn(c, currentYear, m);
          if (scheduled) {
            const mStr = String(m).padStart(2, '0');
            const isPaidThisMonth = c.status === 'Pagada' && c.paymentDate && c.paymentDate.startsWith(`${currentYear}-${mStr}`);

            if (isPaidThisMonth) {
              kpiCollected += premiumVal;
              kpiCollectedMXN += mxnVal;

              if (isGMM) {
                segments.gmm.count++;
                segments.gmm.collected += premiumVal;
                segments.gmm.collectedMXN += mxnVal;
              } else {
                if (cur.includes('UDI')) {
                  segments.vidaUDI.count++;
                  segments.vidaUDI.collected += premiumVal;
                  segments.vidaUDI.collectedMXN += mxnVal;
                } else if (cur.includes('USD')) {
                  segments.vidaUSD.count++;
                  segments.vidaUSD.collected += premiumVal;
                  segments.vidaUSD.collectedMXN += mxnVal;
                } else {
                  segments.vidaMXN.count++;
                  segments.vidaMXN.collected += premiumVal;
                  segments.vidaMXN.collectedMXN += mxnVal;
                }
              }
            } else {
              kpiPending += premiumVal;
              kpiPendingMXN += mxnVal;

              if (isGMM) {
                segments.gmm.count++;
                segments.gmm.pending += premiumVal;
                segments.gmm.pendingMXN += mxnVal;
              } else {
                if (cur.includes('UDI')) {
                  segments.vidaUDI.count++;
                  segments.vidaUDI.pending += premiumVal;
                  segments.vidaUDI.pendingMXN += mxnVal;
                } else if (cur.includes('USD')) {
                  segments.vidaUSD.count++;
                  segments.vidaUSD.pending += premiumVal;
                  segments.vidaUSD.pendingMXN += mxnVal;
                } else {
                  segments.vidaMXN.count++;
                  segments.vidaMXN.pending += premiumVal;
                  segments.vidaMXN.pendingMXN += mxnVal;
                }
              }
            }
          }
        }

        const productKey = isGMM ? 'GMM' : 'Vida';
        productDist[productKey] = (productDist[productKey] || 0) + 1;

        const plan = c.planType || c.product || 'Otros';
        planDist[plan] = (planDist[plan] || 0) + 1;
      }
    }

    // Flujo mensual para la gráfica de área
    for (let mIndex = 0; mIndex < 12; mIndex++) {
      const scheduled = isPaymentScheduledIn(c, currentYear, mIndex + 1);
      if (scheduled) {
        const mStr = String(mIndex + 1).padStart(2, '0');
        const isPaidThisMonth = c.status === 'Pagada' && c.paymentDate && c.paymentDate.startsWith(`${currentYear}-${mStr}`);

        if (isPaidThisMonth) {
          monthlyFlow[mIndex].cobrado += premiumVal;
          monthlyFlow[mIndex].cobradoMXN += mxnVal;
          monthlyFlow[mIndex].ventas += 1;
        } else {
          monthlyFlow[mIndex].pendiente += premiumVal;
          monthlyFlow[mIndex].pendienteMXN += mxnVal;
        }
      }
    }
  });

  const pieProducts = Object.entries(productDist).map(([name, value]) => ({ name, value }));
  const piePlans = Object.entries(planDist).map(([name, value]) => ({ name, value }));

  res.json({
    kpis: {
      collected: kpiCollected,
      pending: kpiPending,
      collectedMXN: kpiCollectedMXN,
      pendingMXN: kpiPendingMXN,
      newSalesCount: kpiNewSalesCount,
      newSalesMXN: kpiNewSalesMXN,
      renewalsMXN: kpiRenewalsMXN,
      portfolio
    },
    exchangeRates,
    segments,
    lists,
    monthlyFlow,
    pieProducts,
    piePlans,
    snapshots: req.user.snapshots || [],
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      avatarUrl: req.user.avatarUrl || null,
      avatarConfig: req.user.avatarConfig || null
    }
  });
});\n\n// Guardar instantánea (Snapshot) de un mes
app.post('/api/analytics/snapshot', authMiddleware, (req, res) => {
  const { year, month, kpis, monthlyFlow, pieProducts, piePlans, exchangeRates, segments, lists } = req.body;
  
  if (!req.user.snapshots) req.user.snapshots = [];
  
  // Evitar duplicados para el mismo mes/año
  const index = req.user.snapshots.findIndex(s => s.year === year && s.month === month);
  const snapshot = {
    id: Date.now(),
    date: new Date().toISOString(),
    year,
    month,
    kpis,
    monthlyFlow,
    pieProducts,
    piePlans,
    exchangeRates,
    segments,
    lists
  };

  if (index !== -1) {
    req.user.snapshots[index] = snapshot;
  } else {
    req.user.snapshots.push(snapshot);
  }
  
  saveDB();
  res.json({ success: true, snapshot });
});

// Eliminar una instantánea (Snapshot) de un mes
app.delete('/api/analytics/snapshot/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  if (!req.user.snapshots) req.user.snapshots = [];

  const initialLength = req.user.snapshots.length;
  req.user.snapshots = req.user.snapshots.filter(s => s.id != id);

  if (req.user.snapshots.length === initialLength) {
    return res.status(404).json({ error: 'Instantánea no encontrada' });
  }

  saveDB();
  res.json({ success: true, snapshots: req.user.snapshots });
});

// Marcar póliza como pagada
app.put('/api/clients/:clientId/pay', authMiddleware, (req, res) => {
  const index = req.user.clients.findIndex(c => c.id == req.params.clientId);
  if (index === -1) return res.status(404).json({ error: 'Cliente no encontrado' });

  req.user.clients[index].status = 'Pagada';
  req.user.clients[index].paymentDate = req.body.paymentDate || new Date().toISOString().slice(0, 10);
  
  saveDB();
  res.json({ success: true, client: req.user.clients[index] });
});

// Migración Masiva (por usuario)
app.post('/api/migrate', authMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo' });

  try {
    const workbook = xlsx.readFile(req.file.path);
    // Buscar la pestaña "bd asesor" de forma insensible a mayúsculas/minúsculas
    let sheetName = workbook.SheetNames.find(name => name.trim().toLowerCase() === 'bd asesor');
    if (!sheetName) sheetName = workbook.SheetNames[0]; // Fallback a la primera pestaña
    
    // Leemos el archivo en formato crudo de matriz (array de arrays)
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    // Encontrar la fila que contiene las cabeceras buscando "cliente"
    let headerIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row && row.some(cell => String(cell || '').trim().toLowerCase() === 'cliente')) {
        headerIndex = i;
        break;
      }
    }

    let rawData = [];
    if (headerIndex !== -1) {
      const headers = rows[headerIndex].map(h => String(h || '').trim());
      const dataRows = rows.slice(headerIndex + 1);
      
      rawData = dataRows.map((row, rowIndex) => {
        const obj = {};
        headers.forEach((header, colIndex) => {
          if (header) {
            obj[header] = row[colIndex];
            
            // Si la cabecera es "Prima anual", capturamos la fórmula cruda de la celda de Excel
            if (header.toLowerCase() === 'prima anual') {
              const excelRowIndex = headerIndex + rowIndex + 2; // +1 cabecera base 0, +1 1-indexed Excel
              const colLetter = xlsx.utils.encode_col(colIndex);
              const cellAddress = `${colLetter}${excelRowIndex}`;
              const cell = sheet[cellAddress];
              if (cell && cell.f) {
                obj["_primaanualformula"] = cell.f;
              }
            }

            // Si la cabecera es "Cumpleaños", capturamos el texto formateado original de Excel (para detectar cumpleaños sin año)
            if (header.toLowerCase() === 'cumpleaños') {
              const excelRowIndex = headerIndex + rowIndex + 2;
              const colLetter = xlsx.utils.encode_col(colIndex);
              const cellAddress = `${colLetter}${excelRowIndex}`;
              const cell = sheet[cellAddress];
              if (cell && cell.w) {
                obj["_cumpleanosformatted"] = cell.w;
              }
            }
          }
        });
        return obj;
      });
    } else {
      rawData = xlsx.utils.sheet_to_json(sheet);
    }



    const maxId = req.user.clients.reduce((max, c) => Math.max(max, c.id), 0);
    const migratedClients = [];

    rawData.forEach((row) => {
      // Limpiar llaves del renglón eliminando espacios adicionales al inicio y al final en minúsculas
      const cleanRow = {};
      Object.keys(row).forEach(key => {
        cleanRow[key.trim().toLowerCase()] = row[key];
      });

      // Validar si existe un nombre de cliente
      if (!cleanRow["cliente"] || String(cleanRow["cliente"]).trim().length === 0) return;

      // Sanitizar Ramo / Producto
      const rawPlan = cleanRow["tipo de plan"] || cleanRow["plan"] || cleanRow["producto"];
      let product = "Vida"; // Default a Vida
      if (rawPlan) {
        const planTypeStr = String(rawPlan).trim().toLowerCase();
        if (planTypeStr.includes("gastos") || planTypeStr.includes("gmm") || planTypeStr.includes("médicos")) {
          product = "GMM";
        }
      }

      // Sanitizar Moneda
      const rawCur = cleanRow["tipo de moneda"] || cleanRow["moneda"];
      let currency = "";
      if (rawCur) {
        const curStr = String(rawCur).trim().toUpperCase();
        if (curStr.includes("UDI")) currency = "UDI";
        else if (curStr.includes("USD") || curStr.includes("DOL")) currency = "USD";
        else if (curStr.includes("MXN") || curStr.includes("PESO")) currency = "MXN";
        else currency = curStr;
      }
      // Defaults lógicos
      if (!currency) {
        currency = product === "GMM" ? "MXN" : "UDI";
      }

      // Parsear la fecha de emisión
      const emissionDate = parseDate(cleanRow["emisión"]);

      // Sanitizar Prima Anual
      let annualVal = String(cleanRow["prima anual"] || cleanRow["prima"] || "0");
      annualVal = annualVal.replace(/[^0-9.]/g, ''); 
      let annualPremium = parseFloat(annualVal) || 0;

      annualPremium = parseAnnualPremiumFromFormula(cleanRow["_primaanualformula"], currency, annualPremium, emissionDate);

      // Sanitizar Frecuencia
      const rawFreq = cleanRow["forma de pago"] || cleanRow["frecuencia"];
      let paymentFrequency = "MENSUAL"; // Default
      if (rawFreq) {
        const freqStr = String(rawFreq).trim().toUpperCase();
        if (freqStr.includes("MENS")) paymentFrequency = "MENSUAL";
        else if (freqStr.includes("TRIM")) paymentFrequency = "TRIMESTRAL";
        else if (freqStr.includes("SEME")) paymentFrequency = "SEMESTRAL";
        else if (freqStr.includes("ANUA")) paymentFrequency = "ANUAL";
        else paymentFrequency = freqStr;
      }

      // Calcular Prima de Cobro
      let divisor = 1;
      if (paymentFrequency === 'MENSUAL') divisor = 12;
      else if (paymentFrequency === 'TRIMESTRAL') divisor = 4;
      else if (paymentFrequency === 'SEMESTRAL') divisor = 2;
      const premium = parseFloat((annualPremium / divisor).toFixed(2));

      // Sanitizar Modo de Cobro (dejar vacío si no existe en el Excel)
      const rawMethod = cleanRow["modo de cobro"];
      let paymentMethod = "";
      if (rawMethod) {
        const methodStr = String(rawMethod).trim().toUpperCase();
        if (methodStr.includes("TC") || methodStr.includes("CRED")) paymentMethod = "TC";
        else if (methodStr.includes("TD") || methodStr.includes("DEB")) paymentMethod = "TD";
        else if (methodStr.includes("MAN") || methodStr.includes("EFEC")) paymentMethod = "Manual";
        else paymentMethod = methodStr;
      }

      // Determinar el status inicial: "Pendiente" si le toca cobro en el mes corriente, "Pagada" en caso contrario
      let status = "Pagada";
      if (isPaymentDueInCurrentMonth(emissionDate, paymentFrequency)) {
        status = "Pendiente";
      }

      // Calcular el cobro inicial de forma inteligente (para que no aparezcan cobros vencidos hace 8 años)
      const collectionDate = getInitialCollectionDate(emissionDate, paymentFrequency, status);
      const collectionDay = collectionDate ? new Date(collectionDate + 'T00:00:00').getDate() : "";

      // Parsear cumpleaños con soporte para mes/día sin año
      const contractorBirthDate = parseBirthday(cleanRow["cumpleaños"], cleanRow["_cumpleanosformatted"]);

      migratedClients.push({
        id: maxId + migratedClients.length + 1,
        contractor: String(cleanRow["cliente"]).trim(),
        contractorBirthDate,
        email: cleanRow["correo electrónico"] ? String(cleanRow["correo electrónico"]).trim() : "",
        phone: cleanRow["teléfono"] ? String(cleanRow["teléfono"]).trim() : "",
        insureds: [{ 
          name: String(cleanRow["cliente"]).trim(), 
          birthDate: contractorBirthDate 
        }],
        policyNumber: cleanRow["número de póliza"] ? String(cleanRow["número de póliza"]).trim() : "",
        emissionDate,
        collectionDate,
        collectionDay,
        paymentFrequency,
        paymentMethod,
        planType: cleanRow["nombre del plan"] ? String(cleanRow["nombre del plan"]).trim() : "",
        product,
        annualPremium,
        premium,
        currency,
        status,
        documents: []
      });
    });

    // Limpiar clientes basura "Sin Nombre" para dejar la base de datos impecable
    req.user.clients = req.user.clients.filter(c => c.contractor !== 'Sin Nombre' && c.contractor !== 'Sin Nombre' && c.contractor !== '');

    req.user.clients = [...req.user.clients, ...migratedClients];
    saveDB();

    res.json({ success: true, count: migratedClients.length });
  } catch (err) {
    res.status(500).json({ error: 'Error al procesar el archivo: ' + err.message });
  }
});

// ======================================
// ENDPOINTS DE ADMINISTRACIÓN (Solo Master)
// ======================================
// Listar usuarios (con contraseña visible para el admin)
app.get('/api/admin/users', authMiddleware, adminOnly, (req, res) => {
  res.json(users.map(u => ({
    id: u.id, name: u.name, email: u.email, role: u.role,
    rawPassword: u.rawPassword,
    blocked: u.blocked || false,
    totalClients: u.clients.length
  })));
});

// Crear usuario
app.post('/api/admin/users', authMiddleware, adminOnly, (req, res) => {
  const { email, name, password } = req.body;
  if (users.find(u => u.email === email)) {
    return res.status(400).json({ error: 'El correo ya está registrado' });
  }

  const newUser = {
    id: users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1,
    email,
    name,
    password: bcrypt.hashSync(password, 10),
    rawPassword: password,
    role: 'advisor',
    blocked: false,
    clients: []
  };
  users.push(newUser);
  res.json({ success: true, user: { id: newUser.id, name: newUser.name, email: newUser.email } });
});

// Editar usuario
app.put('/api/admin/users/:id', authMiddleware, adminOnly, (req, res) => {
  const user = users.find(u => u.id == req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  const { name, email, password } = req.body;
  if (name) user.name = name;
  if (email) {
    const existing = users.find(u => u.email === email && u.id !== user.id);
    if (existing) return res.status(400).json({ error: 'Ese correo ya está en uso' });
    user.email = email;
  }
  if (password) {
    user.password = bcrypt.hashSync(password, 10);
    user.rawPassword = password;
  }
  res.json({ success: true });
});

// Bloquear / Desbloquear usuario
app.put('/api/admin/users/:id/toggle-block', authMiddleware, adminOnly, (req, res) => {
  const user = users.find(u => u.id == req.params.id && u.role !== 'admin');
  if (!user) return res.status(404).json({ error: 'No se puede bloquear esa cuenta' });
  user.blocked = !user.blocked;
  res.json({ success: true, blocked: user.blocked });
});

// Eliminar usuario
app.delete('/api/admin/users/:id', authMiddleware, adminOnly, (req, res) => {
  const index = users.findIndex(u => u.id == req.params.id && u.role !== 'admin');
  if (index === -1) return res.status(404).json({ error: 'No se puede eliminar' });
  users.splice(index, 1);
  res.json({ success: true });
});

// Servir frontend de React en producción
app.use(express.static(path.join(__dirname, '../client/dist')));
app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 CRM Engine running on port ${PORT}`);
});

