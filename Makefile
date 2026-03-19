.PHONY: build clean serve validate

build:
	@python3 build.py

clean:
	rm -rf dist

serve: build
	@echo "Serving at http://localhost:8765"
	@cd dist && python3 -m http.server 8765

validate:
	@command -v jsonschema > /dev/null 2>&1 && \
		jsonschema -i features.json schema.json && \
		echo "features.json is valid" || \
		echo "Install jsonschema: pip install jsonschema"
