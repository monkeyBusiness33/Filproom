FROM node:16

WORKDIR /usr/src/app
COPY microservices/api/ .
RUN npm install

CMD [ "npm", "run", "start:staging:cloud"]
