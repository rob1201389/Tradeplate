FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
ENV PORT=8787 MODEL_CACHE=/data/models
VOLUME /data
EXPOSE 8787
CMD ["node", "server/index.mjs"]
