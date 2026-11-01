FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=optional --ignore-scripts
COPY tsconfig.json ./
COPY server ./server
COPY src ./src
ENV NODE_ENV=production PORT=8787 STORAGE=postgres
EXPOSE 8787
CMD ["npx", "tsx", "server/index.ts"]
