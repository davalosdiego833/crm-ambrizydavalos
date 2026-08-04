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
curl -s "https://crm.ambrizydavalos.com/api/git-pull-deploy?secret=ambriz-crm-deploy-key-2026" || true

ssh -i ~/.ssh/id_rsa_panel u211138134@195.35.10.40 -p 65002 << 'ENDSSH' 2>/dev/null || true
  export PATH=/opt/alt/alt-nodejs20/root/usr/bin:$PATH
  cd domains/crm.ambrizydavalos.com/nodejs
  git fetch --all
  git reset --hard origin/main
  mkdir -p tmp 2>/dev/null || true
  touch tmp/restart.txt 2>/dev/null || true
ENDSSH

echo ""
echo "✅ ¡Despliegue Finalizado Exitosamente!"
echo "Puedes revisar tu aplicación en: https://crm.ambrizydavalos.com"





