FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

FROM node:20-slim
WORKDIR /app
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/ .
EXPOSE 3001
CMD ["node", "src/app.js"]