FROM node:18-alpine
WORKDIR /app
COPY server/package*.json ./
RUN npm install --production
COPY server/index.js ./
COPY server/users.js ./
COPY server/custom-commands.js ./
COPY server/bridge-assignments.js ./
COPY web/ ./web/
COPY client/ ./client/
EXPOSE 3000
CMD ["node", "index.js"]
