# Dockerfile
FROM denoland/deno:alpine-1.38.3

RUN apk add git libstdc++
ADD https://worldtimeapi.org/api/timezone/Etc/UTC /.timestamp

WORKDIR /app
COPY . .

RUN deno cache demo.ts

ENV PORT=7180
EXPOSE 7180