.PHONY: build run dev clean test

# Build the server binary
build:
	go build -o server ./cmd/server/

# Run the built binary
run: build
	./server

# Run in development mode with auto-reload (requires air)
dev:
	air || go run ./cmd/server/

# Clean build artifacts
clean:
	rm -f server

# Run tests
test:
	go test ./...

# Install dependencies
deps:
	go mod tidy

# Initialize database defaults
init:
	go run ./cmd/server/
