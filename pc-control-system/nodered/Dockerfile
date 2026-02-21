FROM nodered/node-red:latest
RUN cd /data && npm install node-red-contrib-alexa-home@3.0.3
COPY flows.json /data/flows.json
COPY settings.js /data/settings.js
