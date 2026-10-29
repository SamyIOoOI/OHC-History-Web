import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const continentDirs = [
    ['africa', 'Africa'],
    ['asia', 'Asia'],
    ['europe', 'Europe'],
    ['northam', 'North America'],
    ['oceania', 'Oceania'],
    ['southam', 'South America']
];
const eraDirs = [
    ['classical', 'Classical'],
    ['medieval', 'Medieval'],
    ['modern', 'Pre/Colonial']
];
const rootPages = [
    'index.html',
    'content.html',
    'articles.html',
    'contactus.html',
    'africa.html',
    'asia.html',
    'europe.html',
    'northamerica.html',
    'oceania.html',
    'southamerica.html',
    'stem-curriculum.html'
];
const continentPages = new Map([
    ['africa.html', 'Africa'],
    ['asia.html', 'Asia'],
    ['europe.html', 'Europe'],
    ['northamerica.html', 'North America'],
    ['oceania.html', 'Oceania'],
    ['southamerica.html', 'South America']
]);

function htmlFiles(directory) {
    if (!fs.existsSync(directory)) {
        return [];
    }
    return fs.readdirSync(directory, { withFileTypes: true })
        .flatMap(entry => {
            const fullPath = path.join(directory, entry.name);
            return entry.isDirectory() ? htmlFiles(fullPath) :
                entry.isFile() && entry.name.toLowerCase().endsWith('.html') &&
                    !/(?:404|test|draft|backup)/i.test(entry.name) ? [fullPath] : [];
        });
}

function decodeEntities(value) {
    return value
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
        .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function textFromTag(source, tag) {
    const match = source.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    return match ? decodeEntities(match[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()) : '';
}

function pageTitle(file) {
    const source = fs.readFileSync(file, 'utf8');
    const title = textFromTag(source, 'title');
    return !title || title === 'Topic' ? textFromTag(source, 'h1') || title : title;
}

function relativePath(file) {
    return path.relative(root, file).split(path.sep).join('/');
}

const pages = [];

for (const filename of rootPages) {
    const file = path.join(root, filename);
    if (!fs.existsSync(file)) {
        throw new Error(`Expected site page is missing: ${filename}`);
    }
    const continent = continentPages.get(filename);
    pages.push({
        path: relativePath(file),
        title: pageTitle(file),
        group: {
            continent: continent || null,
            era: null
        },
        type: continent ? 'continent' : 'site'
    });
}

for (const [directory, continentName] of continentDirs) {
    const eraDirectory = path.join(root, 'erafiles', directory);
    for (const file of htmlFiles(eraDirectory)) {
        const eraKey = path.basename(file, '.html').replace(directory, '').replace(/colonial/i, 'modern');
        const era = eraDirs.find(([key]) => eraKey.toLowerCase().includes(key));
        if (!era) {
            throw new Error(`Could not classify era page: ${relativePath(file)}`);
        }
        pages.push({
            path: relativePath(file),
            title: pageTitle(file),
            group: { continent: continentName, era: era[1] },
            type: 'era'
        });
    }

    for (const [eraDirectoryName, eraName] of eraDirs) {
        const topicDirectory = path.join(root, 'subtopics', directory, eraDirectoryName);
        for (const file of htmlFiles(topicDirectory)) {
            pages.push({
                path: relativePath(file),
                title: pageTitle(file),
                group: { continent: continentName, era: eraName },
                type: 'topic'
            });
        }
    }
}

pages.sort((a, b) => a.path.localeCompare(b.path));
fs.writeFileSync(path.join(root, 'pages.json'), `${JSON.stringify(pages, null, 2)}\n`, 'utf8');
console.log(`Wrote ${pages.length} pages to pages.json`);
