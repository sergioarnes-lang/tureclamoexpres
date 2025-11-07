# Tureclamo Expres

Sitio estático con recursos y plantillas para reclamaciones de servicios.

## Verificación de enlaces internos

Antes de desplegar el sitio ejecuta la comprobación automática de enlaces internos para asegurarte de que todas las rutas relativas respondan con HTTP 200.

```bash
python3 scripts/check_internal_links.py
```

El script levanta un servidor HTTP temporal en `127.0.0.1` y rastrea todos los archivos HTML generados. Solo valida enlaces internos (rutas relativas o comenzadas por `/`) e ignora dominios externos, enlaces `mailto:` y `tel:`.

### Interpretación de resultados

* Cuando no hay incidencias, el comando finaliza con código `0` y muestra:

  ```
  Todos los enlaces internos respondieron con HTTP 200 ✅
  ```

* Si detecta enlaces rotos, el comando devuelve código `1` y lista cada ruta con el código HTTP obtenido o indicando que no hubo respuesta. Corrige los enlaces editando el HTML correspondiente (por ejemplo, actualizando la URL, creando la página faltante o eliminando el enlace) y vuelve a ejecutar la comprobación hasta que todos respondan 200.

Integra este comando en tu pipeline de CI/CD ejecutándolo justo antes del paso de despliegue para evitar publicar enlaces rotos.
