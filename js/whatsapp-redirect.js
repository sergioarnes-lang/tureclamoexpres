(function () {
  const WHATSAPP_NUMBER = '34953818494';

  const prettify = text => text.replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();

  const getFieldLabel = field => {
    if (!field) return '';
    const datasetLabel = field.dataset.whatsappLabel;
    if (datasetLabel) return datasetLabel;
    const ariaLabel = field.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel.trim();
    if (field.labels && field.labels.length > 0) {
      const labelText = field.labels[0].innerText.trim();
      if (labelText) return labelText;
    }
    const placeholder = field.getAttribute('placeholder');
    if (placeholder) return placeholder.trim();
    const name = field.name || field.id;
    if (name) return prettify(name);
    return '';
  };

  const collectFieldValue = field => {
    if (!field) return null;
    const type = (field.type || '').toLowerCase();
    if (type === 'submit' || type === 'button' || type === 'file') return null;
    if ((type === 'checkbox' || type === 'radio') && !field.checked) return null;

    if (type === 'checkbox') {
      const label = getFieldLabel(field) || 'Confirmación';
      const rawValue = field.value != null ? field.value.trim() : '';
      const value = rawValue && rawValue.toLowerCase() !== 'on' ? rawValue : 'Sí';
      return `${label}: ${value}`;
    }

    if (type === 'radio') {
      const groupLabel = field.dataset.whatsappGroup || prettify(field.name || '') || 'Opción';
      const optionLabel = getFieldLabel(field) || (field.value || '').trim();
      if (!optionLabel) return null;
      return `${groupLabel}: ${optionLabel}`;
    }

    const value = field.value != null ? field.value.trim() : '';
    if (!value) return null;
    const label = getFieldLabel(field) || 'Dato';
    return `${label}: ${value}`;
  };

  const buildMessage = form => {
    const intro = form.dataset.whatsappIntro || `Hola, he enviado un formulario desde ${document.title}.`;
    const fields = Array.from(form.querySelectorAll('input, textarea, select'))
      .map(collectFieldValue)
      .filter(Boolean);
    const body = fields.length ? `\n\n${fields.join('\n')}` : '';
    return `${intro}${body}`;
  };

  const redirectToWhatsApp = message => {
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
    window.location.href = url;
  };

  document.addEventListener('submit', event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.id === 'reclamoForm') return;
    if (!form.checkValidity()) {
      form.reportValidity?.();
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const message = buildMessage(form);
    event.preventDefault();
    event.stopImmediatePropagation();
    redirectToWhatsApp(message);
  }, true);
})();
