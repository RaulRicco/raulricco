// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DIAGNÓSTICO GRATUITO — Quiz multi-step, submit, tracking
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('year').textContent = new Date().getFullYear();

  // ━━━━━━━━━━━━━━ FAQ ACCORDION ━━━━━━━━━━━━━━
  document.querySelectorAll('.faq-question').forEach((question) => {
    question.addEventListener('click', function () {
      const item = this.parentElement;
      const wasActive = item.classList.contains('active');
      document.querySelectorAll('.faq-item').forEach((el) => el.classList.remove('active'));
      if (!wasActive) item.classList.add('active');
    });
  });

  // ━━━━━━━━━━━━━━ MÁSCARA DE TELEFONE ━━━━━━━━━━━━━━
  const phoneInput = document.getElementById('q-telefone');
  if (phoneInput) {
    phoneInput.addEventListener('input', function (e) {
      let value = e.target.value.replace(/\D/g, '');
      if (value.length <= 11) {
        if (value.length <= 10) {
          value = value.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
        } else {
          value = value.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
        }
      }
      e.target.value = value;
    });
  }

  // ━━━━━━━━━━━━━━ CAPTURA DE UTM/GCLID/FBCLID ━━━━━━━━━━━━━━
  const params = new URLSearchParams(window.location.search);
  const utms = {
    utm_source: params.get('utm_source'),
    utm_medium: params.get('utm_medium'),
    utm_campaign: params.get('utm_campaign'),
    utm_term: params.get('utm_term'),
    utm_content: params.get('utm_content'),
    gclid: params.get('gclid'),
    fbclid: params.get('fbclid'),
  };

  // ━━━━━━━━━━━━━━ COOKIES DO META PIXEL (fbp/fbc) ━━━━━━━━━━━━━━
  function getCookie(name) {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
    return match ? decodeURIComponent(match[1]) : null;
  }

  const fbp = getCookie('_fbp');
  let fbc = getCookie('_fbc');
  if (!fbc && utms.fbclid) {
    fbc = `fb.1.${Date.now()}.${utms.fbclid}`;
  }

  // ━━━━━━━━━━━━━━ QUIZ STATE ━━━━━━━━━━━━━━
  const overlay = document.getElementById('quizOverlay');
  const form = document.getElementById('quizForm');
  const progressBar = document.getElementById('quizProgressBar');
  const steps = Array.from(form.querySelectorAll('.quiz-step'));
  const numericSteps = steps
    .map((el) => el.dataset.step)
    .filter((s) => s !== 'success')
    .map(Number);
  const totalSteps = Math.max(...numericSteps);

  const quizState = { currentStep: 1, answers: {} };

  function getStepEl(step) {
    return form.querySelector(`.quiz-step[data-step="${step}"]`);
  }

  function getNextStep(current) {
    if (current === 3 && quizState.answers.ja_investe_trafego === 'nao') return 5;
    return current + 1;
  }

  function getPrevStep(current) {
    if (current === 5 && quizState.answers.ja_investe_trafego === 'nao') return 3;
    return current - 1;
  }

  function effectiveTotalSteps() {
    return quizState.answers.ja_investe_trafego === 'nao' ? totalSteps - 1 : totalSteps;
  }

  function effectivePosition(step) {
    if (quizState.answers.ja_investe_trafego === 'nao' && step > 4) return step - 1;
    return step;
  }

  function updateProgress() {
    const pos = effectivePosition(quizState.currentStep);
    const pct = (pos / effectiveTotalSteps()) * 100;
    progressBar.style.width = `${pct}%`;
  }

  function showStep(step) {
    steps.forEach((el) => el.classList.remove('active'));
    getStepEl(step).classList.add('active');
    quizState.currentStep = step;
    updateProgress();
    const input = getStepEl(step).querySelector('input');
    if (input) setTimeout(() => input.focus(), 50);
  }

  function openQuiz() {
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    showStep(1);
  }

  function closeQuiz() {
    overlay.hidden = true;
    document.body.style.overflow = '';
  }

  document.querySelectorAll('[data-action="open-quiz"]').forEach((btn) => {
    btn.addEventListener('click', openQuiz);
  });
  document.getElementById('quizClose').addEventListener('click', closeQuiz);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeQuiz();
  });

  // ━━━━━━━━━━━━━━ OPÇÕES DE MÚLTIPLA ESCOLHA ━━━━━━━━━━━━━━
  form.querySelectorAll('.quiz-options').forEach((group) => {
    const field = group.dataset.field;
    group.querySelectorAll('.quiz-option').forEach((btn) => {
      btn.addEventListener('click', function () {
        group.querySelectorAll('.quiz-option').forEach((b) => b.classList.remove('selected'));
        this.classList.add('selected');
        const value = this.dataset.value || this.textContent.trim();
        quizState.answers[field] = value;
        showStep(getNextStep(quizState.currentStep));
      });
    });
  });

  // ━━━━━━━━━━━━━━ NAVEGAÇÃO (steps de texto) ━━━━━━━━━━━━━━
  form.querySelectorAll('[data-next]').forEach((btn) => {
    btn.addEventListener('click', function () {
      const stepEl = this.closest('.quiz-step');
      const input = stepEl.querySelector('input');
      const errorEl = stepEl.querySelector('.quiz-error');

      if (input && input.hasAttribute('required') && !input.value.trim()) {
        errorEl?.classList.add('visible');
        input.focus();
        return;
      }
      if (input && input.type === 'email' && input.value.trim() && !input.checkValidity()) {
        errorEl?.classList.add('visible');
        input.focus();
        return;
      }
      errorEl?.classList.remove('visible');
      if (input) quizState.answers[input.name] = input.value.trim();
      showStep(getNextStep(quizState.currentStep));
    });
  });

  form.querySelectorAll('[data-back]').forEach((btn) => {
    btn.addEventListener('click', function () {
      showStep(getPrevStep(quizState.currentStep));
    });
  });

  // ━━━━━━━━━━━━━━ SUBMIT FINAL ━━━━━━━━━━━━━━
  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    const emailInput = document.getElementById('q-email');
    const errorEl = getStepEl(8).querySelector('.quiz-error');
    if (!emailInput.value.trim() || !emailInput.checkValidity()) {
      errorEl?.classList.add('visible');
      emailInput.focus();
      return;
    }
    errorEl?.classList.remove('visible');
    quizState.answers.email = emailInput.value.trim();

    const submitBtn = document.getElementById('quizSubmit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando...';

    const eventId = crypto.randomUUID();

    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...quizState.answers,
          ...utms,
          event_id: eventId,
          event_source_url: window.location.href,
          fbp,
          fbc,
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data || !data.ok) {
        errorEl.textContent = (data && data.error) || 'Não foi possível enviar. Tente novamente.';
        errorEl.classList.add('visible');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Enviar';
        return;
      }

      // Tracking só dispara após confirmação do backend
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        event: 'leadqualificado',
        lead_id: data.id,
        segmento: quizState.answers.segmento,
        ja_investe_trafego: quizState.answers.ja_investe_trafego,
        quanto_disposto_investir: quizState.answers.quanto_disposto_investir,
      });
      if (typeof gtag !== 'undefined') {
        gtag('event', 'generate_lead', { event_category: 'Quiz', event_label: 'Diagnóstico Gratuito' });
      }
      if (typeof fbq !== 'undefined') {
        // mesmo event_id enviado ao servidor (CAPI) para o Meta deduplicar
        fbq('track', 'Lead', {}, { eventID: eventId });
      }

      const waMessage = encodeURIComponent('quero meu diagnostico gratuito');
      document.getElementById('whatsappLink').href = `https://wa.me/5561992082577?text=${waMessage}`;

      showStep('success');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Enviar';
    } catch (err) {
      errorEl.textContent = 'Erro de conexão. Verifique sua internet e tente novamente.';
      errorEl.classList.add('visible');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Enviar';
    }
  });

  // ━━━━━━━━━━━━━━ HERO DOTTED BACKGROUND (canvas) ━━━━━━━━━━━━━━
  const canvas = document.getElementById('heroDots');
  if (canvas && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const ctx = canvas.getContext('2d');
    let width, height, dots;
    const spacing = 28;

    function resize() {
      const hero = canvas.parentElement;
      width = canvas.width = hero.offsetWidth;
      height = canvas.height = hero.offsetHeight;
      dots = [];
      for (let x = spacing; x < width; x += spacing) {
        for (let y = spacing; y < height; y += spacing) {
          dots.push({ x, y, baseY: y });
        }
      }
    }

    let t = 0;
    function draw() {
      t += 0.015;
      ctx.clearRect(0, 0, width, height);
      dots.forEach((dot) => {
        const wave = Math.sin(t + dot.x * 0.02 + dot.baseY * 0.01) * 4;
        const alpha = 0.15 + Math.sin(t + dot.x * 0.01) * 0.08;
        ctx.beginPath();
        ctx.arc(dot.x, dot.baseY + wave, 1.4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 71, 87, ${Math.max(0.05, alpha)})`;
        ctx.fill();
      });
      requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener('resize', resize);
    draw();
  }
});
