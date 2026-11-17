FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# esbuild 偶发不落盘（报构建成功但 dist/boot.js 缺失）——构建后强制校验产物，缺失自动重跑一次
RUN npm run build && test -f dist/boot.js || npm run build
RUN test -f dist/boot.js
ENV NODE_ENV=production
EXPOSE 3200
CMD ["node", "dist/boot.js"]
