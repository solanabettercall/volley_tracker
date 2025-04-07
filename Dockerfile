FROM node:22

RUN apt-get update

RUN useradd -ms /bin/sh -u 1001 app
USER app

WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn

COPY --chown=app:app . /app