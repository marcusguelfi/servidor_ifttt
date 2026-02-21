#!/bin/sh
# Copiar flows e settings para /data apenas se não existirem
if [ ! -f /data/flows.json ]; then
    cp /tmp/defaults/flows.json /data/flows.json
fi
if [ ! -f /data/settings.js ]; then
    cp /tmp/defaults/settings.js /data/settings.js
fi

# Iniciar Node-RED
exec npm start -- --userDir /data
