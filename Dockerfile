FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_LINE_WEBHOOK_URL=http://localhost:8787/line-webhook
ARG VITE_LINE_RELAY_SECRET=
ARG VITE_LLM_ANALYTICS_ENABLED=true
ARG VITE_LLM_ANALYTICS_URL=http://localhost:8787/analytics/insight

ENV VITE_LINE_WEBHOOK_URL=${VITE_LINE_WEBHOOK_URL}
ENV VITE_LINE_RELAY_SECRET=${VITE_LINE_RELAY_SECRET}
ENV VITE_LLM_ANALYTICS_ENABLED=${VITE_LLM_ANALYTICS_ENABLED}
ENV VITE_LLM_ANALYTICS_URL=${VITE_LLM_ANALYTICS_URL}

RUN npm run build

FROM nginx:1.27-alpine AS runner
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
