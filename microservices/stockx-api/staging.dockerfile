FROM node:16-slim
    
WORKDIR /usr/src/app

ENV ENVIRONMENT=staging
ENV DB_HOST=35.189.112.2
ENV DB_NAME=stockx-api
ENV DB_USERNAME=root
ENV DB_PSW=root
ENV DB_PORT=3306
ENV DB_CONN_NAME=/cloudsql/wiredhub:europe-west2:staging

COPY microservices/stockx-api/package.json .
RUN npm install

COPY microservices/stockx-api/ .

CMD [ "npm", "run", "start"]