FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY ais-relay.mjs ./
ENV PORT=8080
EXPOSE 8080
CMD ["node", "ais-relay.mjs"]
