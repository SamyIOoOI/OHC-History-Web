const fs = require('fs');
const path = require('path');
const data = require('../_data/stemsourceicons.json');
const esc = value => value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
module.exports = function () {
 for (const [name, items] of Object.entries(data)) {
  const file = path.join(__dirname, '..', 'stem', name + '.html');
  let text = fs.readFileSync(file, 'utf8');
  const seen = new Set();
  const links = items.map(item => {
   const host = new URL(item.url).hostname;
   const publisher = host.endsWith('britannica.com') ? 'Britannica' : host.endsWith('worldhistory.org') ? 'World History Encyclopedia' : host === 'www.loc.gov' ? 'Library of Congress' : host.endsWith('wikipedia.org') ? 'Wikipedia' : null;
   const icon = publisher === 'Britannica' ? 'britannica.com.png' : publisher === 'World History Encyclopedia' ? 'worldhistory.org.png' : publisher === 'Library of Congress' ? 'loc.gov.png' : '';
   if (!publisher || !item.label.startsWith(publisher + ': ') || item.icon !== icon || seen.has(item.url)) throw new Error('Invalid source: ' + name + ' ' + item.url);
   if (icon && !fs.existsSync(path.join(__dirname, '..', 'sourceicons', icon))) throw new Error('Missing icon: ' + icon);
   seen.add(item.url);
   return '            <a href="' + esc(item.url) + '" target="_blank" rel="noopener noreferrer">' + (icon ? '<img class="srcicon" src="../sourceicons/' + icon + '" alt=""> ' : '') + esc(item.label) + '</a>';
  }).join('\n');
  const marker = '<h1 style="font-size:large;">To read more about this topic:</h1>';
  const start = text.indexOf(marker);
  const end = text.indexOf('</div>', start);
  if (start < 0 || end < 0) throw new Error('Missing source section: ' + name);
  text = text.slice(0, start) + marker + '\n' + links + '\n        ' + text.slice(end);
  fs.writeFileSync(file, text);
 }
};
