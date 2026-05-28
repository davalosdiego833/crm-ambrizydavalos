#!/bin/bash

echo "🚀 Iniciando despliegue de CRM Ambriz y Davalos a Producción..."

# 1. Hacer el Build de React
echo "📦 Construyendo la interfaz de usuario (React)..."
cd client
npm run build
cd ..

# 2. Sincronizar con GitHub
echo "🐙 Sincronizando código con GitHub..."
git add .
git commit -m "Despliegue a Producción $(date +'%Y-%m-%d %H:%M')"
git push -u origin main

# 3. Conectar a Hostinger vía SSH y descargar código
echo "🌐 Conectando a Hostinger para actualizar servidor..."
ssh -i ~/.ssh/id_rsa_panel u211138134@195.35.10.40 -p 65002 << 'ENDSSH'
  export PATH=/opt/alt/alt-nodejs20/root/usr/bin:$PATH
  cd domains/crm.ambrizydavalos.com/nodejs
  echo "📥 Descargando última versión de GitHub..."
  git fetch --all
  git reset --hard origin/main
  
  echo "📦 Instalando dependencias del servidor..."
  cd server
  npm install --omit=dev
  
  echo "🔄 Reiniciando servidor Node.js..."
  mkdir -p tmp 2>/dev/null || true
  touch tmp/restart.txt 2>/dev/null || true
ENDSSH

echo "✅ ¡Despliegue Finalizado Exitosamente!"
echo "Puedes revisar tu aplicación en: https://crm.ambrizydavalos.com"
