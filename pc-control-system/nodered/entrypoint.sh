#!/bin/sh

# Instalar plugin no userDir /data se não estiver presente
if [ ! -d /data/node_modules/node-red-contrib-alexa-home ]; then
    echo "[entrypoint] Instalando node-red-contrib-alexa-home em /data..."
    cd /data && npm install node-red-contrib-alexa-home@3.0.3
fi

# Copiar settings.js apenas se não existir (edições manuais são preservadas)
if [ ! -f /data/settings.js ]; then
    echo "[entrypoint] Copiando settings.js padrão..."
    cp /tmp/defaults/settings.js /data/settings.js
fi

# Atualizar flows.json se a imagem trouxer uma versão mais nova
# (hash-based: atualiza quando o arquivo na imagem muda)
HASH_FILE="/data/.flows_hash"
CURRENT_HASH=$(md5sum /tmp/defaults/flows.json | cut -d' ' -f1)

if [ ! -f /data/flows.json ] || [ ! -f "$HASH_FILE" ] || [ "$(cat $HASH_FILE 2>/dev/null)" != "$CURRENT_HASH" ]; then
    echo "[entrypoint] flows.json desatualizado ou ausente — atualizando..."
    cp /tmp/defaults/flows.json /data/flows.json
    echo "$CURRENT_HASH" > "$HASH_FILE"
else
    echo "[entrypoint] flows.json já está na versão atual."
fi

# Iniciar Node-RED explicitando settings e userDir
echo "[entrypoint] Iniciando Node-RED..."
cd /usr/src/node-red
exec node-red --userDir /data --settings /data/settings.js
