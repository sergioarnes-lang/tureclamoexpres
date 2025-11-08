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

const questionSchema = z.object({
  q1: z.string().min(1),
  q2: z.string().min(1),
  q3: z.string().min(1),
  q4: z.string().min(1),
  q5: z.string().min(1),
  q6: z.string().min(1),
  q7: z.string().min(1),
  q8: z.string().min(1),
  q9: z.string().min(1),
  q10: z.string().min(1),
  q11: z.string().min(1)
});

const encuestaSchema = z.object({
  nombre: z.string().min(2),
  telefono: z.string().min(5),
  sector: z.string().min(2),
  respuestas: questionSchema,
  submittedAt: z.string().optional().default(() => new Date().toISOString())
});

const saveResponse = (payload) => {
  const db = getDatabase();
  const sql = `
    INSERT INTO encuestas_pymes (
      nombre, telefono, sector, respuestas, submitted_at
    ) VALUES (?, ?, ?, ?, ?);
  `;
  const values = [
    payload.nombre,
    payload.telefono,
    payload.sector,
    JSON.stringify(payload.respuestas ?? {}),
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

  const resumen = [
    `1) ${payload.respuestas.q1}`,
    `2) ${payload.respuestas.q2}`,
    `3) ${payload.respuestas.q3}`,
    `4) ${payload.respuestas.q4}`,
    `5) ${payload.respuestas.q5}`,
    `6) ${payload.respuestas.q6}`,
    `7) ${payload.respuestas.q7}`,
    `8) ${payload.respuestas.q8}`,
    `9) ${payload.respuestas.q9}`,
    `10) ${payload.respuestas.q10}`,
    `11) ${payload.respuestas.q11}`
  ].join('\n');

  const msg = {
    to,
    from,
    subject: `Nueva encuesta PYMES - ${payload.nombre}`,
    text:
      `Se ha recibido una nueva respuesta en encuestas_pymes.\n\n` +
      `Nombre: ${payload.nombre}\n` +
      `Teléfono: ${payload.telefono}\n` +
      `Sector: ${payload.sector}\n\n` +
      `Respuestas:\n${resumen}\n\n` +
      `Enviado: ${payload.submittedAt}`
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
  const telefonoLimpio = payload.telefono.replace(/\s+/g, '');
  const whatsappTo = ensureWhatsAppPrefix(telefonoLimpio);

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
