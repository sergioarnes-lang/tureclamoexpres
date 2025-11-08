import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import sgMail from '@sendgrid/mail';
import twilio from 'twilio';
import { z } from 'zod';
import { getDatabase, initialiseSchema } from '../database/client.js';

const DEFAULT_NOTIFICATION_EMAIL = 'info@tureclamoexpres.com';
const DEFAULT_WHATSAPP_NUMBER = '+34953818494';
const DEFAULT_TEMPLATE_NAME = 'agradecimiento_encuesta_tureclamoexpres';

const app = express();
const port = process.env.PORT || 3001;

const DEFAULT_ALLOWED_ORIGINS = [
  'https://tureclamoexpres.com',
  'https://www.tureclamoexpres.com',
  'http://localhost:3000',
  'http://localhost:4173',
  'http://localhost:5173',
  'http://127.0.0.1:5500',
  'http://localhost:8080'
];

const parseOrigins = (value = '') =>
  value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const configuredOrigins = parseOrigins(process.env.CORS_ORIGINS);
const allowAllOrigins = configuredOrigins.includes('*');
const allowedOrigins = allowAllOrigins
  ? ['*']
  : Array.from(new Set([...configuredOrigins, ...DEFAULT_ALLOWED_ORIGINS]));

const twilioSettings = {
  accountSid: process.env.TWILIO_ACCOUNT_SID,
  authToken: process.env.TWILIO_AUTH_TOKEN,
  from: process.env.TWILIO_WHATSAPP_FROM,
  adminTo: process.env.TWILIO_WHATSAPP_TO || DEFAULT_WHATSAPP_NUMBER,
  templateNamespace: process.env.TWILIO_WHATSAPP_TEMPLATE_NAMESPACE,
  templateName: process.env.TWILIO_WHATSAPP_TEMPLATE_NAME || DEFAULT_TEMPLATE_NAME,
  templateLanguage: process.env.TWILIO_WHATSAPP_TEMPLATE_LANGUAGE || 'es'
};

const hasBaseTwilioConfig = () =>
  Boolean(twilioSettings.accountSid && twilioSettings.authToken && twilioSettings.from);

const ensureWhatsAppPrefix = (value) =>
  (value && value.startsWith('whatsapp:')) ? value : value ? `whatsapp:${value}` : value;

const buildTemplateComponents = (payload) => {
  const rawComponents = process.env.TWILIO_WHATSAPP_TEMPLATE_COMPONENTS;

  if (!rawComponents) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(rawComponents);

    return parsed.map((component) => {
      if (component?.type !== 'body' || !Array.isArray(component.parameters)) {
        return component;
      }

      const resolvedParameters = component.parameters.map((parameter) => {
        if (parameter?.type !== 'text') {
          return parameter;
        }

        const normalise = (text) => ({ type: 'text', text: String(text ?? '') });

        if (typeof parameter.text === 'string') {
          return normalise(parameter.text);
        }

        const placeholder = typeof parameter.value === 'string' ? parameter.value : '';

        if (!placeholder.startsWith('{{') || !placeholder.endsWith('}}')) {
          return normalise(placeholder);
        }

        const path = placeholder.slice(2, -2).trim();
        const value = path.split('.').reduce((acc, key) => (acc?.[key] ?? ''), payload);

        return normalise(value);
      });

      return { ...component, parameters: resolvedParameters };
    });
  } catch (error) {
    console.warn('No se pudieron interpretar los componentes de la plantilla de WhatsApp:', error.message);
    return undefined;
  }
};

let cachedTwilioClient;

const getTwilioClient = () => {
  if (!hasBaseTwilioConfig()) {
    return null;
  }

  if (!cachedTwilioClient) {
    cachedTwilioClient = twilio(twilioSettings.accountSid, twilioSettings.authToken);
  }

  return cachedTwilioClient;
};

const confirmTwilioTemplateAvailability = () => {
  if (!hasBaseTwilioConfig()) {
    console.warn('Twilio no está completamente configurado. No se validará la plantilla de WhatsApp.');
    return;
  }

  if (!twilioSettings.templateNamespace) {
    console.warn('Falta TWILIO_WHATSAPP_TEMPLATE_NAMESPACE para enviar la plantilla de agradecimiento.');
    return;
  }

  console.log(
    `Plantilla WhatsApp configurada: ${twilioSettings.templateName} (${twilioSettings.templateLanguage}) lista para usarse.`
  );
};

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowAllOrigins) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      console.warn(`Bloqueando solicitud desde origen no permitido: ${origin}`);
      callback(null, false);
    },
    credentials: true
  })
);

app.use(express.json());

const encuestaSchema = z.object({
  nombre: z.string().min(2),
  email: z.string().email(),
  telefono: z.string().min(5),
  empresa: z.string().min(2),
  sector: z.string().min(2),
  empleados: z.string().min(1),
  facturacion: z.string().min(1),
  necesidades: z.array(z.string()).default([]),
  comentarios: z.string().optional().default(''),
  consentimientoRGPD: z.boolean(),
  consentimientoCom: z.boolean().optional().default(false),
  consentimientoWhatsApp: z.boolean().optional().default(false),
  submittedAt: z.string().optional().default(() => new Date().toISOString())
}).refine((data) => data.consentimientoRGPD, {
  message: 'Debes aceptar el tratamiento de datos para continuar.',
  path: ['consentimientoRGPD']
});

