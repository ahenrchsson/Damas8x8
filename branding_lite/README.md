# Branding Lite (GLPI 11+)

Plugin minimalista para administrar e inyectar un favicon en todas las páginas de GLPI (incluida la pantalla de login), sin tocar UI, CSS/SCSS, navbar logo ni JavaScript.

## Instalación (Docker)
1) Copia el plugin a la ruta persistente del volumen:
   - `./storage/glpi/marketplace/branding_lite`
2) Reinicia el contenedor de GLPI o recarga el listado de plugins.
3) Activa el plugin en **Configuración > Plugins**.

## Configuración
1) En la pantalla **Configurar** del plugin, sube un favicon (`image/*`).
2) El navegador puede rendir mejor con `ico/png/svg`, pero el plugin acepta cualquier formato compatible (`jpeg/jpg/webp/gif`, etc.).

## Cache busting
El plugin agrega automáticamente `?v=<timestamp>` al favicon. Ese valor se actualiza cada vez que cambias la imagen para forzar el refresco del navegador.

## Tutorial: cambiar logo interno por entidad (sin plugin)
1) Ir a **Entidades**.
2) Seleccionar la entidad.
3) Entrar en **Personalización de interfaz de usuario > CSS**.
4) Pegar el siguiente CSS y reemplazar `url.png` por la URL real de tu logo.

```css
.page .glpi-logo {
    /* ... Propiedades de imagen y tamaño (ej. 150px/90px) ... */
    background: url('url.png') no-repeat;
    background-size: contain;
    background-position: center;
    width: 150px;
    height: 98px;

    /* 📌 Márgenes para centrar y separar */
    margin-top: auto;/*20px; /* Separación de 20px de la parte superior */
    margin-left: auto; /* Centrar horizontalmente */
    margin-right: auto; /* Centrar horizontalmente */
}

body.navbar-collapsed .navbar-brand .glpi-logo {
    background: url('url.png') no-repeat;
    background-size: contain !important;
    background-position: center;
    width: 40px;
    height: 40px;
}
```
