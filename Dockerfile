# Этап сборки (builder)
FROM node:22.14.0 AS builder

WORKDIR /usr/src/app

# Кэширование зависимостей
COPY package.json package-lock.json ./
RUN npm install

# Копируем остальной код
COPY . .

# Билдим приложение
RUN npm run build

# Этап продакшена (на легком nginx-образе)
FROM nginx:alpine

# Копируем билденую статику
COPY --from=builder /usr/src/app/dist /usr/share/nginx/html

# Открываем порт
EXPOSE 80

# Стартуем nginx
CMD ["nginx", "-g", "daemon off;"]
