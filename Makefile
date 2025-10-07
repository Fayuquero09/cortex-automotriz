SHELL := /bin/zsh

.PHONY: dev stop migrate supabase:push supabase:psql

dev:
	@bash tools/scripts/dev_all.sh

stop:
	@bash tools/scripts/stop_dev.sh

migrate:
	@echo "Consulta infra/supabase o supabase/README.md para comandos de migración"

supabase:push:
	@echo "Ejecuta: supabase db push --file infra/supabase/migrations/<file>.sql"

supabase:psql:
	@echo "Ejecuta: psql $$SUPABASE_DB_URL -f infra/supabase/migrations/<file>.sql"
