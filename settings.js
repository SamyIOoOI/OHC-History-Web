(() => {
    const script = document.currentScript;
    const siteRoot = new URL('.', script.src);
    const bar = document.getElementById('stickystuck');
    const logo = bar && bar.querySelector('.logo');

    if (!bar || !logo) {
        console.error('History Web settings could not find the top bar logo.');
        return;
    }

    const panel = document.createElement('section');
    panel.id = 'hw-settings-panel';
    panel.setAttribute('aria-label', 'Settings');
    panel.hidden = true;
    panel.innerHTML = `
        <h2>Settings</h2>
        <div class="hw-switch-list">
            <label class="hw-switch-row"><input id="hw-crt-toggle" type="checkbox"> CRT effect</label>
            <label class="hw-switch-row"><input id="hw-chars-toggle" type="checkbox"> Characters</label>
            <label class="hw-switch-row" id="hw-sound-row"><input id="hw-sound-toggle" type="checkbox"> Sound</label>
            <label class="hw-switch-row"><input id="hw-theme-toggle" type="checkbox"> Light mode</label>
        </div>
        <p class="hw-download-status" id="hw-persistence-status" aria-live="polite" hidden></p>
        <div class="hw-font-section">
            <label class="hw-font-label" for="hw-font-select">Reading font (article text)</label>
            <select id="hw-font-select">
                <option value="default">MedievalSharp (default)</option>
                <option value="blackkiyrand">BlackKiryand</option>
                <option value="cinzel">Cinzel Decorative</option>
                <option value="uncial">Uncial Antiqua</option>
                <option value="imfell">IM Fell English SC</option>
                <option value="macondo">Macondo</option>
                <option value="grenze">Grenze Gotisch</option>
                <option value="georgia">Plain (Georgia)</option>
            </select>
        </div>
        <div class="hw-titlecolor-section">
            <span class="hw-font-label">Title color</span>
            <div class="hw-titlecolor-row" id="hw-titlecolor-row" role="radiogroup" aria-label="Title color">
                <button type="button" class="hw-titlecolor" data-color="" style="background:#4a1e0a" aria-label="Default title color" title="Default"></button>
                <button type="button" class="hw-titlecolor" data-color="#b3400f" style="background:#b3400f" aria-label="Burnt orange" title="Burnt orange"></button>
                <button type="button" class="hw-titlecolor" data-color="#d4af37" style="background:#d4af37" aria-label="Gold" title="Gold"></button>
                <button type="button" class="hw-titlecolor" data-color="#a12702" style="background:#a12702" aria-label="Deep red" title="Deep red"></button>
                <button type="button" class="hw-titlecolor" data-color="#e8d5a3" style="background:#e8d5a3" aria-label="Parchment (best on dark theme)" title="Parchment (best on dark theme)"></button>
            </div>
        </div>
        <div class="hw-font-section">
            <label class="hw-font-label" for="hw-cursor-normal">Normal cursor</label>
            <select id="hw-cursor-normal">
                <option value="dotty">Dotty</option>
                <option value="blackink">Black Ink (default)</option>
                <option value="fireink">Fire Ink</option>
                <option value="longsword">Longsword</option>
                <option value="emissary">Emissary</option>
            </select>
        </div>
        <div class="hw-font-section">
            <label class="hw-font-label" for="hw-cursor-link">Link cursor (when hovering links)</label>
            <select id="hw-cursor-link">
                <option value="herald">Herald</option>
                <option value="system">System hand</option>
            </select>
        </div>
        <div class="hw-credits-section hw-dev-section">
            <a href="${new URL('development.html', siteRoot).href}">Development</a>
        </div>
        <div class="hw-credits-section">
            <a href="${new URL('contactus.html', siteRoot).href}">Credits</a>
        </div>
        <div class="hw-download-section">
            <button type="button" id="hw-download-open">Download pages</button>
            <p class="hw-download-status" id="hw-download-status" aria-live="polite"></p>
        </div>`;
    document.body.appendChild(panel);

    const crtToggle = panel.querySelector('#hw-crt-toggle');
    const charsToggle = panel.querySelector('#hw-chars-toggle');
    const soundToggle = panel.querySelector('#hw-sound-toggle');
    const themeToggle = panel.querySelector('#hw-theme-toggle');
    const soundRow = panel.querySelector('#hw-sound-row');
    const persistenceStatus = panel.querySelector('#hw-persistence-status');
    const downloadButton = panel.querySelector('#hw-download-open');
    const downloadStatus = panel.querySelector('#hw-download-status');
    const audio = document.querySelector('audio.sfx');
    let downloadModulePromise;
    let storageUnavailable = false;

    logo.setAttribute('role', 'button');
    logo.setAttribute('tabindex', '0');
    logo.setAttribute('aria-controls', panel.id);
    logo.setAttribute('aria-expanded', 'false');

    soundRow.hidden = document.documentElement.dataset.hwMusicUnavailable === 'true';
    soundToggle.disabled = !audio || typeof window.playaudio !== 'function';

    function reportStorageFailure(error) {
        if (storageUnavailable) {
            return;
        }
        storageUnavailable = true;
        persistenceStatus.hidden = false;
        persistenceStatus.textContent = 'Settings apply on this page, but browser storage is unavailable.';
        console.warn('History Web settings could not access browser storage.', error);
    }

    try {
        localStorage.getItem('hw_theme');
    } catch (error) {
        reportStorageFailure(error);
    }

    // Reading font + title color (persisted)
    const FONT_STACKS = {
        'default': null,
        'blackkiyrand': '"BlackKiryand", "MedievalSharp", cursive',
        'cinzel': '"Cinzel Decorative", "MedievalSharp", cursive',
        'uncial': '"Uncial Antiqua", "MedievalSharp", cursive',
        'imfell': '"IM Fell English SC", "MedievalSharp", cursive',
        'macondo': '"Macondo", "MedievalSharp", cursive',
        'grenze': '"Grenze Gotisch", "MedievalSharp", cursive',
        'georgia': 'Georgia, "Times New Roman", serif'
    };
    const fontSelect = panel.querySelector('#hw-font-select');
    const titlecolorRow = panel.querySelector('#hw-titlecolor-row');
    let fontCssLoaded = false;
    function ensureFontCss() {
        if (fontCssLoaded) return;
        fontCssLoaded = true;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=Cinzel+Decorative&family=Uncial+Antiqua&family=IM+Fell+English+SC&family=Macondo&family=Grenze+Gotisch&display=swap';
        document.head.appendChild(link);
    }
    function applyFont(value) {
        const stack = FONT_STACKS[value] || null;
        if (stack) ensureFontCss();
        document.documentElement.classList.toggle('hw-custom-font', !!stack);
        document.documentElement.style.setProperty('--hw-reading-font', stack || '');
    }
    // Each approved swatch keeps its identity but swaps to a legible
    // context-aware variant when the pick fails contrast on the active theme.
    const TITLE_COLOR_VARIANTS = {
        '#b3400f': { light: '#b3400f', dark: '#e07020' },
        '#d4af37': { light: '#8a6d1f', dark: '#d4af37' },
        '#a12702': { light: '#a12702', dark: '#e0664a' },
        '#e8d5a3': { light: '#8a6d1f', dark: '#e8d5a3' }
    };
    let currentTitleColor = '';
    function resolveTitleColor(value) {
        if (!value) return '';
        const variants = TITLE_COLOR_VARIANTS[value];
        if (!variants) return value;
        const isLight = document.documentElement.classList.contains('light');
        return isLight ? variants.light : variants.dark;
    }
    function applyTitleColor(value) {
        currentTitleColor = value;
        document.documentElement.classList.toggle('hw-custom-titlecolor', !!value);
        document.documentElement.style.setProperty('--hw-title-color', resolveTitleColor(value));
        titlecolorRow.querySelectorAll('.hw-titlecolor').forEach(btn => {
            btn.classList.toggle('hw-titlecolor-active', btn.dataset.color === value);
        });
    }
    let savedFont = 'default', savedTitleColor = '';
    try {
        savedFont = localStorage.getItem('hw_font') || 'default';
        savedTitleColor = localStorage.getItem('hw_titlecolor') || '';
    } catch (error) {
        reportStorageFailure(error);
    }
    if (!FONT_STACKS[savedFont]) savedFont = 'default';
    fontSelect.value = savedFont;
    applyFont(savedFont);
    applyTitleColor(savedTitleColor);
    fontSelect.addEventListener('change', () => {
        applyFont(fontSelect.value);
        store('hw_font', fontSelect.value);
    });
    titlecolorRow.addEventListener('click', event => {
        const btn = event.target.closest('.hw-titlecolor');
        if (!btn) return;
        applyTitleColor(btn.dataset.color);
        store('hw_titlecolor', btn.dataset.color);
    });

    // Cursor options (Sword n'Scroll)
    const CURSOR_NORMAL_CLASSES = ['blackink', 'fireink', 'longsword', 'emissary'];
    const cursorNormalSelect = panel.querySelector('#hw-cursor-normal');
    const cursorLinkSelect = panel.querySelector('#hw-cursor-link');
    function applyCursorNormal(value) {
        if (value === 'blackink' && !document.documentElement.classList.contains('light')) value = 'fireink';
        const root = document.documentElement;
        root.classList.remove(...CURSOR_NORMAL_CLASSES.map(name => `hw-cursor-${name}`));
        if (value !== 'dotty' && CURSOR_NORMAL_CLASSES.includes(value)) {
            root.classList.add('hw-cursor-img', `hw-cursor-${value}`);
        } else {
            root.classList.remove('hw-cursor-img');
        }
    }
    function applyCursorLink(value) {
        const root = document.documentElement;
        root.classList.toggle('hw-link-herald', value === 'herald');
        root.classList.toggle('hw-link-system', value === 'system');
        if (value !== 'herald') {
            root.classList.remove('hw-on-link');
        }
    }
    let savedCursorNormal = 'blackink', savedCursorLink = 'herald';
    try {
        savedCursorNormal = localStorage.getItem('hw_cursor_normal') || 'blackink';
        savedCursorLink = localStorage.getItem('hw_cursor_link') || 'herald';
    } catch (error) {
        reportStorageFailure(error);
    }
    if (!['dotty', ...CURSOR_NORMAL_CLASSES].includes(savedCursorNormal)) savedCursorNormal = 'blackink';
    if (!['herald', 'system'].includes(savedCursorLink)) savedCursorLink = 'herald';
    cursorNormalSelect.value = savedCursorNormal;
    cursorLinkSelect.value = savedCursorLink;
    applyCursorNormal(savedCursorNormal);
    applyCursorLink(savedCursorLink);
    cursorNormalSelect.addEventListener('change', () => {
        applyCursorNormal(cursorNormalSelect.value);
        store('hw_cursor_normal', cursorNormalSelect.value);
    });
    cursorLinkSelect.addEventListener('change', () => {
        applyCursorLink(cursorLinkSelect.value);
        store('hw_cursor_link', cursorLinkSelect.value);
    });

    let openchoices;
    panel.querySelectorAll('select').forEach(select => {
        const wrap = document.createElement('div');
        wrap.className = 'hw-choice';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'hw-choice-toggle';
        button.setAttribute('role', 'combobox');
        button.setAttribute('aria-haspopup', 'listbox');
        button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-label', panel.querySelector(`label[for="${select.id}"]`)?.textContent || select.id);
        const list = document.createElement('div');
        list.className = 'hw-choice-list';
        list.id = `${select.id}-choices`;
        list.setAttribute('role', 'listbox');
        list.hidden = true;
        button.setAttribute('aria-controls', list.id);
        select.before(wrap);
        wrap.append(button, list, select);
        select.hidden = true;
        let active = select.selectedIndex;
        function paint() {
            button.textContent = select.options[select.selectedIndex].textContent + ' ▾';
            [...list.children].forEach((item, index) => {
                item.setAttribute('aria-selected', String(index === select.selectedIndex));
                item.classList.toggle('hw-choice-active', index === active);
            });
        }
        function close() {
            list.hidden = true;
            button.setAttribute('aria-expanded', 'false');
            if (openchoices === close) openchoices = null;
        }
        function show() {
            if (openchoices) openchoices();
            active = select.selectedIndex;
            list.hidden = false;
            button.setAttribute('aria-expanded', 'true');
            openchoices = close;
            paint();
        }
        function choose(index) {
            select.selectedIndex = index;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            active = index;
            paint();
            close();
            button.focus();
        }
        [...select.options].forEach((option, index) => {
            const item = document.createElement('div');
            item.className = 'hw-choice-option';
            item.id = `${list.id}-${index}`;
            item.setAttribute('role', 'option');
            item.textContent = option.textContent;
            item.addEventListener('click', () => choose(index));
            item.addEventListener('pointerover', () => { active = index; paint(); });
            list.append(item);
        });
        button.addEventListener('click', () => list.hidden ? show() : close());
        button.addEventListener('keydown', event => {
            if (event.key === 'Escape') { close(); return; }
            if (event.key === 'Tab') { close(); return; }
            if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) {
                event.preventDefault();
                if (list.hidden) { show(); return; }
                if (event.key === 'Enter' || event.key === ' ') { choose(active); return; }
                active = event.key === 'Home' ? 0 : event.key === 'End' ? select.options.length - 1 : Math.max(0, Math.min(select.options.length - 1, active + (event.key === 'ArrowDown' ? 1 : -1)));
                button.setAttribute('aria-activedescendant', `${list.id}-${active}`);
                paint();
                list.children[active].scrollIntoView({ block: 'nearest' });
            }
        });
        document.addEventListener('pointerdown', event => { if (!wrap.contains(event.target)) close(); });
        select.addEventListener('change', paint);
        paint();
    });

    const littlepointer = document.getElementById('dotty');
    if (littlepointer) {
        document.body.appendChild(littlepointer);
        document.addEventListener('pointermove', event => {
            littlepointer.style.left = `${event.clientX}px`;
            littlepointer.style.top = `${event.clientY}px`;
        });
    }
    const whatamilookingat = 'a[href], .continentlink, .erapicker img[onclick]';
    const handtargets = whatamilookingat + ', .fakeheader, button, [role="button"], .hw-choice-toggle, .hw-choice-option';
    const notthose = '#stickystuck .logo, #wheel, .soldier, #hw-settings-panel';
    const writinghere = 'textarea, input:not([type]), input[type="text"], input[type="search"], input[type="email"], input[type="url"], input[type="password"], input[type="tel"], [contenteditable="true"]';
    document.addEventListener('pointerover', event => document.documentElement.classList.toggle('hw-writing', !!event.target.closest(writinghere)));
    document.addEventListener('pointerout', event => { if (event.target.closest(writinghere)) document.documentElement.classList.remove('hw-writing'); });
    document.addEventListener('pointerover', event => {
        document.documentElement.classList.toggle('hw-on-link', !!event.target.closest(handtargets));
    });
    document.addEventListener('pointerout', event => {
        if (event.target.closest(handtargets)) document.documentElement.classList.remove('hw-on-link');
    });
    let scrolltimer;
    document.addEventListener('click', event => {
        if (!document.documentElement.classList.contains('hw-link-herald')) return;
        if (!event.target.closest(whatamilookingat) || event.target.closest(notthose)) return;
        if (event.button !== 0 || !littlepointer) return;
        clearInterval(scrolltimer);
        document.documentElement.classList.add('hw-scroll-playing');
        let step = 0;
        littlepointer.style.backgroundPosition = '0px 0px';
        scrolltimer = setInterval(() => {
            step += 1;
            if (step >= 9) {
                clearInterval(scrolltimer);
                littlepointer.style.backgroundPosition = '';
                document.documentElement.classList.remove('hw-scroll-playing');
                return;
            }
            littlepointer.style.backgroundPosition = `${-32 * step}px 0`;
        }, 45);
    });

    crtToggle.checked = !document.documentElement.classList.contains('no-crt');
    charsToggle.checked = !document.documentElement.classList.contains('no-chars');
    themeToggle.checked = document.documentElement.classList.contains('light');

    function store(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (error) {
            reportStorageFailure(error);
        }
    }

    function positionPanel() {
        const rect = bar.getBoundingClientRect();
        const width = Math.min(336, window.innerWidth - 16);
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
        panel.style.left = `${left}px`;
        panel.style.top = `${Math.max(0, rect.bottom)}px`;
        panel.style.maxHeight = `${Math.max(120, window.innerHeight - rect.bottom - 8)}px`;
    }

    function openPanel() {
        positionPanel();
        panel.hidden = false;
        logo.setAttribute('aria-expanded', 'true');
        panel.querySelector('input:not(:disabled)').focus();
    }

    function closePanel(returnFocus) {
        if (panel.hidden) {
            return;
        }
        panel.hidden = true;
        logo.setAttribute('aria-expanded', 'false');
        if (returnFocus) {
            logo.focus();
        }
    }

    function togglePanel() {
        if (panel.hidden) {
            openPanel();
        } else {
            closePanel(true);
        }
    }

    logo.addEventListener('click', togglePanel);
    logo.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            togglePanel();
        }
    });

    document.addEventListener('pointerdown', event => {
        const picker = document.getElementById('hw-download-picker');
        if (!panel.hidden && !panel.contains(event.target) && event.target !== logo &&
            (!picker || picker.hidden || !picker.contains(event.target))) {
            closePanel(true);
        }
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !panel.hidden) {
            const picker = document.getElementById('hw-download-picker');
            if (!picker || picker.hidden) {
                closePanel(true);
            }
        }
    });

    window.addEventListener('resize', () => {
        if (!panel.hidden) {
            positionPanel();
        }
    });

    window.addEventListener('scroll', () => {
        if (!panel.hidden) {
            positionPanel();
        }
    }, { passive: true });

    crtToggle.addEventListener('change', () => {
        document.documentElement.classList.toggle('no-crt', !crtToggle.checked);
        store('hw_crt', crtToggle.checked ? 'on' : 'off');
    });

    charsToggle.addEventListener('change', () => {
        document.documentElement.classList.toggle('no-chars', !charsToggle.checked);
        store('hw_chars', charsToggle.checked ? 'on' : 'off');
    });

    themeToggle.addEventListener('change', () => {
        document.documentElement.classList.toggle('light', themeToggle.checked);
        store('hw_theme', themeToggle.checked ? 'light' : 'dark');
        applyCursorNormal(cursorNormalSelect.value);
        applyTitleColor(currentTitleColor);
    });

    function updateSoundState() {
        soundToggle.checked = !!audio && !audio.paused && !audio.ended;
    }

    if (audio) {
        ['play', 'playing', 'pause', 'ended', 'emptied'].forEach(type => {
            audio.addEventListener(type, updateSoundState);
        });
        updateSoundState();
    }

    soundToggle.addEventListener('change', () => {
        if (!audio || typeof window.playaudio !== 'function') {
            soundToggle.checked = false;
            downloadStatus.textContent = 'Sound is unavailable on this page.';
            return;
        }
        window.playaudio();
        window.setTimeout(updateSoundState, 100);
        window.setTimeout(updateSoundState, 500);
    });

    function loadScript(url) {
        return new Promise((resolve, reject) => {
            const element = document.createElement('script');
            element.src = url.href;
            element.onload = resolve;
            element.onerror = () => reject(new Error(`Could not load ${url.pathname}.`));
            document.head.appendChild(element);
        });
    }

    downloadButton.addEventListener('click', async () => {
        if (window.location.protocol === 'file:') {
            downloadStatus.textContent = 'Download pages requires the site to be served over HTTP or HTTPS.';
            return;
        }

        downloadButton.disabled = true;
        downloadStatus.textContent = 'Loading download tools...';
        try {
            if (!window.JSZip) {
                await (downloadModulePromise || (downloadModulePromise = loadScript(new URL('vendor/jszip.min.js', siteRoot))));
            }
            if (!window.HistoryWebDownloads) {
                await (downloadModulePromise = loadScript(new URL('download.js', siteRoot)));
            }
            if (!window.HistoryWebDownloads || typeof window.HistoryWebDownloads.open !== 'function') {
                throw new Error('The page download tool did not initialize.');
            }
            downloadStatus.textContent = '';
            window.HistoryWebDownloads.open({
                siteRoot,
                returnFocus: downloadButton,
                status: downloadStatus
            });
        } catch (error) {
            downloadModulePromise = undefined;
            downloadStatus.textContent = `Unable to open the download tool: ${error.message}`;
            console.error(error);
        } finally {
            downloadButton.disabled = false;
        }
    });
})();
