FROM node:22-alpine
WORKDIR /app

COPY bot-whatsapp/package.json bot-whatsapp/package-lock.json ./bot-whatsapp/
RUN cd bot-whatsapp && npm install --omit=dev

COPY asistente-prototipo/crm-tools.js ./asistente-prototipo/crm-tools.js
COPY bot-whatsapp ./bot-whatsapp

WORKDIR /app/bot-whatsapp
ENV PORT=8080
CMD ["node", "index.js"]
