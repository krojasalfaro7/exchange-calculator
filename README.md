# Exchange Calculator — BCV · Binance P2P

Calculadora lite (sin frameworks, un solo bundle de JS/CSS) con conversión en vivo
entre USD y bolívares usando la tasa oficial del BCV y la tasa paralela de Binance P2P.

Diseñada para sentirse tan rápida como la calculadora nativa de Android/MIUI, e
instalable como PWA (funciona offline una vez cargada).

## Estructura

```
index.html      → interfaz (HTML + CSS + JS que solo dibuja y conecta eventos)
calc.js         → motor de la calculadora, sin DOM (lo prueban los tests: `npm test`)
rates.js        → lógica de tasas, sin DOM: publicada vs vigente, fechas, ajustes manuales
manifest.json   → metadata de instalación (nombre, íconos, colores, display standalone)
sw.js           → service worker: cachea el app shell (cache-first) para uso offline
icons/          → íconos de la app en 192px y 512px (normal y maskable)
```

## Publicación

En vivo en **https://calc.ubbedigital.com** (GitHub Pages con dominio propio).

El workflow `.github/workflows/deploy-pages.yml` publica el contenido del repo en
GitHub Pages con cada push a `develop` (Settings → Pages → Source: **GitHub Actions**;
el dominio se configura ahí mismo, no hace falta archivo `CNAME`). El DNS es un
registro `CNAME calc → krojasalfaro7.github.io` en ubbedigital.com.

La PWA solo es instalable (service worker + "Agregar a inicio") cuando se sirve
por **HTTPS**, que es justamente lo que da GitHub Pages.

## Notas técnicas

- Sin librerías externas: prioriza rendimiento y tamaño de bundle mínimo.
- **BCV publicada y vigente**: el BCV publica cada tarde la tasa del próximo día
  hábil ("Fecha valor" en bcv.org.ve). La app muestra esa tasa publicada y, mientras
  todavía no rige, también la vigente de hoy; cuando coinciden queda una sola fila.
  Datos de `ve.dolarapi.com` (serie histórica oficial, con fecha valor).
- **Binance P2P**: su API no permite consultas desde el navegador (CORS), así que la
  fila se precarga con el promedio paralelo de dolarapi como referencia y se ajusta a mano.
- **Ajustes manuales**: tocar una tasa y escribir la fija; ningún refresco la pisa.
  El ajuste del BCV dura hasta que el BCV publica una tasa nueva; el de P2P, hasta
  tocar ↺.
- Las tasas, los ajustes y el tema se guardan en `localStorage`
  (por dominio: al cambiar de URL se empieza de cero).
