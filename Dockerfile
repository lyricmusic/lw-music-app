# Этап сборки (builder)
FROM node:22.22.0 AS builder

WORKDIR /usr/src/app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Кэширование зависимостей
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Копируем остальной код
COPY . .

# Билдим приложение
RUN pnpm build
RUN pnpm verify:production-artifact
RUN pnpm verify:performance

# Этап продакшена (на легком nginx-образе)
FROM nginx:alpine

# Копируем билденую статику
COPY --from=builder /usr/src/app/dist /usr/share/nginx/html

# Открываем порт
EXPOSE 80

# Стартуем nginx
CMD ["nginx", "-g", "daemon off;"]
