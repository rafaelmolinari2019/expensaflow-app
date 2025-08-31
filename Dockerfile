# Estágio 1: Build da aplicação React
FROM node:18-alpine AS builder

WORKDIR /app

# Copia os arquivos de manifesto de dependências
COPY package.json ./
COPY package-lock.json ./

# Instala as dependências usando 'npm ci' para builds mais rápidos e confiáveis
RUN npm ci

# Copia o resto do código da aplicação
COPY . .

# Roda o script de build
RUN npm run build

# ... (o resto do arquivo continua igual)