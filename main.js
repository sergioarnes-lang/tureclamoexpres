document.addEventListener('DOMContentLoaded', () => {
  const copyBtn = document.getElementById('copyPlanAmigo');
  const feedback = document.getElementById('planAmigoMsg');

  const showMessage = (text, variant = 'success') => {
    if (!feedback) return;
    feedback.textContent = text;
    feedback.style.display = 'block';
    feedback.classList.remove('is-success', 'is-warning');
    if (variant === 'warning') {
      feedback.classList.add('is-warning');
    } else {
      feedback.classList.add('is-success');
    }
  };

  if (copyBtn && feedback) {
    copyBtn.addEventListener('click', async () => {
      const currentUrl = window.location.href;
      copyBtn.classList.add('copied');

      const removeHighlight = () => {
        setTimeout(() => copyBtn.classList.remove('copied'), 1500);
      };

      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          await navigator.clipboard.writeText(currentUrl);
          showMessage('Enlace copiado. ¡Compártelo con tus amigos!', 'success');
        } else {
          throw new Error('clipboard-not-supported');
        }
      } catch (error) {
        showMessage(`Copia manualmente este enlace: ${currentUrl}`, 'warning');
        const fallbackInput = document.createElement('input');
        fallbackInput.value = currentUrl;
        fallbackInput.setAttribute('aria-hidden', 'true');
        fallbackInput.style.position = 'absolute';
        fallbackInput.style.left = '-9999px';
        document.body.appendChild(fallbackInput);
        fallbackInput.select();
        try {
          document.execCommand('copy');
        } catch (execError) {
          /* Ignoramos errores del método heredado */
        }
        document.body.removeChild(fallbackInput);
      } finally {
        removeHighlight();
      }
    });
  }
});
