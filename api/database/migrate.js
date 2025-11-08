import 'dotenv/config';
import { initialiseSchema } from './client.js';

initialiseSchema()
  .then(() => {
    console.log('Base de datos lista.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('No se pudo inicializar la base de datos:', error);
    process.exit(1);
  });
