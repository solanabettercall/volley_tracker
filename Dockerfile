FROM node:22

RUN apt-get update

RUN useradd -ms /bin/sh -u 1001 app
USER app

WORKDIR /app
COPY package.json yarn.lock tsconfig.json tsconfig.build.json ./
RUN yarn

COPY --chown=app:app . /app
RUN yarn build