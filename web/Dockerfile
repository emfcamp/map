FROM node:17-alpine

WORKDIR /app

COPY package*.json /app/
RUN npm install

COPY . .
RUN npm run build

EXPOSE 8080

CMD ["npm", "run", "serve"]
