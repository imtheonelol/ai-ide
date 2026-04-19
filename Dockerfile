# Use an Ubuntu image with Node and Rust
FROM ubuntu:22.04

# Install Tauri OS Dependencies
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y \
    curl wget file build-essential \
    libssl-dev libgtk-3-dev libayatana-appindicator3-dev \
    librsvg2-dev libwebkit2gtk-4.0-dev

# Install Node.js
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs

# Install Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Setup Workspace
WORKDIR /app
COPY . .

# Install NPM deps and Build
RUN npm install
RUN npm run build
RUN npm run tauri build