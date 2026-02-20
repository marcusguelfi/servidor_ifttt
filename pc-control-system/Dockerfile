FROM node:18-alpine
WORKDIR /app
COPY server/package*.json ./
RUN npm install --production
COPY server/index.js ./
COPY web/ ./web/
EXPOSE 3000
CMD ["node", "index.js"]
