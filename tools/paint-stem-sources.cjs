const fs = require('fs');
const path = require('path');
const data = require('../_data/stemsourceicons.json');
const esc = value => value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
module.exports = function () {
 for (const [name, items] of Object.entries(data)) {
  const file = path.join(__dirname, '..', 'stem', name + '.html');
  let text = fs.readFileSync(file, 'utf8');
  for (const item of items) {
   const url = item.url.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
   const pattern = new RegExp('(<a href="' + url + '"[^>]*>)[\\s\\S]*?(</a>)');
   text = text.replace(pattern, '$1<img class="srcicon" src="../sourceicons/' + item.icon + '" alt=""> ' + esc(item.label) + '$2');
  }
  fs.writeFileSync(file, text);
 }
};
