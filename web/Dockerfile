FROM node:24-slim
ENV VITE_HOSTNAME=https://map.emfcamp.org

WORKDIR /app

COPY package*.json /app/
RUN npm install

COPY . .
RUN npm run build

EXPOSE 8080

CMD ["npm", "run", "serve"]
