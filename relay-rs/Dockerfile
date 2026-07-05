FROM rust:1.85-bookworm AS build
WORKDIR /src
COPY Cargo.toml ./
COPY src ./src
RUN cargo build --release

FROM gcr.io/distroless/cc-debian12
COPY --from=build /src/target/release/kagami-relay /usr/local/bin/kagami-relay
EXPOSE 4433/udp
CMD ["/usr/local/bin/kagami-relay"]
