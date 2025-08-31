# Estágio 1: Build da aplicação React
# Usamos uma imagem Node para ter acesso ao npm
FROM node:18-alpine AS builder

# Define o diretório de trabalho dentro do contêiner
WORKDIR /app

# Copia o package.json e package-lock.json para o contêiner
# Fazemos isso primeiro para aproveitar o cache do Docker
COPY package*.json ./

# Instala as dependências do projeto
RUN npm install

# Copia o resto do código da aplicação
COPY . .

# Roda o script de build para gerar os arquivos estáticos otimizados
RUN npm run build

# Estágio 2: Servir os arquivos estáticos com Nginx
# Usamos uma imagem Nginx super leve para servir o conteúdo
FROM nginx:stable-alpine

# Copia os arquivos gerados no estágio de build (da pasta /app/build)
# para a pasta padrão do Nginx que serve conteúdo HTML
COPY --from=builder /app/build /usr/share/nginx/html

# Expõe a porta 80, que é a porta padrão do Nginx
EXPOSE 80

# Comando para iniciar o Nginx quando o contêiner rodar
CMD ["nginx", "-g", "daemon off;"]