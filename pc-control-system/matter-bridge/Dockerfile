FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY index.js devices.json ./

RUN mkdir -p /data

CMD ["node", "index.js"]
