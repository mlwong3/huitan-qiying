# 繪壇耆英 — production container
FROM node:20-alpine

WORKDIR /app

# Install production dependencies first (better layer caching)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source
COPY . .

ENV NODE_ENV=production
# Cloud Run / most PaaS inject PORT; server.js reads process.env.PORT (default 3000)
EXPOSE 8080

CMD ["node", "server.js"]
