# Game server: accounts, verified rewards, Stripe purchases and online races.
# Build:  docker build -t sprintlings-server .
# Run:    docker run -p 8787:8787 --env-file server.env sprintlings-server
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
