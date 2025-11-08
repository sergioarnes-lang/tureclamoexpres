const form = document.getElementById('encuestaForm');
const success = document.getElementById('formSuccess');
const error = document.getElementById('formError');

if (form && success && error) {
  const API_URL = '/api/encuesta';

  const validateEmail = (value) => /\S+@\S+\.\S+/.test(value);
  const cleanText = (value) => value?.trim() ?? '';

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    success.style.display = 'none';
    error.style.display = 'none';
    error.textContent = '';

    const formData = new FormData(form);
    const nombre = cleanText(formData.get('nombre'));
    const email = cleanText(formData.get('email'));
    const telefono = cleanText(formData.get('telefono'));
    const empresa = cleanText(formData.get('empresa'));
    const sector = cleanText(formData.get('sector'));
    const empleados = cleanText(formData.get('empleados'));
    const facturacion = cleanText(formData.get('facturacion'));
    const comentarios = cleanText(formData.get('comentarios'));
    const necesidades = formData.getAll('necesidades');
    const consentimientoRGPD = formData.get('consentimientoRGPD') === 'on';
    const consentimientoCom = formData.get('consentimientoCom') === 'on';
    const consentimientoWhatsApp = formData.get('consentimientoWhatsApp') === 'on';

    if (!nombre || !email || !telefono || !empresa || !sector || !empleados || !facturacion) {
      error.textContent = 'Por favor, completa todos los campos obligatorios.';
      error.style.display = 'block';
      error.focus?.();
      return;
    }

    if (!validateEmail(email)) {
      error.textContent = 'Introduce un correo electrónico válido.';
      error.style.display = 'block';
      error.focus?.();
      return;
    }

    if (!consentimientoRGPD) {
      error.textContent = 'Debes aceptar la Política de Privacidad para continuar.';
      error.style.display = 'block';
      error.focus?.();
      return;
    }

    const payload = {
      nombre,
      email,
      telefono,
      empresa,
      sector,
      empleados,
      facturacion,
      comentarios,
      necesidades,
      consentimientoRGPD,
      consentimientoCom,
      consentimientoWhatsApp,
      submittedAt: new Date().toISOString()
    };

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const { message } = await response.json().catch(() => ({ message: 'Error al enviar la encuesta.' }));
        throw new Error(message || 'Error al enviar la encuesta.');
      }

      form.reset();
      success.style.display = 'block';
      success.focus?.();
    } catch (err) {
      error.textContent = err?.message || 'Se produjo un error inesperado. Inténtalo de nuevo más tarde.';
      error.style.display = 'block';
      error.focus?.();
    }
  });
}
