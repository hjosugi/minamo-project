FROM rust:1.85-bookworm AS build
WORKDIR /src
COPY Cargo.toml ./
COPY src ./src
RUN cargo build --release

FROM gcr.io/distroless/cc-debian12
COPY --from=build /src/target/release/minamo-relay /usr/local/bin/minamo-relay
EXPOSE 4433/udp
CMD ["/usr/local/bin/minamo-relay"]
