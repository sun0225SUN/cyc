.PHONY: help fetch parse export refresh ensure-source igpsport strava --igpsport --strava test lint format check ci

# Source names given next to the target, for example `make fetch igpsport`.
# `make -- fetch --igpsport` is the same. Make treats a leading `--` on its own
# command line as an option, so `make fetch --igpsport` is not a valid call.
sources := $(filter igpsport strava,$(patsubst --%,%,$(MAKECMDGOALS)))

help:
	@echo "Available targets:"
	@echo "  make fetch igpsport  - Download iGPSPORT FIT files"
	@echo "  make fetch strava    - Download Strava rides"
	@echo "  make parse igpsport  - Parse iGPSPORT FIT files into data/igpsport.db"
	@echo "  make parse strava    - Parse Strava rides into data/strava.db"
	@echo "  make export igpsport - Export data/igpsport.db to JSON"
	@echo "  make export strava   - Export data/strava.db to JSON"
	@echo "  make refresh igpsport - Fetch, parse, and export iGPSPORT"
	@echo "  make refresh strava   - Fetch, parse, and export Strava"
	@echo "  make test            - Run Python tests"
	@echo "  make lint            - Lint with Ruff"
	@echo "  make format          - Format with Black and fix Ruff issues"
	@echo "  make check           - Check Black formatting and Ruff"
	@echo "  make ci              - Run check and test"

define require_source
sources='$(sources)'; \
if [ -z "$$sources" ]; then \
	echo "usage: make $(1) igpsport|strava" >&2; \
	exit 1; \
fi; \
for source in $$sources; do \
	printf '\n================ $(1) %s ================\n' "$$source"; \
	case "$$source" in \
		igpsport) $(2) ;; \
		strava) $(3) ;; \
		*) echo "unknown source: $$source" >&2; exit 1 ;; \
	esac; \
done
endef

fetch:
	@$(call require_source,fetch,uv run igpsport-sync,uv run strava-sync)

parse:
	@$(call require_source,parse,uv run fit-parse --db data/igpsport.db,uv run strava-parse --db data/strava.db)

export:
	@$(call require_source,export,uv run export-activities --db data/igpsport.db,uv run export-activities --db data/strava.db)

ensure-source:
	@sources='$(sources)'; \
	if [ -z "$$sources" ]; then \
		echo "usage: make $(firstword $(MAKECMDGOALS)) igpsport|strava" >&2; \
		exit 1; \
	fi

refresh: ensure-source fetch parse export

igpsport strava --igpsport --strava:
	@:

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
