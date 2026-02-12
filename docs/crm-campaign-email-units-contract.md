# CRM Campaign Email Units — Contrato backend

Fecha de corte: `2026-02-12`.

Este módulo queda oficialmente en modo **units-only**:
- El contrato de lectura usa `units` como única clave de colección.
- No existe compatibilidad con `rows` para este endpoint.
- En import CSV, se eliminan aliases legacy de columnas (por ejemplo `date`, `campaign`, `ticket`, `in_charge`, `time_*`).

## Endpoint base

`/api/crm/campaign-email-units`

Parámetro opcional: `client` (si no se envía, usa `emg`).

## GET

Respuesta `200`:

```json
{
  "units": []
}
```

## POST (generación)

Crea units desde payload JSON de generación.

Respuesta `200`:

```json
{
  "imported": 0
}
```

## PUT (import CSV)

`Content-Type`: `text/csv`, `application/octet-stream` o `multipart/form-data`.

### Columnas CSV requeridas (canónicas)

- `send_date`
- `jira_ticket`
- `campaign_name`
- `brand`
- `market`
- `owner`

### Columnas CSV opcionales (canónicas)

- `week`, `year`, `scope`, `segment`, `touchpoint`, `variant`, `status`
- `hours_master_template`, `hours_translations`, `hours_copywriting`
- `hours_assets`, `hours_revisions`, `hours_build`, `hours_prep`

### Export CSV desde Campaign Reporting

El botón de export en `Campaign Reporting` emite CSV con estos headers canónicos.
Eso permite round-trip directo: exportar -> importar por `PUT /api/crm/campaign-email-units`.

### Errores esperados

- `400` si faltan columnas requeridas (`Missing required CSV columns: ...`)
- `400` si no hay units válidas (`No valid units found`)

## PATCH (bulk update)

Payload JSON:

```json
{
  "client": "emg",
  "ids": ["..."],
  "patch": {
    "sendDate": "2026-01-30",
    "owner": "Owner Name",
    "status": "Planned"
  }
}
```

Respuesta `200`:

```json
{
  "updated": 0
}
```

## DELETE

Payload JSON:

```json
{
  "client": "emg",
  "ids": ["..."]
}
```

Respuesta `200`:

```json
{
  "deleted": 0
}
```
