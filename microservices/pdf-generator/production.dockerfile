# A minimal Docker file for node.js and Puppeteer
# incase libraries break. Use the libraries in this link; https://source.chromium.org/chromium/chromium/src/+/main:chrome/installer/linux/debian/dist_package_versions.json
 
# debian 10 (buster slim) amd64 + node v14
# https://hub.docker.com/layers/node/library/node/14.17.1-buster-slim/images/sha256-10c6bf7204614c18b0734a218f576082ea2d15e9af7b7817a07eddcd7d05a255?context=explore
FROM node:20

RUN apt-get update \
    # Install dependencies of Chromium that Puppeteer installs
    # Dependency list for puppeteer v10.0.0 taken from https://github.com/puppeteer/puppeteer/blob/v10.0.0/docs/troubleshooting.md#chrome-headless-doesnt-launch-on-unix
    # Puppeteer v10.0.0 installs Chromium 92.0.4512.0 / r884014
    # Also install some fonts for puppeteer
    && apt-get install -y --no-install-recommends \
            gconf-service \
            libasound2 \
            libatk1.0-0 \
            libc6 \
            libcairo2 \
            libcups2 \
            libdbus-1-3 \
            libexpat1 \
            libfontconfig1 \
            libgcc1 \
            libgconf-2-4 \
            libgdk-pixbuf2.0-0 \
            libglib2.0-0 \
            libgtk-3-0 \
            libjpeg62-turbo \
            libnspr4 \
            libpango-1.0-0 \
            libpangocairo-1.0-0 \
            libstdc++6 \
            libx11-6 \
            libx11-xcb1 \
            libxcb1 \
            libxcomposite1 \
            libxcursor1 \
            libxdamage1 \
            libxext6 \
            libxfixes3 \
            libxi6 \
            libxrandr2 \
            libxrender1 \
            libxss1 \
            libxtst6 \
            ca-certificates \
            fonts-liberation \
            libappindicator1 \
            libnss3 \
            lsb-release \
            xdg-utils \
            wget \
            libgbm1 \
            libdrm2 \
            libatspi2.0-0 \
            libatk-bridge2.0-0 \
            libuuid1 \
            libxcb-dri3-0 \
            libxkbcommon0 \
            libxshmfence1
            
WORKDIR /usr/src/app

ENV API_URL=https://production-api-6dwjvpqvqa-nw.a.run.app

COPY microservices/pdf-generator/package.json .
RUN npm install

COPY microservices/pdf-generator/ .

CMD [ "node", "app.js"]
