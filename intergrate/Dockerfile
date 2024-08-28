FROM node:20.16.0-bullseye-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    jq \
    curl \
    procps \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY package.json yarn.lock ./

RUN yarn install --silent

COPY . .

COPY ./intergrate/entrypoint.sh /usr/local/bin
COPY ./intergrate/deploy.sh /usr/local/bin
RUN chmod +x /usr/local/bin/deploy.sh /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/bin/sh", "/usr/local/bin/entrypoint.sh"]

EXPOSE 8545