FROM node:18.18-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .

EXPOSE 3000
EXPOSE 9229
EXPOSE 9230 

CMD ["npm", "run", "dev"]