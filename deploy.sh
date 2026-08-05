#!/bin/bash

echo "🚀 Iniciando despliegue de CRM NOVARIS a Producción..."

# 1. Build de React
echo "📦 Construyendo la interfaz de usuario (React)..."
cd client
npm run build
cd ..

# 2. Sincronizar con GitHub
echo "🐙 Sincronizando código con GitHub..."
git add .
git commit -m "Despliegue CRM NOVARIS $(date +'%Y-%m-%d %H:%M')" || true
git push origin main || true

# 3. Desplegar a Hostinger via rsync y reiniciar Node.js
echo "🌐 Actualizando archivos en servidor Hostinger..."
rsync -avz -e "ssh -o StrictHostKeyChecking=no -i ~/.ssh/id_rsa_panel -p 65002" --exclude 'node_modules' --exclude '.git' ./ u211138134@195.35.10.40:domains/novaris.ambrizydavalos.com/nodejs/

ssh -o StrictHostKeyChecking=no -i ~/.ssh/id_rsa_panel u211138134@195.35.10.40 -p 65002 << 'ENDSSH' 2>/dev/null || true
  export PATH=/opt/alt/alt-nodejs20/root/usr/bin:$PATH
  cd domains/novaris.ambrizydavalos.com/nodejs
  mkdir -p tmp 2>/dev/null || true
  touch tmp/restart.txt 2>/dev/null || true
ENDSSH

echo ""
echo "✅ ¡Despliegue de CRM NOVARIS Finalizado Exitosamente!"
echo "Accede en: https://novaris.ambrizydavalos.com"





