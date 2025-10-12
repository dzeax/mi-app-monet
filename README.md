Monet Email Dashboard
App para crear y visualizar campañas de email con filtros, métricas y acciones rápidas.
Stack: Next.js (App Router) + Tailwind CSS v4 + React Hook Form + Zod.

🚀 Quick start
bash
Copy
Edit
# Instala dependencias
npm install
# Construye catálogos (desde los .csv/.json)
npm run build:catalogs
# Arranca el entorno de desarrollo
npm run dev
# abre http://localhost:3000
Producción:

bash
Copy
Edit
npm run build
npm run start
🧭 Estructura (parcial)
python
Copy
Edit
app/
  page.tsx                 # layout principal (sidebar + main)
components/
  Sidebar.tsx              # Actions (botón Create campaign)
  CampaignTable.tsx        # tabla + summary sticky
  CampaignFilters.tsx      # filtros
  create-campaign/
    CreateCampaignModal.tsx# modal de alta de campañas
  ui/Combobox.tsx          # combobox headless para Campaign
context/
  CampaignDataContext.tsx  # provider (addCampaign, métricas)
data/
  reference.ts             # normaliza catálogos, helpers y reglas
  catalogs/
    campaigns.csv          # fuente editable
    partners.csv           # fuente editable
    databases.csv          # fuente editable
    invoice_rules.json     # (opcional) reglas sobrescritura
    themes.json            # fuente editable
    *.json                 # artefactos generados (no editar a mano)
scripts/
  build-catalogs.mjs       # parser/normalizador CSV/JSON → JSON
styles/
  globals.css              # Tailwind v4 + tokens + overrides
📚 Catálogos (fuentes editables)
Los catálogos se editan en data/catalogs/ y se convierten a JSON con npm run build:catalogs.
No edites los .json generados a mano: se sobreescriben.

campaigns.csv
Columnas: name,advertiser

csv
Copy
Edit
name,advertiser
Helvetia,Helvetia
Allianz sante,Allianz
...
partners.csv
Columnas: name,invoiceoffice
Valores admitidos: CAR | DAT | INT (insensible a mayúsculas; Internal → INT).

csv
Copy
Edit
name,invoiceoffice
Oceads,CAR
Startend Marketing,DAT
Dataventure (Cardata),Internal
...
databases.csv
Columnas: id,name,geo,dbType
dbType ∈ B2B | B2C | Mixed (tal cual).

csv
Copy
Edit
id,name,geo,dbType
db_dat_b2c_es,DAT_B2C_ES,ES,B2C
...
invoice_rules.json (opcional)
Sobrescribe la oficina de factura por geo y/o partner.

json
Copy
Edit
[
  { "geo": "ES", "partner": "Startend Marketing", "office": "DAT" },
  { "partner": "Oceads", "office": "CAR" },
  { "geo": "IT", "office": "DAT" }
]
themes.json
Lista de temas:

json
Copy
Edit
[
  { "label": "Insurance" },
  { "label": "Automotive" },
  { "label": "Energy & Utilities" }
]
🔧 Build de catálogos
Convierte CSV/JSON a artefactos normalizados para la app:

bash
Copy
Edit
npm run build:catalogs
Hace lo siguiente:

Limpia espacios, deduplica y genera slugs/ids estables.

Mapea Internal/int → INT.

Ordena por nombre para una mejor UX en selects/combobox.

Salida (generada en el mismo directorio):

bash
Copy
Edit
data/catalogs/campaigns.json
data/catalogs/partners.json
data/catalogs/databases.json
data/catalogs/invoice_rules.json
data/catalogs/themes.json
🧠 Reglas de “Invoice office”
La resolución vive en data/reference.ts (resolveInvoiceOffice).
Oficinas válidas: CAR, DAT, INT.

Precedencia:

Regla exacta geo + partner (invoice_rules.json)

Regla por partner (sin geo)

Default del partner (partners.csv)

Regla por geo (sin partner)

Fallback DAT

Consejo: usa exactamente el nombre de partner como aparece en el catálogo.

🖊️ Modal “Create campaign” (UX/validaciones)
Combobox (Campaign) con búsqueda y selección obligatoria desde catálogo.

Campos AUTO (readOnly, borde discontinuo): Advertiser, Invoice office, GEO, DB Type.

Campos CALC (readOnly): Routing costs, Turnover, Margin (€ & %), eCPM.

Fórmulas visibles como hints inteligentes (evitan 0/0).

KPI Bar destacado: Turnover | Margin € (% ) | eCPM.

Toasts:

Éxito al guardar

Error en validación o excepción

Accesibilidad & atajos:

Esc cierra el modal

Focus trap (Tab/Shift+Tab no salen del diálogo)

Enter guarda (ignora si estás dentro del combobox)

Ctrl/Cmd + S guarda

Botones: Save y Save & add another.

🧩 Lógica de cálculos (en vivo)
Routing costs (€) = vSent / 1000 * 0.18

Turnover (€) = qty * price

Margin (€) = turnover - routingCosts

Margin (%) = margin / turnover

eCPM (€) = (turnover / vSent) * 1000

Campos derivados son readOnly y se recalculan al escribir (números con coma/punto soportados).

🗃️ Estado & persistencia
CampaignDataProvider expone addCampaign(row) para añadir filas y refrescar tabla y métricas.
El modal recálcula por seguridad en el submit antes de llamar a addCampaign.

🎨 UI & estilos
Tailwind v4 con tokens (dark friendly) en styles/globals.css.

Inputs .input y tarjetas .card con superficies --color-surface/--color-surface-2.

Fix del icono de fecha: clase input-date + override CSS para icono claro.

✅ Checklist al tocar catálogos
Edita .csv/.json en data/catalogs/.

Ejecuta npm run build:catalogs.

Reinicia/recarga el dev server si es necesario.

Verifica en el modal que:

Campaign autocompleta Advertiser.

Database autocompleta GEO/DB Type.

Invoice office cambia según GEO + Partner.

KPI Bar refleja bien los cálculos.

🐞 Troubleshooting
Invoice office siempre “DAT”
Revisa: nombre del partner coincide al 100%, invoice_rules.json válido y npm run build:catalogs ejecutado.

No aparece campaña en el combobox
Asegúrate de que está en campaigns.csv y has reconstruido catálogos.

Icono del date oscuro
Comprueba que el input lleva className="input input-date" y el CSS global contiene el override.

📄 Licencia
Uso interno. © Dataventure / EDG.