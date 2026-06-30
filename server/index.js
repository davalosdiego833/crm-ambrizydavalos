require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const xlsx = require('xlsx');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
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

const backupDB = () => {
  try {
    const backupDir = path.join(__dirname, 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, `db-backup-${timestamp}.json`);
    
    if (fs.existsSync(DB_FILE)) {
      fs.copyFileSync(DB_FILE, backupFile);
      console.log(`💾 Respaldo de base de datos creado exitosamente: ${backupFile}`);
      
      // Limpieza: mantener solo los últimos 30 respaldos
      const files = fs.readdirSync(backupDir)
        .filter(f => f.startsWith('db-backup-') && f.endsWith('.json'))
        .map(f => ({ name: f, time: fs.statSync(path.join(backupDir, f)).mtime.getTime() }))
        .sort((a, b) => b.time - a.time);
        
      if (files.length > 30) {
        files.slice(30).forEach(f => {
          fs.unlinkSync(path.join(backupDir, f.name));
          console.log(`🗑️ Respaldo antiguo eliminado: ${f.name}`);
        });
      }
    }
  } catch (error) {
    console.error('❌ Error al realizar el respaldo de la base de datos:', error);
  }
};


const checkAndUpdateLateAndAnnulledClients = (user) => {
  if (!user || !user.clients) return;
  
  let modified = false;
  const today = new Date();
  
  user.clients.forEach(c => {
    if (c.status === 'Pendiente' && c.collectionDate) {
      const dueDate = new Date(c.collectionDate + 'T00:00:00');
      if (!isNaN(dueDate.getTime())) {
        const diffTime = today - dueDate;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays >= 30) {
          c.status = 'Anulada';
          modified = true;
        }
      }
    }
  });
  
  if (modified) {
    saveDB();
  }
};

const checkAndRolloverPaidClients = (user) => {
  if (!user || !user.clients) return;
  
  let modified = false;
  const now = new Date();
  
  user.clients.forEach(c => {
    if (c.status === 'Pagada' && c.collectionDate) {
      const colDate = new Date(c.collectionDate + 'T23:59:59');
      if (!isNaN(colDate.getTime()) && colDate < now) {
        // Calcular el siguiente periodo según frecuencia
        const freq = (c.paymentFrequency || 'MENSUAL').toUpperCase().trim();
        let monthsToAdd = 1;
        if (freq.includes('TRIM')) monthsToAdd = 3;
        else if (freq.includes('SEME')) monthsToAdd = 6;
        else if (freq.includes('ANUA')) monthsToAdd = 12;

        const nextDate = new Date(c.collectionDate + 'T00:00:00');
        const currentYear = nextDate.getFullYear();
        const currentMonth = nextDate.getMonth(); // 0-indexed (0-11)

        let targetYear = currentYear;
        let targetMonth = currentMonth + monthsToAdd;
        if (targetMonth > 11) {
          targetYear += Math.floor(targetMonth / 12);
          targetMonth = targetMonth % 12;
        }

        const preferredDay = c.collectionDay || nextDate.getDate();
        const maxDays = new Date(targetYear, targetMonth + 1, 0).getDate();
        const safeDay = Math.min(preferredDay, maxDays);

        const nextDateClean = new Date(targetYear, targetMonth, safeDay);

        c.collectionDate = nextDateClean.toISOString().slice(0, 10);
        c.status = 'Pendiente';
        c.paymentDate = null;
        modified = true;
      }
    }
  });
  
  if (modified) {
    saveDB();
  }
};

const runDatabaseMaintenance = (user) => {
  if (!user) return;
  checkAndRolloverPaidClients(user);
  checkAndUpdateLateAndAnnulledClients(user);
};

let users = loadDB();
backupDB(); // Respaldo al arrancar el servidor
setInterval(backupDB, 1000 * 60 * 60 * 24); // Respaldo automático diario

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

const createSafeDate = (y, m, d) => {
  const maxDays = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(d, maxDays));
};

