.PHONY: help fetch test lint format check ci

help:
	@echo "Available targets:"
	@echo "  make fetch   - Download iGPSPORT FIT files"
	@echo "  make parse   - Parse FIT files into SQLite"
	@echo "  make export  - Write activities.json from SQLite"
	@echo "  make test    - Run Python tests"
	@echo "  make lint    - Lint with Ruff"
	@echo "  make format  - Format with Black and fix Ruff issues"
	@echo "  make check   - Check Black formatting and Ruff"
	@echo "  make ci      - Run check and test"

fetch:
	uv run igpsport-sync

parse:
	uv run fit-parse

export:
	uv run export-activities

test:
	uv run pytest

lint:
	uv run ruff check .

format:
	uv run black .
	uv run ruff check . --fix

check:
	uv run black --check .
	uv run ruff check .

ci: check test
