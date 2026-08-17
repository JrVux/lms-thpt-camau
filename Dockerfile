FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

FROM node:20-slim
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/ .
EXPOSE 3001
CMD ["node", "src/app.js"]