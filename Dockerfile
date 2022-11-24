FROM denoland/deno:alpine-1.28.1

WORKDIR /app
COPY . .

RUN deno cache server.ts

ENV PORT=7180
EXPOSE 7180

VOLUME [ "/data" ]

CMD ["run", "-A", "server.ts", "/data"]

