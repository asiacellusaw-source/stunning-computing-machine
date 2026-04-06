FROM node:18

WORKDIR /app

COPY . .

RUN npm install -g pnpm
RUN pnpm install

WORKDIR /app/scripts

CMD ["pnpm", "start"]
