FROM rust:1.88-bookworm AS build
WORKDIR /src
COPY Cargo.toml ./
COPY Cargo.lock ./
COPY src ./src
# --locked so the image cannot resolve newer crates than Cargo.lock (#261).
RUN cargo build --locked --release

FROM gcr.io/distroless/cc-debian12
COPY --from=build /src/target/release/minamo-relay /usr/local/bin/minamo-relay
EXPOSE 4433/udp
STOPSIGNAL SIGINT
# Run as the distroless non-root user, not root (#261). No HEALTHCHECK: the relay
# speaks QUIC/UDP and the image has no shell or probe tooling; a future
# `minamo-relay --health` subcommand could add one.
USER nonroot
CMD ["/usr/local/bin/minamo-relay"]
