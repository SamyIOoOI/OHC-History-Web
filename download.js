(() => {
    let activePicker = null;

    function decodePath(pathname) {
        try {
            return decodeURIComponent(pathname);
        } catch (error) {
            throw new Error(`Could not decode local path: ${pathname}`);
        }
    }

    function pathInsideSite(url, siteRoot) {
        return url.origin === siteRoot.origin && url.pathname.startsWith(siteRoot.pathname);
    }

    function zipPathFromUrl(url, siteRoot) {
        if (!pathInsideSite(url, siteRoot)) {
            return null;
        }
        const path = decodePath(url.pathname.slice(siteRoot.pathname.length));
        if (!path || path.split('/').includes('..')) {
            return null;
        }
        return path;
    }

    function relativeZipPath(fromPath, toPath) {
        const fromParts = fromPath.split('/');
        fromParts.pop();
        const toParts = toPath.split('/');
        let common = 0;
        while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common]) {
            common++;
        }
        return [...Array(fromParts.length - common).fill('..'), ...toParts.slice(common)].join('/') || '.';
    }

    function encodedRelativePath(path) {
        return path.split('/').map(part => encodeURIComponent(part)).join('/');
    }

    function resolveReference(value, baseUrl) {
        const trimmed = value.trim();
        if (!trimmed || /^(?:data:|blob:|javascript:|mailto:|tel:|#)/i.test(trimmed)) {
            return null;
        }
        try {
            return new URL(trimmed, baseUrl);
        } catch (error) {
            throw new Error(`Could not resolve local reference: ${trimmed}`);
        }
    }

    function normalizedAssetUrl(value, baseUrl, siteRoot) {
        const url = resolveReference(value, baseUrl);
        const path = url && zipPathFromUrl(url, siteRoot);
        // Era pages resolve the shared favicon one directory too deep.
        if (path && /^erafiles\/[^/]+\/favicons\/favicon\.ico$/i.test(path)) {
            return new URL('favicons/favicon.ico', siteRoot);
        }
        return url;
    }

    function getSuffix(url) {
        return `${url.search}${url.hash}`;
    }

    function rewrittenAssetReference(value, baseUrl, ownerPath, siteRoot) {
        const url = normalizedAssetUrl(value, baseUrl, siteRoot);
        const targetPath = url && zipPathFromUrl(url, siteRoot);
        if (!targetPath) {
            return value;
        }
        return `${encodedRelativePath(relativeZipPath(ownerPath, targetPath))}${getSuffix(url)}`;
    }

    function rewrittenSelectedPage(value, baseUrl, ownerPath, selectedPaths, siteRoot) {
        const url = resolveReference(value, baseUrl);
        const targetPath = url && zipPathFromUrl(url, siteRoot);
        if (!targetPath || !selectedPaths.has(targetPath)) {
            return value;
        }
        return `${encodedRelativePath(relativeZipPath(ownerPath, targetPath))}${getSuffix(url)}`;
    }

    function cssReferences(css) {
        const references = [];
        const urlPattern = /url\(\s*(?:(['"])(.*?)\1|([^)]*?))\s*\)/gi;
        let match;
        while ((match = urlPattern.exec(css))) {
            references.push((match[2] || match[3] || '').trim());
        }
        const importPattern = /@import\s+(?!url\s*\()(['"])(.*?)\1/gi;
        while ((match = importPattern.exec(css))) {
            references.push(match[2].trim());
        }
        return references;
    }

    function rewriteCss(css, baseUrl, ownerPath, siteRoot) {
        let result = css.replace(/url\(\s*(?:(['"])(.*?)\1|([^)]*?))\s*\)/gi, (whole, quote, quoted, plain) => {
            const value = (quoted || plain || '').trim();
            const rewritten = rewrittenAssetReference(value, baseUrl, ownerPath, siteRoot);
            return `url(${quote || ''}${rewritten}${quote || ''})`;
        });
        result = result.replace(/(@import\s+)(['"])(.*?)\2/gi, (whole, prefix, quote, value) => {
            const rewritten = rewrittenAssetReference(value, baseUrl, ownerPath, siteRoot);
            return `${prefix}${quote}${rewritten}${quote}`;
        });
        return result;
    }

    function localCandidatesFromHandler(value) {
        const candidates = [];
        const pattern = /(['"])([^'"]+)\1/g;
        let match;
        while ((match = pattern.exec(value))) {
            if (/[/.]\w/.test(match[2]) && /(?:\.html|\.css|\.js|\.png|\.jpe?g|\.gif|\.webp|\.svg|\.ico|\.wav|\.mp3|\.ogg|\.woff2?|\.ttf)(?:[?#].*)?$/i.test(match[2])) {
                candidates.push(match[2]);
            }
        }
        return candidates;
    }

    function rewriteHandler(value, baseUrl, ownerPath, selectedPaths, siteRoot) {
        return value.replace(/(['"])([^'"]+)\1/g, (whole, quote, candidate) => {
            if (!/[/.]\w/.test(candidate) ||
                !/(?:\.html|\.css|\.js|\.png|\.jpe?g|\.gif|\.webp|\.svg|\.ico|\.wav|\.mp3|\.ogg|\.woff2?|\.ttf)(?:[?#].*)?$/i.test(candidate)) {
                return whole;
            }
            const pagePath = rewrittenSelectedPage(candidate, baseUrl, ownerPath, selectedPaths, siteRoot);
            const rewritten = pagePath !== candidate ?
                pagePath : rewrittenAssetReference(candidate, baseUrl, ownerPath, siteRoot);
            return `${quote}${rewritten}${quote}`;
        });
    }

    function pageAssets(document, baseUrl, siteRoot, addAsset, selectedPaths) {
        const selectors = [
            ['link[href]', 'href'],
            ['script[src]', 'src'],
            ['img[src]', 'src'],
            ['source[src]', 'src'],
            ['audio[src]', 'src'],
            ['video[src]', 'src'],
            ['video[poster]', 'poster'],
            ['iframe[src]', 'src'],
            ['embed[src]', 'src'],
            ['object[data]', 'data']
        ];

        selectors.forEach(([selector, attribute]) => {
            document.querySelectorAll(selector).forEach(element => addAsset(element.getAttribute(attribute), baseUrl));
        });

        document.querySelectorAll('[srcset]').forEach(element => {
            element.getAttribute('srcset').split(',').forEach(candidate => {
                const url = candidate.trim().split(/\s+/)[0];
                if (url) {
                    addAsset(url, baseUrl);
                }
            });
        });

        document.querySelectorAll('[style]').forEach(element => {
            cssReferences(element.getAttribute('style')).forEach(reference => addAsset(reference, baseUrl));
        });

        document.querySelectorAll('style').forEach(element => {
            cssReferences(element.textContent).forEach(reference => addAsset(reference, baseUrl));
        });

        document.querySelectorAll('[onclick]').forEach(element => {
            localCandidatesFromHandler(element.getAttribute('onclick')).forEach(reference => {
                const url = resolveReference(reference, baseUrl);
                const path = url && zipPathFromUrl(url, siteRoot);
                if (path && (selectedPaths.has(path) || /\.html?$/i.test(path))) {
                    return;
                }
                addAsset(reference, baseUrl);
            });
        });
    }

    function addRow(parent, page, selected, update) {
        const label = document.createElement('label');
        label.className = 'hw-picker-page';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = page.path;
        checkbox.dataset.page = 'true';
        checkbox._page = page;
        checkbox.checked = selected.has(page.path);
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                selected.add(page.path);
            } else {
                selected.delete(page.path);
            }
            update();
        });
        const title = document.createElement('span');
        title.textContent = page.title;
        label.append(checkbox, title);
        parent.appendChild(label);
    }

    function addGroup(parent, title, pages, selected, update, nested) {
        const details = document.createElement('details');
        details.className = `hw-picker-group${nested ? ' hw-picker-nested' : ''}`;
        const summary = document.createElement('summary');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.setAttribute('aria-label', `Select all ${title}`);
        checkbox.addEventListener('click', event => event.stopPropagation());
        checkbox.addEventListener('change', () => {
            pages.forEach(page => {
                if (checkbox.checked) {
                    selected.add(page.path);
                } else {
                    selected.delete(page.path);
                }
            });
            update();
        });
        const text = document.createElement('span');
        text.textContent = ` ${title}`;
        summary.append(checkbox, text);
        details.appendChild(summary);
        const content = document.createElement('div');
        content.className = 'hw-picker-nested';
        details.appendChild(content);
        parent.appendChild(details);
        return { checkbox, content };
    }

    function musicSize(url) {
        return fetch(url.href, { method: 'HEAD' }).then(response => {
            if (response.ok) {
                const length = Number(response.headers.get('content-length'));
                if (Number.isFinite(length) && length > 0) {
                    return length;
                }
            }
            return fetch(url.href).then(download => {
                if (!download.ok) {
                    throw new Error(`Could not read ${url.pathname} (${download.status}).`);
                }
                return download.blob().then(blob => blob.size);
            });
        });
    }

    async function prepareArchive(state, selectedPages, includeMusic) {
        const selectedPaths = new Set(selectedPages.map(page => page.path));
        const renderedPages = [];
        const assets = new Map();
        const musicUrl = new URL('backgroundsound.wav', state.siteRoot);

        for (let index = 0; index < selectedPages.length; index++) {
            const page = selectedPages[index];
            state.progress.textContent = `Fetching file ${index + 1} of ${selectedPages.length}`;
            const url = new URL(page.path, state.siteRoot);
            let response;
            try {
                response = await fetch(url.href);
            } catch (error) {
                throw new Error(`Could not fetch selected page: ${page.path}`);
            }
            if (!response.ok) {
                throw new Error(`Could not fetch selected page: ${page.path} (HTTP ${response.status}).`);
            }
            const source = await response.text();
            const parsed = new DOMParser().parseFromString(source, 'text/html');
            const baseElement = parsed.querySelector('base[href]');
            const baseUrl = baseElement ? new URL(baseElement.getAttribute('href'), url) : url;
            if (!includeMusic) {
                parsed.documentElement.dataset.hwMusicUnavailable = 'true';
                parsed.querySelectorAll('audio').forEach(audio => {
                    audio.removeAttribute('src');
                    audio.removeAttribute('autoplay');
                    audio.setAttribute('preload', 'none');
                    audio.querySelectorAll('source').forEach(sourceElement => sourceElement.remove());
                });
            }
            renderedPages.push({ page, url, baseUrl, document: parsed });

            const addAsset = (value, fromUrl) => {
                const assetUrl = normalizedAssetUrl(value, fromUrl, state.siteRoot);
                const assetPath = assetUrl && zipPathFromUrl(assetUrl, state.siteRoot);
                if (!assetUrl || !assetPath || selectedPaths.has(assetPath) || (!includeMusic && assetUrl.href === musicUrl.href)) {
                    return;
                }
                if (!assets.has(assetPath)) {
                    assets.set(assetPath, { url: assetUrl, path: assetPath });
                }
            };
            pageAssets(parsed, baseUrl, state.siteRoot, addAsset, selectedPaths);

            const inlineScripts = [...parsed.querySelectorAll('script:not([src])')].map(script => script.textContent).join('\n');
            if (inlineScripts.includes('current_soldier') && inlineScripts.includes('warriorwheel/')) {
                for (let soldier = 1; soldier <= 16; soldier++) {
                    addAsset(`warriorwheel/${soldier}.png`, state.siteRoot);
                }
            }
        }

        const missing = [];
        const fetchedAssets = new Map();
        const pending = new Map(assets);
        let fetchedCount = 0;
        while (pending.size) {
            const [assetPath, asset] = pending.entries().next().value;
            pending.delete(assetPath);
            fetchedCount++;
            state.progress.textContent = `Fetching file ${fetchedCount} of ${fetchedCount + pending.size} (assets)`;
            let response;
            try {
                response = await fetch(asset.url.href);
            } catch (error) {
                missing.push(assetPath);
                continue;
            }
            if (!response.ok) {
                missing.push(`${assetPath} (HTTP ${response.status})`);
                continue;
            }
            const contentType = response.headers.get('content-type') || '';
            if (/\.css(?:$|[?#])/i.test(asset.url.href) || contentType.includes('text/css')) {
                const css = await response.text();
                fetchedAssets.set(assetPath, { css, url: asset.url });
                cssReferences(css).forEach(reference => {
                    const imported = resolveReference(reference, asset.url);
                    const importedPath = imported && zipPathFromUrl(imported, state.siteRoot);
                    if (importedPath && !selectedPaths.has(importedPath) && !assets.has(importedPath) && !fetchedAssets.has(importedPath)) {
                        assets.set(importedPath, { url: imported, path: importedPath });
                        pending.set(importedPath, { url: imported, path: importedPath });
                    }
                });
            } else {
                fetchedAssets.set(assetPath, { data: await response.arrayBuffer(), url: asset.url });
            }
        }

        if (includeMusic && !assets.has('backgroundsound.wav') && !fetchedAssets.has('backgroundsound.wav')) {
            assets.set('backgroundsound.wav', { url: musicUrl, path: 'backgroundsound.wav' });
            pending.set('backgroundsound.wav', { url: musicUrl, path: 'backgroundsound.wav' });
            while (pending.size) {
                const [assetPath, asset] = pending.entries().next().value;
                pending.delete(assetPath);
                fetchedCount++;
                state.progress.textContent = `Fetching file ${fetchedCount} of ${fetchedCount + pending.size} (assets)`;
                try {
                    const response = await fetch(asset.url.href);
                    if (!response.ok) {
                        missing.push(`${assetPath} (HTTP ${response.status})`);
                    } else {
                        fetchedAssets.set(assetPath, { data: await response.arrayBuffer(), url: asset.url });
                    }
                } catch (error) {
                    missing.push(assetPath);
                }
            }
        }

        const zip = new JSZip();
        renderedPages.forEach(({ page, url, baseUrl, document }) => {
            document.querySelectorAll('base').forEach(element => element.remove());
            const ownerPath = page.path;
            document.querySelectorAll('a[href]').forEach(element => {
                const value = element.getAttribute('href');
                element.setAttribute('href', rewrittenSelectedPage(value, baseUrl, ownerPath, selectedPaths, state.siteRoot));
            });
            const references = [
                ['link[href]', 'href'],
                ['script[src]', 'src'],
                ['img[src]', 'src'],
                ['source[src]', 'src'],
                ['audio[src]', 'src'],
                ['video[src]', 'src'],
                ['video[poster]', 'poster'],
                ['iframe[src]', 'src'],
                ['embed[src]', 'src'],
                ['object[data]', 'data']
            ];
            references.forEach(([selector, attribute]) => {
                document.querySelectorAll(selector).forEach(element => {
                    const value = element.getAttribute(attribute);
                    element.setAttribute(attribute, rewrittenAssetReference(value, baseUrl, ownerPath, state.siteRoot));
                });
            });
            document.querySelectorAll('[srcset]').forEach(element => {
                const rewritten = element.getAttribute('srcset').split(',').map(candidate => {
                    const pieces = candidate.trim().split(/\s+/);
                    pieces[0] = rewrittenAssetReference(pieces[0], baseUrl, ownerPath, state.siteRoot);
                    return pieces.join(' ');
                }).join(', ');
                element.setAttribute('srcset', rewritten);
            });
            document.querySelectorAll('[style]').forEach(element => {
                element.setAttribute('style', rewriteCss(element.getAttribute('style'), baseUrl, ownerPath, state.siteRoot));
            });
            document.querySelectorAll('style').forEach(element => {
                element.textContent = rewriteCss(element.textContent, baseUrl, ownerPath, state.siteRoot);
            });
            document.querySelectorAll('[onclick]').forEach(element => {
                element.setAttribute('onclick', rewriteHandler(element.getAttribute('onclick'), baseUrl, ownerPath, selectedPaths, state.siteRoot));
            });
            zip.file(ownerPath, `<!doctype html>\n${document.documentElement.outerHTML}`);
        });

        fetchedAssets.forEach((asset, assetPath) => {
            if (asset.css !== undefined) {
                zip.file(assetPath, rewriteCss(asset.css, asset.url, assetPath, state.siteRoot));
            } else {
                zip.file(assetPath, asset.data, { binary: true });
            }
        });

        return { zip, missing: [...new Set(missing)], selectedPages, fetchedAssets };
    }

    function buildReadme(selectedPages, includeMusic) {
        const pageLines = selectedPages.map(page => `- ${page.title} (${page.path})`).join('\n');
        return [
            'History Web page download',
            '',
            'How to open your pages:',
            'Extract the whole ZIP and keep its folder structure intact. From the extracted folder, navigate through the folders to the chosen .html file and open it in a browser.',
            'Do not move a page away from the shared files it depends on.',
            `Example: open ${selectedPages[0].path} from the extracted folder.`,
            '',
            'Included pages:',
            pageLines,
            '',
            'Links to pages that were not selected will not work from this archive.',
            'The Google Font, embeds, and external links still need an internet connection; this is not fully offline.',
            `Background music ${includeMusic ? 'was included.' : 'was left out.'}`,
            'The download tool requires HTTP or HTTPS and does not work from file://. Other site scripts and localStorage behavior may differ when pages are opened from a file:// folder or due to browser file-origin restrictions.'
        ].join('\n');
    }

    function triggerDownload(blob, filename) {
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = filename;
        link.hidden = true;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }

    function closePicker(state) {
        if (state.backdrop.hidden) {
            return;
        }
        state.backdrop.hidden = true;
        document.documentElement.style.overflow = state.previousHtmlOverflow;
        document.body.style.overflow = state.previousBodyOverflow;
        document.body.style.paddingRight = state.previousBodyPaddingRight;
        activePicker = null;
        state.returnFocus.focus();
    }

    async function openPicker(options) {
        if (activePicker) {
            activePicker.returnFocus.focus();
            return;
        }
        const backdrop = document.createElement('div');
        backdrop.id = 'hw-download-picker';
        backdrop.setAttribute('role', 'presentation');
        backdrop.innerHTML = `
            <section class="hw-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="hw-picker-title">
                <header class="hw-picker-header">
                    <h2 id="hw-picker-title">Download pages</h2>
                    <button type="button" id="hw-picker-close" aria-label="Close download picker">X</button>
                </header>
                <div class="hw-picker-body" id="hw-picker-body"></div>
                <p class="hw-picker-progress" id="hw-picker-progress" aria-live="polite"></p>
                <footer class="hw-picker-footer">
                    <label class="hw-picker-page"><input id="hw-picker-music" type="checkbox"> Include background music</label>
                    <span id="hw-picker-count">0 pages selected</span>
                    <button type="button" id="hw-picker-download" disabled>Download ZIP</button>
                    <button type="button" id="hw-picker-incomplete" hidden>Download incomplete ZIP</button>
                    <button type="button" id="hw-picker-clear">Clear selection</button>
                </footer>
                <p class="hw-picker-progress hw-picker-error" id="hw-picker-error" role="alert"></p>
            </section>`;
        document.body.appendChild(backdrop);

        const state = {
            siteRoot: options.siteRoot,
            returnFocus: options.returnFocus,
            status: options.status,
            backdrop,
            dialog: backdrop.querySelector('.hw-picker-dialog'),
            body: backdrop.querySelector('#hw-picker-body'),
            progress: backdrop.querySelector('#hw-picker-progress'),
            error: backdrop.querySelector('#hw-picker-error'),
            count: backdrop.querySelector('#hw-picker-count'),
            music: backdrop.querySelector('#hw-picker-music'),
            download: backdrop.querySelector('#hw-picker-download'),
            incomplete: backdrop.querySelector('#hw-picker-incomplete'),
            clear: backdrop.querySelector('#hw-picker-clear'),
            close: backdrop.querySelector('#hw-picker-close'),
            previousHtmlOverflow: document.documentElement.style.overflow,
            previousBodyOverflow: document.body.style.overflow,
            previousBodyPaddingRight: document.body.style.paddingRight,
            pendingArchive: null
        };
        activePicker = state;
        const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
        const currentPadding = parseFloat(getComputedStyle(document.body).paddingRight) || 0;
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';
        if (scrollbarWidth > 0) {
            document.body.style.paddingRight = `${currentPadding + scrollbarWidth}px`;
        }
        backdrop.hidden = false;

        const close = () => closePicker(state);
        state.close.addEventListener('click', close);
        backdrop.addEventListener('pointerdown', event => {
            if (event.target === backdrop) {
                close();
            }
        });
        state.dialog.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                close();
            } else if (event.key === 'Tab') {
                const focusable = [...state.dialog.querySelectorAll('button:not([disabled]):not([hidden]), input:not([disabled]):not([hidden]), summary, [tabindex="0"]')]
                    .filter(element => element.offsetParent !== null);
                if (!focusable.length) {
                    event.preventDefault();
                    state.dialog.focus();
                    return;
                }
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
            }
        });

        state.download.addEventListener('click', async () => {
            const selectedPages = [...state.body.querySelectorAll('input[type="checkbox"][data-page]')]
                .filter(checkbox => checkbox.checked)
                .map(checkbox => checkbox._page);
            if (!selectedPages.length) {
                return;
            }
            state.download.disabled = true;
            state.download.textContent = 'Preparing...';
            state.error.textContent = '';
            state.incomplete.hidden = true;
            state.progress.textContent = '';
            try {
                const result = await prepareArchive(state, selectedPages, state.music.checked);
                result.zip.file('README.txt', buildReadme(selectedPages,
                    state.music.checked && result.fetchedAssets.has('backgroundsound.wav')));
                if (result.missing.length) {
                    state.pendingArchive = result;
                    state.error.textContent = `Missing files:\n${result.missing.join('\n')}`;
                    state.incomplete.hidden = false;
                    state.progress.textContent = 'Some assets could not be fetched. Choose Download incomplete ZIP to continue.';
                } else {
                    const fileCount = Object.keys(result.zip.files).filter(name => !result.zip.files[name].dir).length;
                    const blob = await result.zip.generateAsync({ type: 'blob' });
                    triggerDownload(blob, 'history-web-pages.zip');
                    state.progress.textContent = `Done: ${selectedPages.length} pages, ${fileCount} files`;
                }
            } catch (error) {
                state.error.textContent = error.message;
                state.progress.textContent = 'The ZIP was not created.';
            } finally {
                state.download.disabled = false;
                state.download.textContent = 'Download ZIP';
            }
        });

        state.incomplete.addEventListener('click', async () => {
            if (!state.pendingArchive) {
                return;
            }
            state.incomplete.disabled = true;
            try {
                const { zip, missing } = state.pendingArchive;
                zip.file('MISSING.txt', missing.join('\n') + '\n');
                const blob = await zip.generateAsync({ type: 'blob' });
                triggerDownload(blob, 'history-web-pages-INCOMPLETE.zip');
                state.progress.textContent = 'Incomplete archive downloaded; missing files are listed in MISSING.txt.';
            } catch (error) {
                state.error.textContent = `Could not create the incomplete ZIP: ${error.message}`;
            } finally {
                state.incomplete.disabled = false;
            }
        });

        state.clear.addEventListener('click', () => {
            selected.clear();
            updateSelection();
        });

        const selected = new Set();
        const groupCheckboxes = [];

        function updateSelection() {
            const pageCheckboxes = [...state.body.querySelectorAll('input[type="checkbox"][data-page]')];
            pageCheckboxes.forEach(checkbox => {
                checkbox.checked = selected.has(checkbox.value);
            });
            groupCheckboxes.forEach(group => {
                const count = group.pages.filter(page => selected.has(page.path)).length;
                group.checkbox.checked = count === group.pages.length && count > 0;
                group.checkbox.indeterminate = count > 0 && count < group.pages.length;
            });
            state.count.textContent = `${selected.size} ${selected.size === 1 ? 'page' : 'pages'} selected`;
            state.download.disabled = selected.size === 0;
        }

        function addSelectableGroup(parent, title, pages, nested) {
            const group = addGroup(parent, title, pages, selected, updateSelection, nested);
            groupCheckboxes.push({ checkbox: group.checkbox, pages });
            return group.content;
        }

        function renderPages(pages) {
            const general = pages.filter(page => page.type === 'site');
            if (general.length) {
                const content = addSelectableGroup(state.body, 'Site pages', general, false);
                general.forEach(page => addRow(content, page, selected, updateSelection));
            }

            const stem = pages.filter(page => page.type === 'stem');
            if (stem.length) {
                const stemContent = addSelectableGroup(state.body, 'STEM Curriculum', stem, false);
                stem.forEach(page => addRow(stemContent, page, selected, updateSelection));
            }

            const continents = [...new Set(pages.map(page => page.group.continent).filter(Boolean))]
                .sort((a, b) => a.localeCompare(b));
            continents.forEach(continent => {
                const continentPages = pages.filter(page => page.group.continent === continent);
                const continentContent = addSelectableGroup(state.body, continent, continentPages, false);
                const portal = continentPages.filter(page => page.type === 'continent');
                portal.forEach(page => addRow(continentContent, page, selected, updateSelection));

                const eras = [...new Set(continentPages.map(page => page.group.era).filter(Boolean))]
                    .sort((a, b) => {
                        const order = ['Classical', 'Medieval', 'Pre/Colonial'];
                        return order.indexOf(a) - order.indexOf(b);
                    });
                eras.forEach(era => {
                    const eraPages = continentPages.filter(page => page.group.era === era);
                    const eraContent = addSelectableGroup(continentContent, era, eraPages, true);
                    eraPages.filter(page => page.type === 'era').forEach(page => addRow(eraContent, page, selected, updateSelection));
                    eraPages.filter(page => page.type === 'topic').sort((a, b) => a.title.localeCompare(b.title))
                        .forEach(page => addRow(eraContent, page, selected, updateSelection));
                });
            });
            updateSelection();
        }

        try {
            const catalogResponse = await fetch(new URL('pages.json', state.siteRoot).href);
            if (!catalogResponse.ok) {
                throw new Error(`Could not load pages.json (HTTP ${catalogResponse.status}).`);
            }
            const pages = await catalogResponse.json();
            if (!Array.isArray(pages)) {
                throw new Error('pages.json did not contain a page list.');
            }
            renderPages(pages);
        } catch (error) {
            state.error.textContent = `Unable to load the page list: ${error.message}`;
        }

        try {
            const size = await musicSize(new URL('backgroundsound.wav', state.siteRoot));
            state.music.setAttribute('aria-label', `Include background music (about ${(size / 1048576).toFixed(1)} MB)`);
            state.music.parentElement.lastChild.textContent = ` Include background music (about ${(size / 1048576).toFixed(1)} MB)`;
        } catch (error) {
            state.error.textContent = `Unable to read background music size: ${error.message}`;
        }
        state.close.focus();
    }

    window.HistoryWebDownloads = {
        open: openPicker,
        isOpen: () => !!activePicker
    };
})();
