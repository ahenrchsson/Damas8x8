.PHONY: dev build-frontend build-backend run clean

# Build WASM frontend with Trunk
build-frontend:
	cd crates/frontend && trunk build --release

# Build backend binary
build-backend:
	cargo build --release -p damas-backend

# Full production build (frontend → dist/, then backend serves it)
build:
	$(MAKE) build-frontend
	cp -r crates/frontend/dist ../dist 2>/dev/null || true
	$(MAKE) build-backend

# Dev: run backend (frontend served by Trunk separately)
run-backend:
	cargo run -p damas-backend

# Dev: run frontend with hot-reload
run-frontend:
	cd crates/frontend && trunk serve --proxy-backend=http://localhost:3000/api --proxy-backend=http://localhost:3000/ws

clean:
	cargo clean
	rm -rf crates/frontend/dist
