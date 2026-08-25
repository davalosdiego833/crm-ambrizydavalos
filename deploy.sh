#!/bin/bash

echo "🚀 Preparando despliegue del CRM (Ambriz & Dávalos + Novaris)..."

# 1. Build de React
echo "📦 Construyendo la interfaz de usuario (React)..."
cd client
npm run build
cd ..

# 2. Sincronizar con GitHub
echo "🐙 Sincronizando código con GitHub..."
git add .
git commit -m "Despliegue CRM $(date +'%Y-%m-%d %H:%M')" || true
git push origin main || true

# NOTA: el despliegue al servidor real (crm.ambrizydavalos.com) ya NO se hace
# por rsync desde aquí. Este script antes sincronizaba por rsync a
# domains/novaris.ambrizydavalos.com/nodejs/ — un subdominio de prueba ya
# abandonado — y ese rsync no excluía server/db.json, así que apuntarlo a un
# dominio con datos reales habría sobrescrito la base de datos de producción.
#
# El servidor real se actualiza con deploy_remote.py, que solo hace
# `git fetch --all && git reset --hard origin/main` por SSH — eso únicamente
# toca archivos versionados en git, dejando intactos server/db.json,
# server/backups/ y server/uploads/ en el servidor.
echo ""
echo "✅ Build y push a GitHub completados."
echo "Para desplegar a producción (crm.ambrizydavalos.com), corre: python3 deploy_remote.py"
