FROM ubuntu:24.04

# Install dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    clang \
    curl \
    git \
    libclang-dev \
    libssl-dev \
    pkg-config \
    protobuf-compiler \
    && rm -rf /var/lib/apt/lists/*

# Install Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Add WASM target for Substrate runtime compilation
RUN rustup target add wasm32-unknown-unknown

# Add rust-src component for WASM runtime compilation
RUN rustup component add rust-src

# Install substrate-contracts-node
RUN cargo install contracts-node \
    --git https://github.com/paritytech/substrate-contracts-node.git \
    --force --locked

# Expose ports
EXPOSE 9944 30333

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:9944 || exit 1

# Run node with public access
CMD ["contracts-node", \
    "--dev", \
    "--rpc-external", \
    "--rpc-cors", "all", \
    "--ws-external", \
    "--rpc-methods=Unsafe", \
    "--ws-max-connections", "1000"]
