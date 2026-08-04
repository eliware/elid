FROM node:26-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server.mjs .
COPY src ./src
COPY db ./db
RUN mkdir -p /var/lib/elid/keys && chown -R node:node /var/lib/elid
USER node
ENV NODE_ENV=production HTTP_PORT=8080
EXPOSE 8080
CMD ["node", "server.mjs"]
