FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY backend/api ./backend/api
COPY backend/database ./backend/database
RUN mkdir -p /app/backend/uploads

EXPOSE 8787
CMD ["node", "backend/api/line-relay.mjs"]
