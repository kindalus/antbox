FROM denoland/deno:alpine-1.32.5

WORKDIR /app
COPY . .

RUN deno cache server.ts

ENV PORT=7180
EXPOSE 7180

VOLUME [ "/data" ]

CMD ["deno", "run", "-A", "demo.ts", "/data"]

