// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RAUL RICCO - JAVASCRIPT PRINCIPAL
// Menu Mobile, FAQ Accordion, Form Handling
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

document.addEventListener('DOMContentLoaded', function() {
    
    // ━━━━━━━━━━━━━━ MENU MOBILE (HAMBURGER) ━━━━━━━━━━━━━━
    const hamburger = document.getElementById('hamburger');
    const navMenu = document.getElementById('navMenu');
    
    if (hamburger && navMenu) {
        hamburger.addEventListener('click', function() {
            hamburger.classList.toggle('active');
            navMenu.classList.toggle('active');
        });
        
        // Fechar menu ao clicar em um link
        const navLinks = navMenu.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            link.addEventListener('click', function() {
                hamburger.classList.remove('active');
                navMenu.classList.remove('active');
            });
        });
        
        // Fechar menu ao clicar fora
        document.addEventListener('click', function(event) {
            const isClickInsideMenu = navMenu.contains(event.target);
            const isClickOnHamburger = hamburger.contains(event.target);
            
            if (!isClickInsideMenu && !isClickOnHamburger && navMenu.classList.contains('active')) {
                hamburger.classList.remove('active');
                navMenu.classList.remove('active');
            }
        });
    }
    
    // ━━━━━━━━━━━━━━ FAQ ACCORDION ━━━━━━━━━━━━━━
    const faqQuestions = document.querySelectorAll('.faq-question');
    
    faqQuestions.forEach(question => {
        question.addEventListener('click', function() {
            const faqItem = this.parentElement;
            const isActive = faqItem.classList.contains('active');
            
            // Fechar todos os FAQs
            document.querySelectorAll('.faq-item').forEach(item => {
                item.classList.remove('active');
            });
            
            // Abrir o FAQ clicado (se não estava ativo)
            if (!isActive) {
                faqItem.classList.add('active');
            }
        });
    });
    
    // ━━━━━━━━━━━━━━ SMOOTH SCROLL ━━━━━━━━━━━━━━
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href !== '#' && href !== '') {
                const target = document.querySelector(href);
                if (target) {
                    e.preventDefault();
                    const headerOffset = 80;
                    const elementPosition = target.getBoundingClientRect().top;
                    const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
                    
                    window.scrollTo({
                        top: offsetPosition,
                        behavior: 'smooth'
                    });
                }
            }
        });
    });
    
    // ━━━━━━━━━━━━━━ SCROLL HEADER BACKGROUND ━━━━━━━━━━━━━━
    const header = document.querySelector('.header');
    if (header) {
        window.addEventListener('scroll', function() {
            if (window.scrollY > 50) {
                header.style.background = 'rgba(10, 10, 10, 0.98)';
                header.style.boxShadow = '0 2px 20px rgba(0, 0, 0, 0.5)';
            } else {
                header.style.background = 'rgba(10, 10, 10, 0.95)';
                header.style.boxShadow = 'none';
            }
        });
    }
    
    // ━━━━━━━━━━━━━━ ANIMAÇÕES AO SCROLL ━━━━━━━━━━━━━━
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('fade-in-up');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);
    
    // Observar cards, seções, etc
    document.querySelectorAll('.card, .step, .metric-card').forEach(element => {
        observer.observe(element);
    });
    
    // ━━━━━━━━━━━━━━ MÁSCARA DE TELEFONE ━━━━━━━━━━━━━━
    const phoneInput = document.getElementById('phone');
    if (phoneInput) {
        phoneInput.addEventListener('input', function(e) {
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
    
    // ━━━━━━━━━━━━━━ ANALYTICS TRACKING (opcional) ━━━━━━━━━━━━━━
    // Rastrear cliques em CTAs
    document.querySelectorAll('.cta-button, .cta-header').forEach(button => {
        button.addEventListener('click', function() {
            const buttonText = this.textContent.trim();
            
            // Google Analytics (se implementado)
            if (typeof gtag !== 'undefined') {
                gtag('event', 'click', {
                    'event_category': 'CTA',
                    'event_label': buttonText
                });
            }
            
            // Facebook Pixel (se implementado)
            if (typeof fbq !== 'undefined') {
                fbq('track', 'Lead', {
                    content_name: buttonText
                });
            }
        });
    });
    
});

// ━━━━━━━━━━━━━━ FORM SUBMISSION HANDLER ━━━━━━━━━━━━━━
function handleFormSubmit(event) {
    event.preventDefault();
    
    const form = event.target;
    const formMessage = document.getElementById('formMessage');
    const submitButton = form.querySelector('button[type="submit"]');
    
    // Validar formulário
    if (!form.checkValidity()) {
        form.reportValidity();
        return false;
    }
    
    // Coletar dados do formulário
    const formData = {
        name: document.getElementById('name').value,
        email: document.getElementById('email').value,
        phone: document.getElementById('phone').value,
        service: document.getElementById('service').value,
        message: document.getElementById('message').value,
        privacy: document.getElementById('privacy').checked,
        timestamp: new Date().toISOString()
    };
    
    // Desabilitar botão durante envio
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
    
    // Simular envio (em produção, integrar com backend ou serviço de e-mail)
    setTimeout(() => {
        // Sucesso
        formMessage.style.display = 'block';
        formMessage.style.background = 'linear-gradient(135deg, rgba(0, 200, 83, 0.2), rgba(0, 200, 83, 0.1))';
        formMessage.style.border = '1px solid var(--color-green)';
        formMessage.style.color = 'var(--color-green)';
        formMessage.innerHTML = `
            <strong>✓ Mensagem enviada com sucesso!</strong><br>
            Obrigado pelo contato, ${formData.name}! Raul Ricco entrará em contato em breve.
        `;
        
        // Resetar formulário
        form.reset();
        
        // Reabilitar botão
        submitButton.disabled = false;
        submitButton.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar Mensagem';
        
        // Scroll suave para a mensagem
        formMessage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        
        // Analytics
        if (typeof gtag !== 'undefined') {
            gtag('event', 'generate_lead', {
                'event_category': 'Form',
                'event_label': 'Contact Form Submission'
            });
        }
        
        if (typeof fbq !== 'undefined') {
            fbq('track', 'Lead');
        }
        
        // Redirecionar para WhatsApp após 3 segundos (opcional)
        setTimeout(() => {
            const whatsappMessage = `Olá Raul! Acabei de preencher o formulário de contato no site. Meu nome é ${formData.name}.`;
            const whatsappURL = `https://wa.me/5561992082577?text=${encodeURIComponent(whatsappMessage)}`;
            
            if (confirm('Gostaria de continuar a conversa pelo WhatsApp agora?')) {
                window.open(whatsappURL, '_blank');
            }
        }, 3000);
        
    }, 1500);
    
    return false;
}

// ━━━━━━━━━━━━━━ UTILITÁRIOS ━━━━━━━━━━━━━━

// Detectar se é mobile
function isMobile() {
    return window.innerWidth <= 768;
}

// Detectar scroll para elemento
function isInViewport(element) {
    const rect = element.getBoundingClientRect();
    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
}

// Formatar número de telefone
function formatPhone(phone) {
    const cleaned = phone.replace(/\D/g, '');
    
    if (cleaned.length === 11) {
        return cleaned.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    } else if (cleaned.length === 10) {
        return cleaned.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    }
    
    return phone;
}

// ━━━━━━━━━━━━━━ PERFORMANCE ━━━━━━━━━━━━━━

// Lazy loading de imagens (para futuras implementações)
if ('loading' in HTMLImageElement.prototype) {
    const images = document.querySelectorAll('img[loading="lazy"]');
    images.forEach(img => {
        img.src = img.dataset.src;
    });
} else {
    // Fallback para navegadores antigos
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/lazysizes/5.3.2/lazysizes.min.js';
    document.body.appendChild(script);
}

// ━━━━━━━━━━━━━━ CONSOLE INFO ━━━━━━━━━━━━━━
console.log('%c🚀 Raul Ricco - Especialista em Tráfego Pago', 'color: #F5A000; font-size: 16px; font-weight: bold;');
console.log('%cSite: raulricco.com.br', 'color: #00C853; font-size: 12px;');
console.log('%cWhatsApp: (61) 99208-2577', 'color: #CCCCCC; font-size: 12px;');
