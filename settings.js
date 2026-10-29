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
