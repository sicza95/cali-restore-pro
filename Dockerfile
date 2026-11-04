# syntax=docker/dockerfile:1
FROM node:24.22.2-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c AS frontend
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.app.config.ts tsconfig.json ./
COPY src ./src
RUN npm run build

FROM golang:1.27.3-bookworm@sha256:d9b6a1beb9474adc2a1ce842573639b44b2a0dd49b6669f51d3821baf9ec37c9 AS backend
WORKDIR /src
COPY server/go.mod server/go.sum ./
RUN go mod download && go mod verify
COPY server/ ./

FROM backend AS test
CMD ["sh", "-c", "test -z \"$(gofmt -l .)\" && go vet ./... && go test -race -count=1 ./..."]

FROM backend AS compile
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/calirestore ./cmd/calirestore \
    && mkdir -p /out/objects && chown 65532:65532 /out/objects

FROM gcr.io/distroless/static-debian13:nonroot@sha256:25ac8f0c3b2334a9eb05452266bd4697864a8c8ef0ef71e5e6480d7f92868329 AS runtime
WORKDIR /app
COPY --from=compile /out/calirestore /app/calirestore
COPY --from=compile --chown=65532:65532 /out/objects /data/objects
COPY --from=frontend /src/dist /app/web
USER 65532:65532
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=4s --start-period=10s --retries=3 CMD ["/app/calirestore", "healthcheck"]
ENTRYPOINT ["/app/calirestore"]
CMD ["serve"]
