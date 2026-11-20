# 正式環境映像檔。沒有第三方套件，所以不需要 npm install
# node:sqlite 需要 Node 22.5 以上；node:22-slim 會拿到最新的 22.x
FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production

# 只複製執行時需要的檔案，測試、文件、技能都不進映像檔
COPY package.json ./
COPY src ./src
COPY public ./public

EXPOSE 8080

# 直接執行 node 而不是 npm start，關機訊號才會直接送到伺服器
CMD ["node", "--disable-warning=ExperimentalWarning", "src/server.js"]
