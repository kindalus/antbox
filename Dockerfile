FROM denoland/deno:alpine-1.33.3

RUN apk add git libstdc++
ADD https://worldtimeapi.org/api/timezone/Etc/UTC /.timestamp

WORKDIR /app
COPY . .

RUN deno cache demo.ts

ENV PORT=7180
EXPOSE 7180

VOLUME [ "/data" ]

CMD ["deno", "run", "-A", "--unstable", "demo.ts", "/data"]

