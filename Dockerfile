FROM node:22-alpine

WORKDIR /app

COPY backend/package*.json ./backend/
RUN cd backend && npm ci
COPY backend ./backend
RUN cd backend && DATABASE_URL=postgresql://build:build@localhost:5432/build?schema=public npx prisma generate

COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci
COPY frontend ./frontend
RUN cd frontend && npm run build

WORKDIR /app/backend
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
