#!/bin/sh
# Copiar flows e settings para /data apenas se não existirem
if [ ! -f /data/flows.json ]; then
    cp /tmp/defaults/flows.json /data/flows.json
fi
if [ ! -f /data/settings.js ]; then
    cp /tmp/defaults/settings.js /data/settings.js
fi

# Instalar plugin no userDir /data para garantir que Node-RED encontre todos os nós
cd /data
if [ ! -d /data/node_modules/node-red-contrib-alexa-home ]; then
    npm install node-red-contrib-alexa-home@3.0.3
fi

# Iniciar Node-RED
exec npm start -- --userDir /data
