# Supabase migrations

## Prerrequisitos
- CLI de Supabase (`npm install -g supabase`) o `psql` disponible.
- Variables de entorno con credenciales (por ejemplo `SUPABASE_DB_URL` o el service key + connection string) exportadas antes de ejecutar los comandos.

## Aplicar la migración inicial
```bash
cd /Users/Fernando.Molina/cortex-automotriz/dataframe_base
supabase db push --file supabase/migrations/0001_multitenant_schema.sql
supabase db push --file supabase/migrations/0002_extend_organizations.sql
supabase db push --file supabase/migrations/0003_org_status.sql
```

Si prefieres `psql`, puedes ejecutar:
```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/0001_multitenant_schema.sql
```

La migración crea:
- Tablas multitenant (`cortex.organizations`, `cortex.brands`, `cortex.dealer_locations`, etc.).
- Funciones auxiliares para leer claims del JWT emitido por Supabase.
- Políticas RLS alineadas con los roles/paquetes definidos en la sesión.
- Triggers para mantener `updated_at` sincronizado.

## Próximos pasos
1. Ajustar el proceso de onboarding para poblar `cortex.organizations`, `cortex.brands` y `cortex.app_users` usando el service key.
2. Actualizar la emisión de tokens (Edge Functions o backend) para incluir los claims esperados (`role`, `org_id`, `allowed_brands`, `dealer_location_ids`, `features`).
3. Probar cada rol con `supabase.auth.signInWithPassword` y validar que los RLS filtran resultados correctamente.

## Crear un superadmin global de prueba

```bash
export SUPABASE_URL="https://trfyakvrdkkrjjpmyufd.supabase.co"
export SUPABASE_SERVICE_KEY="<service_role_key>"
export SUPABASE_DB_URL="postgresql://postgres.trfyakvrdkkrjjpmyufd:<DB_PASSWORD>@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require"

python3 scripts/bootstrap_superadmin.py \
  --org-name "Cortex Master" \
  --email superadmin@cortex.test \
  --password "TempPass123!"
```

El script crea la organización, registra el usuario en Supabase Auth con los claims `role=superadmin_global` y lo sincroniza en `cortex.app_users`. Después puedes iniciar sesión con `curl` o la UI para obtener un JWT.

## Variables para el panel de superadmin global

- Backend (`backend/app.py`): `SUPABASE_DB_URL` y `SUPERADMIN_API_TOKEN` para obligar el header `x-superadmin-token`.
- Frontend (`cortex_frontend`): `NEXT_PUBLIC_BACKEND_URL` y `NEXT_PUBLIC_SUPERADMIN_TOKEN` con el mismo valor del token.
- Accede a `http://localhost:3000/admin` para ver organizaciones, marcas, dealers y usuarios.

### Cambiar una organización de paquete “Marca” a “Black Ops”

```bash
curl -X PATCH "http://localhost:8000/admin/organizations/<ORG_ID>" \
  -H "x-superadmin-token: $SUPERADMIN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"package": "black_ops"}'
```

El administrador global del panel ofrece el mismo control mediante un selector en la tarjeta de Organización.
