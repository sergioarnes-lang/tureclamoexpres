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

## Microservicio de encuesta para autónomos y pymes

El formulario de `encuesta-autonomos-pymes.html` envía los datos a un microservicio Node.js ubicado en `api/`. Este servicio valida los campos, guarda las respuestas en SQLite y lanza notificaciones por email (SendGrid) y WhatsApp (Twilio Business API).

La versión actualizada del formulario mantiene la estética de TuReclamoExprés y se compone de:

* Un bloque de datos de contacto con nombre completo, teléfono y sector/tipo de negocio (campos obligatorios).
* Once preguntas cerradas con opciones predefinidas para conocer el tiempo dedicado a revisar facturas, el conocimiento de tarifas, los principales dolores y la predisposición a probar un servicio gestionado.
* Un botón principal “Enviar y recibir mi estudio gratuito” seguido de un aviso de confianza que recuerda el uso limitado de los datos.
* Un mensaje de confirmación que muestra: `✅ Gracias por tu tiempo. Te prepararemos un estudio energético personalizado sin compromiso.`

### Requisitos previos

* Node.js 18+
* npm 9+

### Instalación de dependencias

```bash
cd api
npm install
```

### Variables de entorno

Crea un archivo `.env` dentro de `api/` con las credenciales necesarias. Puedes usar este ejemplo como plantilla:

```
PORT=3001
DB_FILE=./database/encuestas_pymes.sqlite
CORS_ORIGINS=https://tureclamoexpres.com,https://www.tureclamoexpres.com

# SendGrid
SENDGRID_API_KEY=SG.xxxxxx
SENDGRID_FROM=notificaciones@tureclamoexpres.com
SENDGRID_TO=info@tureclamoexpres.com

# Twilio WhatsApp Business
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=yyyyyyyy
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
# Destinatario interno que recibirá cada notificación por WhatsApp.
TWILIO_WHATSAPP_TO=whatsapp:+34953818494
# Plantilla de agradecimiento (namespace oficial de WhatsApp Business requerido)
TWILIO_WHATSAPP_TEMPLATE_NAMESPACE=whatsapp:hsm:empresa.namespace
TWILIO_WHATSAPP_TEMPLATE_NAME=agradecimiento_encuesta_tureclamoexpres
TWILIO_WHATSAPP_TEMPLATE_LANGUAGE=es
# Opcional: JSON con parámetros para la plantilla. Usa "{{campo}}" para mapear valores del payload.
# TWILIO_WHATSAPP_TEMPLATE_COMPONENTS=[{"type":"body","parameters":[{"type":"text","value":"{{nombre}}"}]}]
```

> **Nota:** Si no configuras `SENDGRID_TO` o `TWILIO_WHATSAPP_TO`, el sistema enviará las alertas a `info@tureclamoexpres.com` y al número de WhatsApp `+34 953 81 84 94`, respectivamente. El correo electrónico incluye los datos de contacto y un resumen numerado de las 11 preguntas, mientras que el aviso interno de WhatsApp muestra un recordatorio fijo. Con `CORS_ORIGINS` puedes definir una lista separada por comas de dominios autorizados para llamar a `POST /api/encuesta` (usa `*` si expones la API detrás de un proxy que ya filtre el acceso).

### Cómo funcionan las notificaciones de WhatsApp

* **Aviso interno:** cada respuesta genera un mensaje hacia el número configurado en `TWILIO_WHATSAPP_TO` (o `+34 953 81 84 94` por defecto) con el texto fijo `📋 Nueva respuesta en la Encuesta PYMES. Revisa la base encuestas_pymes.`.
* **Agradecimiento automático:** tras cada envío válido se lanza la plantilla `agradecimiento_encuesta_tureclamoexpres` al teléfono proporcionado por la persona encuestada. Asegúrate de que la plantilla esté aprobada en la consola de Twilio, de definir el `TWILIO_WHATSAPP_TEMPLATE_NAMESPACE` correspondiente y de que el número sea válido en formato internacional.
* **Variables de la plantilla:** cuando tu mensaje aprobado utilice parámetros, declara `TWILIO_WHATSAPP_TEMPLATE_COMPONENTS` como JSON. Puedes emplear `{{nombre}}`, `{{telefono}}`, `{{sector}}` o rutas como `{{respuestas.q1}}` para insertar valores del payload en el orden esperado por Twilio.

Al iniciar el microservicio se registrará en los logs qué plantilla está configurada para confirmar que la integración está activa.

### Migraciones iniciales

Ejecuta la migración para crear la tabla `encuestas_pymes`:

```bash
cd api
npm run migrate
```

Se generará la base de datos SQLite en `api/database/encuestas_pymes.sqlite` (puedes cambiar la ruta ajustando `DB_FILE`).

### Levantar el backend

```bash
cd api
npm start
```

El servicio quedará expuesto en `http://localhost:3001/api/encuesta` por defecto.

## Flujo end-to-end

1. Desde `index.html`, añade o actualiza un enlace hacia `encuesta-autonomos-pymes.html`. El archivo ya incluye un botón en el menú principal y una tarjeta dentro del bloque de guías que apuntan a la nueva encuesta.
2. Abre `encuesta-autonomos-pymes.html` en el navegador y completa el formulario.
3. El módulo `scripts/encuesta.js` valida los datos en el cliente y realiza un `fetch` con JSON hacia `POST /api/encuesta`.
4. El backend valida el payload, guarda la respuesta en SQLite y envía las notificaciones configuradas.
5. Comprueba los logs del servidor para verificar la inserción, el envío de email/WhatsApp y cualquier mensaje de error.

Para pruebas manuales, puedes utilizar herramientas como `curl` o `HTTPie` apuntando al endpoint con un cuerpo JSON similar al emitido por el formulario.
