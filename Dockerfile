# Build stage
#
# Pinned to the *build host's* architecture, not the target's. The output is
# static HTML, CSS and JS — byte-identical whatever the image will eventually
# run on — so emulating the target here buys nothing and costs a QEMU-emulated
# npm install and bundle on every extra platform.
#
# It is also required for linux/arm/v7: Vite bundles with Rolldown, which ships
# no 32-bit ARM musl binary, so `npm run build` cannot run inside that image at
# all.
FROM --platform=$BUILDPLATFORM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install from the committed lockfile so builds are reproducible
RUN npm ci --include=optional

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage — this one is built per target platform.
FROM nginx:alpine

# Copy built files from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration (if needed)
# COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