// Calcular el cobro inicial de forma inteligente (para fecha de emisión y frecuencia)
const getInitialCollectionDate = (emissionDateStr, paymentFrequency, status, collectionDay) => {
  const parsed = parseDate(emissionDateStr);
  if (!parsed) return '';

  const d = new Date(parsed + 'T00:00:00');
  if (isNaN(d.getTime())) return '';

  const day = collectionDay || d.getDate();
  const emissionYear = d.getFullYear();
  const emissionMonth = d.getMonth();
  
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const freq = String(paymentFrequency).toUpperCase();
  let monthsStep = 1;
  if (freq.includes('TRIM')) monthsStep = 3;
  else if (freq.includes('SEME')) monthsStep = 6;
  else if (freq.includes('ANUA')) monthsStep = 12;

  // Empezar a buscar desde el primer cobro después de la emisión (el cobro de emisión se considera pagado en el acto)
  let targetYear = emissionYear;
  let targetMonth = emissionMonth + monthsStep;
  if (targetMonth > 11) {
    targetYear += Math.floor(targetMonth / 12);
    targetMonth = targetMonth % 12;
  }
  
  const maxDays = new Date(targetYear, targetMonth + 1, 0).getDate();
  const safeDay = Math.min(day, maxDays);
  let candidate = new Date(targetYear, targetMonth, safeDay);

  const todayStart = new Date(currentYear, currentMonth, now.getDate());

  // Si el primer cobro después de emisión está en el futuro/hoy, esa es la fecha inicial
  if (candidate >= todayStart) {
    return candidate.toISOString().slice(0, 10);
  }

  // De lo contrario, recorremos hacia adelante de ciclo en ciclo hasta encontrar
  // la primera fecha que sea >= hoy
  while (true) {
    let nextMonth = candidate.getMonth() + monthsStep;
    let nextYear = candidate.getFullYear();
    if (nextMonth > 11) {
      nextYear += Math.floor(nextMonth / 12);
      nextMonth = nextMonth % 12;
    }
    
    const nextMaxDays = new Date(nextYear, nextMonth + 1, 0).getDate();
    const nextSafeDay = Math.min(day, nextMaxDays);
    const nextCandidate = new Date(nextYear, nextMonth, nextSafeDay);
    
    if (nextCandidate >= todayStart) {
      if (status === 'Pendiente') {
        return nextCandidate.toISOString().slice(0, 10);
      } else {
        // Si ya está pagado para este período, calculamos el siguiente vencimiento
        let finalMonth = nextCandidate.getMonth() + monthsStep;
        let finalYear = nextCandidate.getFullYear();
        if (finalMonth > 11) {
          finalYear += Math.floor(finalMonth / 12);
          finalMonth = finalMonth % 12;
        }
        const finalMaxDays = new Date(finalYear, finalMonth + 1, 0).getDate();
        const finalSafeDay = Math.min(day, finalMaxDays);
        const finalCandidate = new Date(finalYear, finalMonth, finalSafeDay);
        return finalCandidate.toISOString().slice(0, 10);
      }
    }
    candidate = nextCandidate;
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

// Función para parsear el día y calcular la fecha de cobro desde FECHA PAGO
const parseFechaPago = (text, emissionDateStr, paymentFrequency, status) => {
  const cleanText = String(text || '').trim().toLowerCase();
  
  // 1. Extraer número de día si existe
  const dayMatch = cleanText.match(/\b(\d{1,2})\b/);
  let parsedDay = dayMatch ? parseInt(dayMatch[1], 10) : null;
  
  // 2. Extraer meses
  const matchedMonthsSet = new Set();
  const monthNamesMap = {
    ene: 0, enero: 0,
    feb: 1, febrero: 1,
    mar: 2, marzo: 2,
    abr: 3, abril: 3,
    may: 4, mayo: 4,
    jun: 5, junio: 5,
    jul: 6, julio: 6,
    ago: 7, agosto: 7,
    sep: 8, sept: 8, septiembre: 8,
    oct: 9, octubre: 9,
    nov: 10, noviembre: 10,
    dic: 11, diciembre: 11
  };
  const sortedMonthNames = Object.keys(monthNamesMap).sort((a, b) => b.length - a.length);
  
  let tempText = cleanText;
  sortedMonthNames.forEach(mName => {
    const regex = new RegExp(`${mName}`, 'g');
    if (regex.test(tempText)) {
      matchedMonthsSet.add(monthNamesMap[mName]);
      tempText = tempText.replace(regex, '___');
    }
  });
  
  const matchedMonths = Array.from(matchedMonthsSet).sort((a, b) => a - b);
  
  // 3. Cálculo de la fecha
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed
  
  let emDate = new Date();
  if (emissionDateStr) {
    const parsedEm = new Date(emissionDateStr + 'T00:00:00');
    if (!isNaN(parsedEm.getTime())) {
      emDate = parsedEm;
    }
  }
  
  let targetYear = currentYear;
  let targetMonth = currentMonth;
  let targetDay = parsedDay;
  
  const freq = String(paymentFrequency).toUpperCase().trim();
  
  const getDaysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
  
  if (matchedMonths.length > 0) {
    if (status === 'Pendiente') {
      if (matchedMonths.includes(currentMonth)) {
        targetMonth = currentMonth;
      } else {
        let closestMonth = matchedMonths[0];
        let minDiff = 12;
        matchedMonths.forEach(m => {
          let diff = m - currentMonth;
          if (diff < 0) diff += 12;
          if (diff < minDiff) {
            minDiff = diff;
            closestMonth = m;
          }
        });
        targetMonth = closestMonth;
        if (targetMonth < currentMonth) {
          targetYear = currentYear + 1;
        }
      }
    } else {
      const nextMonth = matchedMonths.find(m => m > currentMonth);
      if (nextMonth !== undefined) {
        targetMonth = nextMonth;
        targetYear = currentYear;
      } else {
        targetMonth = matchedMonths[0];
        targetYear = currentYear + 1;
      }
    }
    
    if (targetDay === null) {
      targetDay = getDaysInMonth(targetYear, targetMonth);
    }
  } else {
    if (targetDay === null) {
      targetDay = emDate.getDate();
    }
    
    if (status === 'Pendiente') {
      targetMonth = currentMonth;
      targetYear = currentYear;
    } else {
      let baseMonth = emDate.getMonth();
      let scheduledMonths = [];
      if (freq.includes('MENS')) {
        for (let i = 0; i < 12; i++) scheduledMonths.push(i);
      } else if (freq.includes('TRIM')) {
        for (let i = 0; i < 4; i++) scheduledMonths.push((baseMonth + i * 3) % 12);
      } else if (freq.includes('SEME')) {
        for (let i = 0; i < 2; i++) scheduledMonths.push((baseMonth + i * 6) % 12);
      } else {
        scheduledMonths.push(baseMonth);
      }
      scheduledMonths.sort((a, b) => a - b);
      
      const nextMonth = scheduledMonths.find(m => m > currentMonth);
      if (nextMonth !== undefined) {
        targetMonth = nextMonth;
        targetYear = currentYear;
      } else {
        targetMonth = scheduledMonths[0];
        targetYear = currentYear + 1;
      }
    }
  }
  
  const maxDay = getDaysInMonth(targetYear, targetMonth);
  if (targetDay > maxDay) {
    targetDay = maxDay;
  }
  
  const formattedDay = String(targetDay).padStart(2, '0');
  const formattedMonth = String(targetMonth + 1).padStart(2, '0');
  
  return {
    collectionDay: targetDay,
    collectionDate: `${targetYear}-${formattedMonth}-${formattedDay}`
  };
};

// Función para homologar y mapear el tipo de plan a los valores estándar de la lista de selección
const mapPlanType = (planName, product) => {
  if (!planName) return product === 'GMM' ? 'Pleno' : 'Orvi';
  
  const planUpper = String(planName).toUpperCase();
  if (planUpper.includes('ORVI')) return 'Orvi';
  if (planUpper.includes('DOTAL')) return 'Dotal';
  if (planUpper.includes('MUJER')) return 'Vida mujer';
  if (planUpper.includes('IMAGINA') || planUpper.includes('SER')) return 'Imagina ser';
  if (planUpper.includes('PLANITUD')) return 'Nuevo planitud';
  if (planUpper.includes('SEGU') || planUpper.includes('BECA')) return 'Segubeca';
  if (planUpper.includes('MIO')) return 'Mio';
  if (planUpper.includes('OBJETIVO')) return 'Objetivo Vida';
  if (planUpper.includes('TEMPORAL')) return 'Temporal';
  if (planUpper.includes('PLENO')) return 'Pleno';
  if (planUpper.includes('INTEGRO') || planUpper.includes('ÍNTEGRO')) return 'Integro';
  if (planUpper.includes('PRACTICO') || planUpper.includes('PRÁCTICO')) return 'Practico';
  if (planUpper.includes('FLEX A')) return 'Flex A';
  if (planUpper.includes('FLEX B')) return 'Flex B';
  
  return product === 'GMM' ? 'Pleno' : 'Orvi';
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
    if (!user.prospects) {
      user.prospects = [];
      saveDB();
    }
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
  if (req.user.role !== 'admin' && req.user.role !== 'administrador') return res.status(403).json({ error: 'Acceso denegado' });
  next();
};

// ======================================
// ENDPOINTS DE AUTENTICACIÓN
// ======================================
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const cleanEmail = String(email || '').trim().toLowerCase();
  const user = users.find(u => u.email.trim().toLowerCase() === cleanEmail);

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
  runDatabaseMaintenance(req.user);
  res.json(req.user.clients);
});

