FROM nodered/node-red:latest

# Instalar plugin no diretório do Node-RED (não em /data que é VOLUME)
WORKDIR /usr/src/node-red
RUN npm install node-red-contrib-alexa-home@3.0.3

# Copiar flows e settings para diretório temporário (não /data)
COPY flows.json /tmp/defaults/flows.json
COPY settings.js /tmp/defaults/settings.js
COPY entrypoint.sh /tmp/entrypoint.sh

USER root
RUN chmod +x /tmp/entrypoint.sh
USER node-red

ENTRYPOINT ["/tmp/entrypoint.sh"]
