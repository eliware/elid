FROM node:26-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server.mjs .
COPY src ./src
COPY db ./db
USER node
ENV NODE_ENV=production HTTP_PORT=8080
EXPOSE 8080
CMD ["node", "server.mjs"]