// Crear nuevo cliente
app.post('/api/clients', authMiddleware, (req, res) => {
  const maxId = req.user.clients.reduce((max, c) => Math.max(max, c.id), 0);
  const data = req.body;

  const emDate = parseDate(data.emissionDate || '');
  const initialStatus = 'Pendiente';
  
  // Usar la fecha de cobro especificada por el usuario o calcularla de manera automática
  const colDate = data.collectionDate ? parseDate(data.collectionDate) : getInitialCollectionDate(emDate, data.paymentFrequency || 'MENSUAL', 'Pendiente');
  
  // Guardamos el día de cobro original basado en la fecha de cobro manual o en su defecto en la fecha de emisión
  const collectionDay = data.collectionDate 
    ? new Date(parseDate(data.collectionDate) + 'T00:00:00').getDate() 
    : (emDate ? new Date(emDate + 'T00:00:00').getDate() : "");

  // Si la póliza inicia como Pagada, su fecha de pago inicial es la fecha de cobro asignada por el usuario (o la calculada si no se asignó)
  const payDate = initialStatus === 'Pagada' ? (data.collectionDate ? parseDate(data.collectionDate) : new Date().toISOString().slice(0, 10)) : null;

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
    paymentDate: payDate,
    highlighted: data.highlighted !== undefined ? !!data.highlighted : false,
    documents: []
  };

  req.user.clients.push(newClient);
  
  // Correr mantenimiento de forma inmediata para procesar posibles rollover de fechas pasadas
  runDatabaseMaintenance(req.user);
  saveDB();
  
  // Buscar y retornar el cliente modificado o insertado final
  const savedClient = req.user.clients.find(c => c.policyNumber === newClient.policyNumber) || newClient;
  res.json({ success: true, client: savedClient });
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
    highlighted: data.highlighted !== undefined ? !!data.highlighted : req.user.clients[index].highlighted
  };
  
  if (data.collectionDate) {
    req.user.clients[index].collectionDay = new Date(data.collectionDate + 'T00:00:00').getDate();
  }

  // Correr mantenimiento tras editar
  runDatabaseMaintenance(req.user);
  saveDB();
  res.json({ success: true, client: req.user.clients[index] });
});

