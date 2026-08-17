# Exchange Calculator — BCV · Binance P2P

Calculadora lite (sin frameworks, un solo bundle de JS/CSS) con conversión en vivo
entre USD y bolívares usando la tasa oficial del BCV y la tasa paralela de Binance P2P.

Diseñada para sentirse tan rápida como la calculadora nativa de Android/MIUI, e
instalable como PWA (funciona offline una vez cargada).

## Estructura

```
index.html      → app completa (HTML + CSS + JS, sin dependencias externas)
manifest.json   → metadata de instalación (nombre, íconos, colores, display standalone)
sw.js           → service worker: cachea el app shell (cache-first) para uso offline
icons/          → íconos de la app en 192px y 512px (normal y maskable)
```

## Publicar en GitHub Pages

Este repo incluye un workflow (`.github/workflows/deploy-pages.yml`) que publica
automáticamente el contenido de la rama principal en GitHub Pages con cada push.

Para activarlo (una sola vez):

1. Ve a **Settings → Pages** en este repositorio.
2. En **Source**, selecciona **GitHub Actions**.
3. Haz push a `main` (o `develop`) — el workflow se encarga del resto.

La PWA solo es instalable (service worker + "Agregar a inicio") cuando se sirve
por **HTTPS**, que es justamente lo que da GitHub Pages.

## Notas técnicas

- Sin librerías externas: prioriza rendimiento y tamaño de bundle mínimo.
- Las tasas BCV/Binance P2P se pueden editar manualmente tocándolas; también
  se intenta traerlas automáticamente al abrir la app (falla silenciosamente
  si el navegador bloquea el fetch por CORS, y se puede seguir usando a mano).
- No usa `localStorage` — las tasas no persisten entre sesiones por ahora.
