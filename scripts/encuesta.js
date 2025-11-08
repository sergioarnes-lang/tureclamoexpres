const form = document.getElementById('encuestaForm');
const success = document.getElementById('formSuccess');
const error = document.getElementById('formError');

if (form && success && error) {
  const API_URL = '/api/encuesta';

  const cleanText = (value) => value?.trim() ?? '';

  const requiredQuestions = Array.from({ length: 11 }, (_, index) => `q${index + 1}`);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    success.style.display = 'none';
    error.style.display = 'none';
    error.textContent = '';

    const formData = new FormData(form);
    const nombre = cleanText(formData.get('nombre'));
    const telefono = cleanText(formData.get('telefono'));
    const sector = cleanText(formData.get('sector'));
    const respuestas = requiredQuestions.reduce((acc, key) => {
      acc[key] = cleanText(formData.get(key));
      return acc;
    }, {});

    const missingQuestion = requiredQuestions.find((key) => !respuestas[key]);

    if (!nombre || !telefono || !sector) {
      error.textContent = 'Por favor, completa tus datos de contacto.';
      error.style.display = 'block';
      error.focus?.();
      return;
    }

    if (telefono.length < 5) {
      error.textContent = 'Indica un teléfono de contacto válido.';
      error.style.display = 'block';
      error.focus?.();
      return;
    }

    if (missingQuestion) {
      error.textContent = 'Por favor, responde todas las preguntas de la encuesta.';
      error.style.display = 'block';
      error.focus?.();
      return;
    }

    const payload = {
      nombre,
      telefono,
      sector,
      respuestas,
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