const saveResponse = (payload) => {
  const db = getDatabase();
  const sql = `
    INSERT INTO encuesta_respuestas (
      nombre, email, telefono, empresa, sector, empleados, facturacion, necesidades,
      comentarios, consentimiento_rgpd, consentimiento_com, consentimiento_whatsapp, submitted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `;
  const values = [
    payload.nombre,
    payload.email,
    payload.telefono,
    payload.empresa,
    payload.sector,
    payload.empleados,
    payload.facturacion,
    JSON.stringify(payload.necesidades ?? []),
    payload.comentarios ?? '',
    payload.consentimientoRGPD ? 1 : 0,
    payload.consentimientoCom ? 1 : 0,
    payload.consentimientoWhatsApp ? 1 : 0,
    payload.submittedAt
  ];

  return new Promise((resolve, reject) => {
    db.run(sql, values, function callback(err) {
      db.close();
      if (err) {
        reject(err);
      } else {
        resolve(this.lastID);
      }
    });
  });
};

const sendEmailNotification = async (payload) => {
  const apiKey = process.env.SENDGRID_API_KEY;
  const from = process.env.SENDGRID_FROM;
  const to = process.env.SENDGRID_TO || DEFAULT_NOTIFICATION_EMAIL;

  if (!apiKey || !from) {
    console.warn('SendGrid no está configurado. Omite el envío de email.');
    return;
  }

  sgMail.setApiKey(apiKey);

  const necesidades = (payload.necesidades || []).join(', ') || 'No indicadas';

  const msg = {
    to,
    from,
    subject: `Nueva encuesta - ${payload.empresa} (${payload.nombre})`,
    text: `Se ha recibido una nueva respuesta para la encuesta de autónomos y pymes.\n\n` +
      `Nombre: ${payload.nombre}\n` +
      `Correo: ${payload.email}\n` +
      `Teléfono: ${payload.telefono}\n` +
      `Empresa: ${payload.empresa}\n` +
      `Sector: ${payload.sector}\n` +
      `Empleados: ${payload.empleados}\n` +
      `Facturación: ${payload.facturacion}\n` +
      `Necesidades principales: ${necesidades}\n` +
      `Comentarios: ${payload.comentarios || 'Sin comentarios'}\n` +
      `Consentimiento WhatsApp: ${payload.consentimientoWhatsApp ? 'Sí' : 'No'}\n` +
      `Consentimiento comunicaciones: ${payload.consentimientoCom ? 'Sí' : 'No'}\n` +
      `Enviado: ${payload.submittedAt}`,
  };

  await sgMail.send(msg);
};

const sendInternalWhatsAppNotification = async () => {
  if (!hasBaseTwilioConfig()) {
    console.warn('Twilio no está configurado para notificaciones internas. Se omite el aviso.');
    return;
  }

  const client = getTwilioClient();

  if (!client) {
    return;
  }

  const whatsappFrom = ensureWhatsAppPrefix(twilioSettings.from);
  const whatsappTo = ensureWhatsAppPrefix(twilioSettings.adminTo);

  if (!whatsappFrom || !whatsappTo) {
    console.warn('No se pudo determinar el remitente o destinatario de WhatsApp interno.');
    return;
  }

  await client.messages.create({
    from: whatsappFrom,
    to: whatsappTo,
    body: '📋 Nueva respuesta en la Encuesta PYMES. Revisa la base encuestas_pymes.'
  });
};

const sendWhatsAppThankYou = async (payload) => {
  if (!payload.consentimientoWhatsApp) {
    console.info('El contacto no autorizó comunicaciones por WhatsApp. No se enviará agradecimiento.');
    return;
  }

  if (!hasBaseTwilioConfig()) {
    console.warn('Twilio no está configurado para WhatsApp. No se puede enviar el mensaje de agradecimiento.');
    return;
  }

  if (!twilioSettings.templateNamespace) {
    console.warn('No se especificó TWILIO_WHATSAPP_TEMPLATE_NAMESPACE. No se puede invocar la plantilla de agradecimiento.');
    return;
  }

  const client = getTwilioClient();

  if (!client) {
    return;
  }

  const whatsappFrom = ensureWhatsAppPrefix(twilioSettings.from);
  const whatsappTo = ensureWhatsAppPrefix(payload.telefono);

  if (!whatsappTo) {
    console.warn('La respuesta no incluye un teléfono válido para WhatsApp.');
    return;
  }

  const template = {
    name: twilioSettings.templateName,
    language: { code: twilioSettings.templateLanguage, policy: 'deterministic' },
    namespace: twilioSettings.templateNamespace
  };

  const components = buildTemplateComponents(payload);

  if (components?.length) {
    template.components = components;
  }

  await client.messages.create({
    from: whatsappFrom,
    to: whatsappTo,
    template
  });
};

app.post('/api/encuesta', async (req, res) => {
  try {
    const payload = encuestaSchema.parse(req.body);

    const id = await saveResponse(payload);
    await sendEmailNotification(payload).catch((err) => {
      console.error('Error al enviar email:', err.message);
    });
    await sendInternalWhatsAppNotification().catch((err) => {
      console.error('Error al enviar aviso interno de WhatsApp:', err.message);
    });
    await sendWhatsAppThankYou(payload).catch((err) => {
      console.error('Error al enviar WhatsApp de agradecimiento:', err.message);
    });

    res.status(201).json({ ok: true, id });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ ok: false, message: err.issues?.[0]?.message || 'Datos inválidos.' });
      return;
    }

    console.error('Error en /api/encuesta:', err);
    res.status(500).json({ ok: false, message: 'No se pudo procesar la encuesta.' });
  }
});

const start = async () => {
  try {
    confirmTwilioTemplateAvailability();
    await initialiseSchema();
    app.listen(port, () => {
      console.log(`API de encuesta escuchando en http://localhost:${port}`);
    });
  } catch (error) {
    console.error('No se pudo iniciar el servidor:', error);
    process.exit(1);
  }
};

start();
