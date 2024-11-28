ARG BUN_VERSION=1.1.26
FROM oven/bun:${BUN_VERSION}-slim as base

WORKDIR /app
ENV NODE_ENV="production"

# Build stage
FROM base as build

# Install build dependencies
RUN apt-get update -qq && apt-get install --no-install-recommends -y build-essential pkg-config python-is-python3

# Copy package files
COPY --link bun.lockb package.json ./

# Install dependencies
RUN bun install --ci

# Copy application code
COPY --link . .

# Final stage for the app image
FROM base

# Copy built application from the build stage
COPY --from=build /app /app

# Expose the port your application listens on
EXPOSE 8080

# Set the command to run your application
CMD [ "bun", "run", "start" ]
