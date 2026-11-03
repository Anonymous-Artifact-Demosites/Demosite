/* View controls only; empirical content remains in workflow.html. */
(() => {
    'use strict';
    const pageUrl = new URL(window.location.href);
    if (pageUrl.searchParams.has('v')) {
        pageUrl.searchParams.delete('v');
        window.history.replaceState(window.history.state, '', pageUrl.href);
    }
    const diagram = document.getElementById('workflow-diagram');
    const viewport = document.getElementById('diagram-viewport');
    const wrapper = document.getElementById('svg-wrapper');
    const sidebar = document.getElementById('sidebar-pane');
    const range = document.getElementById('zoom-range');
    const status = document.getElementById('selection-status');
    const views = {
        all: { box: '40 20 1740 1020', label: 'Full lifecycle' },
        registration: { box: '40 20 1260 540', label: 'Registration · First-party & third-party' },
        linking: { box: '1320 10 460 550', label: 'Account linking' },
        management: { box: '40 540 1260 500', label: 'Account management' }
    };
    let currentView = 'all';
    let selected = null;
    let lastTrigger = null;
    let zoom = 1;
    let panX = 0;
    let panY = 0;
    let drag = null;
    let suppressClick = false;
    let beforePrintBox = null;

    // Flow is illustrative; it does not represent live account activity.
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const flowToggle = document.getElementById('toggle-flow');
    function setFlow(enabled) {
        diagram.classList.toggle('flow-enabled', enabled);
        flowToggle.setAttribute('aria-pressed', String(enabled));
        document.getElementById('flow-toggle-label').textContent = enabled ? 'Flow on' : 'Flow off';
        document.getElementById('flow-toggle-icon').setAttribute('d', enabled ? 'M9 5v14M15 5v14' : 'M8 5l11 7-11 7z');
        flowToggle.title = enabled ? 'Pause branch flow animation' : 'Resume branch flow animation';
    }
    flowToggle.addEventListener('click', () => setFlow(!diagram.classList.contains('flow-enabled')));
    motionPreference.addEventListener('change', event => setFlow(!event.matches));
    document.addEventListener('visibilitychange', () => diagram.classList.toggle('flow-suspended', document.hidden));
    setFlow(!motionPreference.matches);

    function applyTransform() {
        wrapper.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
        range.value = String(zoom);
        document.getElementById('zoom-value').textContent = `${Math.round(zoom * 100)}%`;
        document.getElementById('zoom-out').disabled = zoom <= 0.7;
        document.getElementById('zoom-in').disabled = zoom >= 3;
    }
    function fitView() {
        zoom = 1;
        panX = panY = 0;
        applyTransform();
    }
    function setView(name) {
        if (!views[name]) return;
        currentView = name;
        diagram.setAttribute('viewBox', views[name].box);
        diagram.classList.toggle('is-focused', name !== 'all');
        diagram.querySelectorAll('[data-phase]').forEach(group => {
            const phase = group.dataset.phase;
            group.classList.toggle('is-visible-phase', name === 'all' || phase === name || (name === 'registration' && phase === 'oauth'));
        });
        viewport.setAttribute('aria-label', views[name].label + ' diagram');
        document.querySelectorAll('[data-view]').forEach(button => {
            const active = button.dataset.view === name;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', String(active));
        });
        fitView();
    }
    function setZoom(value, x = 0, y = 0) {
        const next = Math.min(3, Math.max(0.7, value));
        const ratio = next / zoom;
        panX = x - (x - panX) * ratio;
        panY = y - (y - panY) * ratio;
        zoom = next;
        applyTransform();
    }
    function highlight(key) {
        document.querySelectorAll('[data-step], [data-select]').forEach(node => {
            const active = (node.dataset.step || node.dataset.select) === key;
            node.classList.toggle(node.dataset.step ? 'is-selected' : 'is-active', active);
            node.setAttribute('aria-pressed', String(active));
        });
    }
    function showDetail(key, trigger) {
        const data = steps[key];
        if (!data) return;
        selected = key;
        lastTrigger = trigger || document.querySelector(`[data-select="${key}"]`);
        document.getElementById('d-tag').textContent = data.tag;
        document.getElementById('d-title').textContent = data.title;
        document.getElementById('d-desc').textContent = data.desc;
        setCases(document.getElementById('d-cases'), data.cases, key);
        document.getElementById('d-cases').previousElementSibling.textContent =
            key === 'step8' ? 'Reauthentication observations' :
            key === 'step9' ? 'Qualitative examples' :
            key === 'step10' ? 'Binding UI observations' : 'Sites in related attack vectors';
        setList(document.getElementById('d-cwe'), data.cwe);
        setList(document.getElementById('d-std'), data.standards);
        setAttackList(document.getElementById('d-attacks'), data.attacks || []);
        document.getElementById('d-attacks').previousElementSibling.textContent =
            key === 'step8' ? 'Related attack vector in the paper' : 'Related attack vectors';
        // Empty reference categories add no information to the inspector.
        for (const [id, items] of [['d-cases', data.cases], ['d-cwe', data.cwe], ['d-std', data.standards], ['d-attacks', data.attacks]]) {
            const section = document.getElementById(id);
            const empty = !items || items.length === 0;
            section.hidden = empty;
            section.previousElementSibling.hidden = empty;
        }
        sidebar.hidden = false;
        document.getElementById('detail-content').scrollTop = 0;
        highlight(key);
        const number = Number(key.slice(4));
        setView(number <= 3 ? 'registration' : number === 4 ? 'linking' : 'management');
        status.textContent = `${data.title} selected. ${data.desc}`;
    }
    function closeDetail(restoreFocus = false) {
        selected = null;
        sidebar.hidden = true;
        highlight(null);
        status.textContent = 'Inspector closed. Full lifecycle displayed.';
        setView('all');
        if (restoreFocus && lastTrigger) lastTrigger.focus({ preventScroll: true });
    }
    document.querySelectorAll('[data-step]').forEach(node => {
        node.addEventListener('click', () => {
            if (!suppressClick) showDetail(node.dataset.step, node);
        });
        node.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                showDetail(node.dataset.step, node);
            }
        });
    });
    document.querySelectorAll('[data-select]').forEach(button => {
        button.addEventListener('click', () => showDetail(button.dataset.select, button));
    });
    document.querySelectorAll('[data-view]').forEach(button => {
        button.addEventListener('click', () => setView(button.dataset.view));
    });
    document.getElementById('close-detail').addEventListener('click', () => closeDetail(true));
    document.getElementById('reset-view').addEventListener('click', () => closeDetail());
    document.getElementById('fit-view').addEventListener('click', fitView);
    document.getElementById('zoom-in').addEventListener('click', () => setZoom(zoom + 0.15));
    document.getElementById('zoom-out').addEventListener('click', () => setZoom(zoom - 0.15));
    range.addEventListener('input', () => setZoom(Number(range.value)));
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && selected) closeDetail(true);
    });
    viewport.addEventListener('wheel', event => {
        if (!event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        const rect = viewport.getBoundingClientRect();
        setZoom(zoom + (event.deltaY < 0 ? 0.1 : -0.1), event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height / 2);
    }, { passive: false });
    viewport.addEventListener('pointerdown', event => {
        if (event.button !== 0 || !event.isPrimary) return;
        suppressClick = false;
        drag = { id: event.pointerId, x: event.clientX, y: event.clientY, panX, panY, moved: false };
    });
    viewport.addEventListener('pointermove', event => {
        if (!drag || drag.id !== event.pointerId) return;
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) < 5) return;
        drag.moved = true;
        viewport.setPointerCapture(event.pointerId);
        viewport.classList.add('is-dragging');
        panX = drag.panX + dx;
        panY = drag.panY + dy;
        applyTransform();
    });
    function finishDrag(event) {
        if (!drag || drag.id !== event.pointerId) return;
        suppressClick = drag.moved;
        if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
        drag = null;
        viewport.classList.remove('is-dragging');
        // The synthesized pointer click follows pointerup in the same task.
        setTimeout(() => { suppressClick = false; }, 0);
    }
    window.addEventListener('pointerup', finishDrag);
    window.addEventListener('pointercancel', finishDrag);
    window.addEventListener('beforeprint', () => {
        beforePrintBox = diagram.getAttribute('viewBox');
        diagram.setAttribute('viewBox', views.all.box);
        diagram.classList.remove('is-focused');
    });
    window.addEventListener('afterprint', () => {
        if (beforePrintBox) diagram.setAttribute('viewBox', beforePrintBox);
        diagram.classList.toggle('is-focused', currentView !== 'all');
    });
    window.addEventListener('pageshow', event => { if (event.persisted) closeDetail(); });
    document.querySelector('.home-link').search = window.location.search;
    setView(currentView);
})();