// Alternar identificación (resaltado) de cliente
app.put('/api/clients/:clientId/toggle-highlight', authMiddleware, (req, res) => {
  const index = req.user.clients.findIndex(c => c.id == req.params.clientId);
  if (index === -1) return res.status(404).json({ error: 'Cliente no encontrado' });

  req.user.clients[index].highlighted = !req.user.clients[index].highlighted;
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

// ======================================
// ENDPOINTS DE PROSPECTOS (PROSPECCIÓN)
// ======================================

// Listar prospectos del usuario
app.get('/api/prospects', authMiddleware, (req, res) => {
  res.json(req.user.prospects || []);
});

// Crear prospecto
app.post('/api/prospects', authMiddleware, (req, res) => {
  const { name, firstAppointmentDate, secondAppointmentDate, source, searchCommitmentDate, comments } = req.body;
  if (!name) return res.status(400).json({ error: 'El nombre del prospecto es requerido' });

  const prospects = req.user.prospects || [];
  const nextId = prospects.length > 0 ? Math.max(...prospects.map(p => p.id)) + 1 : 1;

  const newProspect = {
    id: nextId,
    name,
    firstAppointmentDate: firstAppointmentDate || '',
    secondAppointmentDate: secondAppointmentDate || '',
    source: source || '',
    searchCommitmentDate: searchCommitmentDate || '',
    comments: comments || '',
    createdAt: new Date().toISOString()
  };

  prospects.push(newProspect);
  req.user.prospects = prospects;
  saveDB();

  res.json({ success: true, prospect: newProspect });
});

// Actualizar prospecto
app.put('/api/prospects/:prospectId', authMiddleware, (req, res) => {
  const prospects = req.user.prospects || [];
  const index = prospects.findIndex(p => p.id == req.params.prospectId);
  if (index === -1) return res.status(404).json({ error: 'Prospecto no encontrado' });

  const { name, firstAppointmentDate, secondAppointmentDate, source, searchCommitmentDate, comments } = req.body;
  if (name) prospects[index].name = name;
  prospects[index].firstAppointmentDate = firstAppointmentDate !== undefined ? firstAppointmentDate : prospects[index].firstAppointmentDate;
  prospects[index].secondAppointmentDate = secondAppointmentDate !== undefined ? secondAppointmentDate : prospects[index].secondAppointmentDate;
  prospects[index].source = source !== undefined ? source : prospects[index].source;
  prospects[index].searchCommitmentDate = searchCommitmentDate !== undefined ? searchCommitmentDate : prospects[index].searchCommitmentDate;
  prospects[index].comments = comments !== undefined ? comments : prospects[index].comments;

  saveDB();
  res.json({ success: true, prospect: prospects[index] });
});

// Eliminar prospecto
app.delete('/api/prospects/:prospectId', authMiddleware, (req, res) => {
  const prospects = req.user.prospects || [];
  const index = prospects.findIndex(p => p.id == req.params.prospectId);
  if (index === -1) return res.status(404).json({ error: 'Prospecto no encontrado' });

  prospects.splice(index, 1);
  saveDB();
  res.json({ success: true });
});

// Migración Masiva de Prospectos (Excel)
app.post('/api/migrate-prospects', authMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo' });

  try {
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    // Leemos el archivo en formato de objetos
    const rawRows = xlsx.utils.sheet_to_json(sheet);

    // Mapeo de cabeceras tolerante
    const possibleName = ['nombre del prospecto', 'prospecto', 'nombre'];
    const possibleFirstCita = ['fecha primera cita', 'fecha 1ra cita', '1ra cita', 'primera cita'];
    const possibleSecondCita = ['fecha segunda cita', 'fecha 2da cita', '2da cita', 'segunda cita'];
    const possibleSource = ['fuente', 'origen', 'de donde salio', 'de dónde salió'];
    const possibleCommitment = ['fecha de compromiso de búsqueda', 'fecha de compromiso de busqueda', 'compromiso de busqueda', 'compromiso de búsqueda', 'compromiso'];
    const possibleComments = ['observación', 'observacion', 'comentarios', 'comentario', 'comentarios/observacion', 'observaciones'];

    const prospects = req.user.prospects || [];
    let nextId = prospects.length > 0 ? Math.max(...prospects.map(p => p.id)) + 1 : 1;
    let addedCount = 0;

    const getHeaderValue = (rowObj, possibleHeaders) => {
      const keys = Object.keys(rowObj);
      for (const key of keys) {
        // Reemplazar non-breaking spaces (\u00a0) y múltiples espacios por un solo espacio estándar, luego trim y lowercase
        const cleanKey = key.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
        if (possibleHeaders.includes(cleanKey)) {
          return rowObj[key];
        }
      }
      return undefined;
    };

    rawRows.forEach(row => {
      const rawName = getHeaderValue(row, possibleName);
      const name = String(rawName || '').trim();
      if (!name) return; // Si no tiene nombre, ignorar la fila

      const rawFirstCita = getHeaderValue(row, possibleFirstCita);
      const rawSecondCita = getHeaderValue(row, possibleSecondCita);
      const rawSource = getHeaderValue(row, possibleSource);
      const rawCommitment = getHeaderValue(row, possibleCommitment);
      const rawComments = getHeaderValue(row, possibleComments);

      const newProspect = {
        id: nextId++,
        name,
        firstAppointmentDate: rawFirstCita ? parseDate(rawFirstCita) : '',
        secondAppointmentDate: rawSecondCita ? parseDate(rawSecondCita) : '',
        source: String(rawSource || '').trim(),
        searchCommitmentDate: rawCommitment ? parseDate(rawCommitment) : '',
        comments: String(rawComments || '').trim(),
        createdAt: new Date().toISOString()
      };

      prospects.push(newProspect);
      addedCount++;
    });

    req.user.prospects = prospects;
    saveDB();

    res.json({ success: true, count: addedCount });
  } catch (error) {
    console.error('Error al migrar prospectos:', error);
    res.status(500).json({ error: 'Error al procesar el archivo Excel' });
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
    const { PDFParse } = require('pdf-parse');
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
  runDatabaseMaintenance(req.user);
  const now = new Date();
  const today = now.getDate();
  const clientsData = req.user.clients;

  const kpis = { collected: 0, total: 0, pending: 0 };
  const upcomingLists = {
    atrasados: [],
    hoy: [],
    en5Dias: [],
    en15Dias: [],
    enMes: []
  };
  const collectedList = [];
  const currentMonthStr = ('0' + (now.getMonth() + 1)).slice(-2);

  clientsData.forEach(c => {
    if (c.status === 'Anulada') return; // Omitir pólizas anuladas
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

      if (diff < 0) upcomingLists.atrasados.push({...alertItem, days: diff});
      else if (diff === 0) upcomingLists.hoy.push(alertItem);
      else if (diff > 0 && diff <= 5) upcomingLists.en5Dias.push(alertItem);
      else if (diff > 5 && diff <= 15) upcomingLists.en15Dias.push(alertItem);
      else if (diff > 15 && diff <= 30) upcomingLists.enMes.push(alertItem);
    }
  });

  const currentMonth = ('0' + (now.getMonth() + 1)).slice(-2);
  const currentYearInt = now.getFullYear();
  const birthdays = [];
  const anniversaries = [];

  clientsData.forEach(c => {
    if (c.status === 'Anulada') return; // Omitir pólizas anuladas
    // Revisar Cumpleaños del Contratante
    if (c.contractorBirthDate) {
      const parts = c.contractorBirthDate.split('-');
      const bMonth = parts.length === 3 ? parts[1] : (parts.length === 2 ? parts[0] : '');
      const bDay = parts.length === 3 ? parts[2] : (parts.length === 2 ? parts[1] : '');

      if (bMonth === currentMonth) {
        birthdays.push({ 
          name: c.contractor, 
          type: `Contratante (Día ${bDay})`,
          policy: c.policyNumber,
          day: parseInt(bDay)
        });
      }
    }

    // Revisar Cumpleaños de los Asegurados
    c.insureds.forEach(ins => {
      if (ins.birthDate) {
        // Evitar duplicados si el asegurado es el mismo contratante y tienen la misma fecha
        if (ins.name === c.contractor && ins.birthDate === c.contractorBirthDate) return; 

        const parts = ins.birthDate.split('-');
        const bMonth = parts.length === 3 ? parts[1] : (parts.length === 2 ? parts[0] : '');
        const bDay = parts.length === 3 ? parts[2] : (parts.length === 2 ? parts[1] : '');

        if (bMonth === currentMonth) {
          birthdays.push({ 
            name: ins.name, 
            type: `Asegurado (Día ${bDay})`,
            policy: c.policyNumber,
            day: parseInt(bDay)
          });
        }
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
  runDatabaseMaintenance(req.user);
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

  let kpiLateMXN = 0;
  let kpiLateCount = 0;

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
    allActive: [],
    late: []
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
    if (eYear === tYear && tMonth < eMonth) return false;

    const freq = String(client.paymentFrequency || 'MENSUAL').toUpperCase().trim();

    if (freq === 'MENSUAL' || freq === 'MENSUALES') return true;
    if (freq === 'TRIMESTRAL' || freq === 'TRIMESTRALES') return Math.abs(tMonth - eMonth) % 3 === 0;
    if (freq === 'SEMESTRAL' || freq === 'SEMESTRALES') return Math.abs(tMonth - eMonth) % 6 === 0;
    if (freq === 'ANUAL' || freq === 'ANUALES') return tMonth === eMonth;

    return false;
  };

  // 1. Calcular Valor Total de Cartera
  clientsData.forEach(c => {
    if (c.status === 'Anulada') return;
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
    if (c.status === 'Anulada') return;
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
        const isPaidThisMonth = c.status === 'Pagada' && c.paymentDate && c.paymentDate.startsWith(`${currentYear}-${month}`);
        const cCopy = { ...c, status: isPaidThisMonth ? 'Pagada' : 'Pendiente' };

        lists.active.push(cCopy);
        
        if (isNewSale) {
          kpiNewSalesCount++;
          kpiNewSalesMXN += mxnVal;
          lists.newSales.push(cCopy);
        } else {
          kpiRenewalsMXN += mxnVal;
          lists.renewals.push(cCopy);
        }

        if (isPaidThisMonth) {
          kpiCollected += premiumVal;
          kpiCollectedMXN += mxnVal;
          
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
          
          lists.pending.push(cCopy);

          if (c.collectionDate) {
            const dueDate = new Date(c.collectionDate + 'T00:00:00');
            const today = new Date();
            if (today > dueDate) {
              kpiLateCount++;
              kpiLateMXN += mxnVal;
              lists.late.push(cCopy);
            }
          }

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

              if (c.collectionDate) {
                const dueDate = new Date(c.collectionDate + 'T00:00:00');
                const today = new Date();
                if (today > dueDate) {
                  kpiLateCount++;
                  kpiLateMXN += mxnVal;
                  if (!lists.late.some(l => l.id === c.id)) {
                    lists.late.push(c);
                  }
                }
              }

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
      lateMXN: kpiLateMXN,
      lateCount: kpiLateCount,
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
});

// Guardar instantánea (Snapshot) de un mes
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

// Anular póliza manualmente
app.put('/api/clients/:clientId/annul', authMiddleware, (req, res) => {
  const index = req.user.clients.findIndex(c => c.id == req.params.clientId);
  if (index === -1) return res.status(404).json({ error: 'Cliente no encontrado' });

  req.user.clients[index].status = 'Anulada';
  
  saveDB();
  res.json({ success: true, client: req.user.clients[index] });
});

// Reactivar póliza (marcar como pagada para el mes en curso)
app.put('/api/clients/:clientId/reactivate', authMiddleware, (req, res) => {
  const index = req.user.clients.findIndex(c => c.id == req.params.clientId);
  if (index === -1) return res.status(404).json({ error: 'Cliente no encontrado' });

  const client = req.user.clients[index];
  client.status = 'Pagada';
  
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  
  // Establecer fecha de pago hoy para que se sume de inmediato en el mes actual en el Analytics
  client.paymentDate = todayStr;
  
  // Actualizar la fecha de cobro al mes siguiente basándose en su frecuencia
  const freq = String(client.paymentFrequency || 'MENSUAL').toUpperCase().trim();
  
  let monthsToAdd = 1;
  if (freq.includes('TRIM')) monthsToAdd = 3;
  else if (freq.includes('SEME')) monthsToAdd = 6;
  else if (freq.includes('ANUA')) monthsToAdd = 12;

  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth(); // 0-indexed (0-11)

  let targetYear = currentYear;
  let targetMonth = currentMonth + monthsToAdd;
  if (targetMonth > 11) {
    targetYear += Math.floor(targetMonth / 12);
    targetMonth = targetMonth % 12;
  }

  const preferredDay = client.collectionDay || today.getDate();
  const maxDays = new Date(targetYear, targetMonth + 1, 0).getDate();
  const safeDay = Math.min(preferredDay, maxDays);

  const nextDueDateClean = new Date(targetYear, targetMonth, safeDay);
  
  client.collectionDate = nextDueDateClean.toISOString().slice(0, 10);
  
  saveDB();
  res.json({ success: true, client: client });
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

    // Encontrar la fila que contiene las cabeceras buscando "cliente", "contratante" o "nombre del cliente"
    let headerIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row && row.some(cell => {
        const val = String(cell || '').trim().toLowerCase();
        return val === 'cliente' || val === 'nombre del cliente' || val === 'nombre' || val === 'contratante';
      })) {
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
            if (header.toLowerCase() === 'prima anual' || header.toLowerCase() === 'prima anual ' || header.toLowerCase() === 'prima anual udis/pesos') {
              const excelRowIndex = headerIndex + rowIndex + 2; // +1 cabecera base 0, +1 1-indexed Excel
              const colLetter = xlsx.utils.encode_col(colIndex);
              const cellAddress = `${colLetter}${excelRowIndex}`;
              const cell = sheet[cellAddress];
              if (cell && cell.f) {
                obj["_primaanualformula"] = cell.f;
              }
            }

            // Si la cabecera es "Cumpleaños", capturamos el texto formateado original de Excel (para detectar cumpleaños sin año)
            if (header.toLowerCase() === 'cumpleaños' || header.toLowerCase() === 'fecha de nacimiento' || header.toLowerCase() === 'fecha de nacimiento contratante') {
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

      // Estandarizar claves alternativas para mayor flexibilidad
      if (cleanRow["contratante"] && !cleanRow["cliente"]) {
        cleanRow["cliente"] = cleanRow["contratante"];
      }
      if (cleanRow["nombre del cliente"] && !cleanRow["cliente"]) {
        cleanRow["cliente"] = cleanRow["nombre del cliente"];
      }
      if (cleanRow["fecha de nacimiento contratante"] && !cleanRow["cumpleaños"]) {
        cleanRow["cumpleaños"] = cleanRow["fecha de nacimiento contratante"];
        if (cleanRow["_cumpleanosformatted"] === undefined && row["_cumpleanosformatted"]) {
          cleanRow["_cumpleanosformatted"] = row["_cumpleanosformatted"];
        }
      }
      if (cleanRow["fecha de nacimiento"] && !cleanRow["cumpleaños"]) {
        cleanRow["cumpleaños"] = cleanRow["fecha de nacimiento"];
        if (cleanRow["_cumpleanosformatted"] === undefined && row["_cumpleanosformatted"]) {
          cleanRow["_cumpleanosformatted"] = row["_cumpleanosformatted"];
        }
      }
      if (cleanRow["plan"] && !cleanRow["tipo de plan"]) {
        cleanRow["tipo de plan"] = cleanRow["plan"];
      }
      if (cleanRow["producto contratado"] && !cleanRow["tipo de plan"]) {
        cleanRow["tipo de plan"] = cleanRow["producto contratado"];
      }
      if (cleanRow["fecha emision"] && !cleanRow["emisión"]) {
        cleanRow["emisión"] = cleanRow["fecha emision"];
      }
      if (cleanRow["fecha de emisión"] && !cleanRow["emisión"]) {
        cleanRow["emisión"] = cleanRow["fecha de emisión"];
      }
      if (cleanRow["fecha de emision"] && !cleanRow["emisión"]) {
        cleanRow["emisión"] = cleanRow["fecha de emision"];
      }
      if (cleanRow["poliza"] && !cleanRow["número de póliza"]) {
        cleanRow["número de póliza"] = cleanRow["poliza"];
      }
      if (cleanRow["número de poliza"] && !cleanRow["número de póliza"]) {
        cleanRow["número de póliza"] = cleanRow["número de poliza"];
      }
      if (cleanRow["numero de póliza"] && !cleanRow["número de póliza"]) {
        cleanRow["número de póliza"] = cleanRow["numero de póliza"];
      }
      if (cleanRow["numero de poliza"] && !cleanRow["número de póliza"]) {
        cleanRow["número de póliza"] = cleanRow["numero de poliza"];
      }
      if (cleanRow["prima anual udis/pesos"] && !cleanRow["prima anual"]) {
        cleanRow["prima anual"] = cleanRow["prima anual udis/pesos"];
      }
      if (cleanRow["cobro"] && !cleanRow["forma de pago"]) {
        cleanRow["forma de pago"] = cleanRow["cobro"];
      }
      if (cleanRow["frecuencia"] && !cleanRow["forma de pago"]) {
        cleanRow["forma de pago"] = cleanRow["frecuencia"];
      }
      if (cleanRow["pago"] && !cleanRow["modo de cobro"]) {
        cleanRow["modo de cobro"] = cleanRow["pago"];
      }
      if (cleanRow["modo"] && !cleanRow["modo de cobro"]) {
        cleanRow["modo de cobro"] = cleanRow["modo"];
      }
      if (cleanRow["correo"] && !cleanRow["correo electrónico"]) {
        cleanRow["correo electrónico"] = cleanRow["correo"];
      }
      if (cleanRow["telefono"] && !cleanRow["teléfono"]) {
        cleanRow["teléfono"] = cleanRow["telefono"];
      }

      // Validar si existe un nombre de cliente
      if (!cleanRow["cliente"] || String(cleanRow["cliente"]).trim().length === 0) return;

      // Sanitizar Ramo / Producto
      let product = "Vida"; // Default a Vida
      const rawPolicy = cleanRow["número de póliza"] || "";
      const rawPlan = cleanRow["tipo de plan"] || cleanRow["plan"] || cleanRow["producto"] || "";
      
      if (rawPolicy) {
        const policyStr = String(rawPolicy).trim().toUpperCase();
        if (policyStr.startsWith("GM")) {
          product = "GMM";
        } else if (policyStr.startsWith("VI")) {
          product = "Vida";
        } else if (rawPlan) {
          const planTypeStr = String(rawPlan).trim().toLowerCase();
          if (planTypeStr.includes("gastos") || planTypeStr.includes("gmm") || planTypeStr.includes("médicos")) {
            product = "GMM";
          }
        }
      } else if (rawPlan) {
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
      // Buscar indicios de moneda en el nombre del plan si la columna moneda está vacía
      if (!currency && rawPlan) {
        const planStr = String(rawPlan).trim().toLowerCase();
        if (planStr.includes("udi")) {
          currency = "UDI";
        } else if (planStr.includes("dll") || planStr.includes("usd") || planStr.includes("dól") || planStr.includes("dol")) {
          currency = "USD";
        } else if (planStr.includes("peso") || planStr.includes("mxn")) {
          currency = "MXN";
        }
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

      // Sanitizar Modo de Cobro
      const rawMethod = cleanRow["modo de cobro"];
      let paymentMethod = "Manual"; // Default as requested
      if (rawMethod) {
        const methodStr = String(rawMethod).trim().toUpperCase();
        if (methodStr.includes("TDC") || methodStr === "TC") {
          paymentMethod = "TC";
        } else if (methodStr.includes("TDD") || methodStr === "TD") {
          paymentMethod = "TD";
        }
      }

      // Determinar el status inicial: "Pendiente" si le toca cobro en el mes corriente, "Pagada" en caso contrario
      let status = "Pagada";
      const rawComments = cleanRow["comentarios adicionales"] || cleanRow["comentarios"] || "";
      const commentsStr = String(rawComments).trim().toLowerCase();
      if (commentsStr.includes("cancelada")) {
        status = "Anulada";
      } else if (isPaymentDueInCurrentMonth(emissionDate, paymentFrequency)) {
        status = "Pendiente";
      }

      // Calcular el cobro inicial de forma inteligente (para que no aparezcan cobros vencidos hace 8 años)
      let collectionDate = "";
      let collectionDay = "";
      
      const fechaPagoText = cleanRow["fecha pago"] || cleanRow["fecha de pago"] || "";
      if (fechaPagoText) {
        const parsedFP = parseFechaPago(fechaPagoText, emissionDate, paymentFrequency, status);
        collectionDate = parsedFP.collectionDate;
        collectionDay = parsedFP.collectionDay;
      } else {
        collectionDate = getInitialCollectionDate(emissionDate, paymentFrequency, status);
        collectionDay = collectionDate ? new Date(collectionDate + 'T00:00:00').getDate() : "";
      }

      // Parsear cumpleaños con soporte para mes/día sin año
      const contractorBirthDate = parseBirthday(cleanRow["cumpleaños"], cleanRow["_cumpleanosformatted"]);

      // Si existe fecha de cumpleaños asegurado
      let insureds = [{ 
        name: String(cleanRow["cliente"]).trim(), 
        birthDate: contractorBirthDate 
      }];
      if (cleanRow["cumpleaños asegurado"]) {
        const insuredBirthDate = parseBirthday(cleanRow["cumpleaños asegurado"], row["_cumpleanosformatted_asegurado"]);
        insureds.push({
          name: `Asegurado de ${String(cleanRow["cliente"]).trim()}`,
          birthDate: insuredBirthDate
        });
      }

      migratedClients.push({
        id: maxId + migratedClients.length + 1,
        contractor: String(cleanRow["cliente"]).trim(),
        contractorBirthDate,
        email: cleanRow["correo electrónico"] ? String(cleanRow["correo electrónico"]).trim() : "",
        phone: cleanRow["teléfono"] ? String(cleanRow["teléfono"]).trim() : "",
        insureds,
        policyNumber: cleanRow["número de póliza"] ? String(cleanRow["número de póliza"]).trim() : "",
        emissionDate,
        collectionDate,
        collectionDay,
        paymentFrequency,
        paymentMethod,
        planType: mapPlanType(cleanRow["nombre del plan"] || cleanRow["tipo de plan"], product),
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
  const { email, name, password, role } = req.body;
  const cleanEmail = String(email || '').trim();
  if (users.find(u => u.email.trim().toLowerCase() === cleanEmail.toLowerCase())) {
    return res.status(400).json({ error: 'El correo ya está registrado' });
  }

  // Permitir asignación de 'administrador' o 'advisor'. El rol 'admin' (Master) está bloqueado por seguridad.
  const targetRole = (role === 'administrador') ? 'administrador' : 'advisor';

  const newUser = {
    id: users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1,
    email: cleanEmail,
    name,
    password: bcrypt.hashSync(password, 10),
    rawPassword: password,
    role: targetRole,
    blocked: false,
    clients: []
  };
  users.push(newUser);
  saveDB();
  res.json({ success: true, user: { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role } });
});

// Editar usuario
app.put('/api/admin/users/:id', authMiddleware, adminOnly, (req, res) => {
  const user = users.find(u => u.id == req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  // Seguridad: Un sub-administrador no puede modificar al usuario Master (Diego)
  if (user.role === 'admin' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'No tienes permisos para modificar al usuario Master' });
  }

  const { name, email, password, role } = req.body;
  if (name) user.name = name;
  if (email) {
    const cleanEmail = String(email || '').trim();
    const existing = users.find(u => u.email.trim().toLowerCase() === cleanEmail.toLowerCase() && u.id !== user.id);
    if (existing) return res.status(400).json({ error: 'Ese correo ya está en uso' });
    user.email = cleanEmail;
  }
  if (password) {
    user.password = bcrypt.hashSync(password, 10);
    user.rawPassword = password;
  }
  if (role) {
    // Evitar que se asigne el rol 'admin' (Master) a otra cuenta por seguridad
    if (role !== 'admin') {
      if (role === 'administrador' || role === 'advisor') {
        user.role = role;
      }
    }
  }
  saveDB();
  res.json({ success: true });
});

// Bloquear / Desbloquear usuario
app.put('/api/admin/users/:id/toggle-block', authMiddleware, adminOnly, (req, res) => {
  const user = users.find(u => u.id == req.params.id && u.role !== 'admin');
  if (!user) return res.status(404).json({ error: 'No se puede bloquear esa cuenta' });
  user.blocked = !user.blocked;
  saveDB();
  res.json({ success: true, blocked: user.blocked });
});

// Eliminar usuario
app.delete('/api/admin/users/:id', authMiddleware, adminOnly, (req, res) => {
  const index = users.findIndex(u => u.id == req.params.id && u.role !== 'admin');
  if (index === -1) return res.status(404).json({ error: 'No se puede eliminar' });
  users.splice(index, 1);
  saveDB();
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

