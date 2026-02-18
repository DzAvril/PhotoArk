FROM node:24-alpine
WORKDIR /app

COPY package*.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/shared/package.json ./packages/shared/package.json

RUN npm ci

COPY . .
RUN npm run build \
  && rm -rf apps/api/public \
  && mkdir -p apps/api/public \
  && cp -R apps/web/dist/. apps/api/public/

EXPOSE 8080
CMD ["node", "apps/api/dist/index.js"]
