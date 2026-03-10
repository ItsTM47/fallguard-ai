FROM node:20-alpine
WORKDIR /app

COPY backend/api ./backend/api
RUN mkdir -p /app/backend/uploads

EXPOSE 8787
CMD ["node", "backend/api/line-relay.mjs"]
