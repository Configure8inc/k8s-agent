FROM --platform=linux/amd64 node:18-alpine as builder

WORKDIR /app

COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM --platform=linux/amd64 node:18-alpine

ARG USERNAME="c8"
ARG GROUPNAME="c8"
ARG UID="1008"
ARG GID="1008"

RUN addgroup -S ${GROUPNAME} -g ${GID} && adduser -S ${USERNAME} -u ${UID} -G ${GROUPNAME}

WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/dist /app/dist

RUN npm install --omit=dev

RUN chown -R ${USERNAME}:${GROUPNAME} /app
USER ${USERNAME}

CMD ["npm", "start"]