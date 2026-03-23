// Focus trap, Escape key, and focus restore for accessible modals
let previouslyFocused = null;

function openModal(id) {
    previouslyFocused = document.activeElement;
    const modal = document.getElementById(id);
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');

    requestAnimationFrame(() => {
        const focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusable.length) focusable[0].focus();
    });

    modal._keyHandler = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); closeModalById(id); return; }
        if (e.key !== 'Tab') return;

        const els = [...modal.querySelectorAll('button, [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])')].filter(el => !el.disabled && el.offsetParent !== null);
        if (els.length === 0) return;

        if (e.shiftKey && document.activeElement === els[0]) { e.preventDefault(); els[els.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === els[els.length - 1]) { e.preventDefault(); els[0].focus(); }
    };
    modal.addEventListener('keydown', modal._keyHandler);
}

function closeModalById(id) {
    const modal = document.getElementById(id);
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');

    if (modal._keyHandler) { modal.removeEventListener('keydown', modal._keyHandler); delete modal._keyHandler; }
    if (previouslyFocused?.focus) { previouslyFocused.focus(); previouslyFocused = null; }
}

function announce(message, priority = 'polite') {
    const el = document.getElementById('srAnnouncer');
    if (!el) return;
    el.setAttribute('aria-live', priority);
    el.textContent = '';
    requestAnimationFrame(() => { el.textContent = message; });
}
