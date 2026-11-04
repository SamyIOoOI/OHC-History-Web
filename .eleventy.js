const DEFSEP = "\n            ";
function blocks(pd, prefix, fmt) {
  const out = [];
  for (let i = 1; i <= 6; i++) {
    const v = pd[prefix + i];
    if (v === undefined) break;
    out.push(fmt(v, i));
  }
  const seps = pd[prefix === "para" ? "psep" : "ssep"];
  let s = out[0] || "";
  for (let i = 1; i < out.length; i++) s += (seps && seps[i - 1] !== undefined ? seps[i - 1] : DEFSEP) + out[i];
  return s;
}
module.exports = function (eleventyConfig) {
  eleventyConfig.setNunjucksEnvironmentOptions({ autoescape: false });
  eleventyConfig.addFilter("parasBlock", (pd) =>
    blocks(pd, "para", (v) => `<p style="font-size: large;">${v}</p>`));
  eleventyConfig.addFilter("sourcesBlock", (pd) => {
    let n = 0;
    for (let i = 1; i <= 6; i++) { if (pd["source" + i] !== undefined) n = i; else break; }
    return blocks(pd, "source", (v, i) => {
      const label = pd["source" + i + "label"] || ("Source #" + i);
      const icon = pd["source" + i + "icon"]
        ? `<img class="srcicon" src="../../../sourceicons/${pd["source" + i + "icon"]}" alt=""> ` : "";
      return `<a href="${v}" target="_blank"${i === n ? ' style="margin-bottom:10px;"' : ""}>${icon}${label}</a>`;
    });
  });

  ["carthage.css","theme.css","settings.js","download.js",
   "index.html","africa.html","asia.html","europe.html","northamerica.html","southamerica.html","oceania.html",
   "articles.html","contactus.html","content.html","development.html","stem-curriculum.html",
   "book.json","pages.json","search-titles.json","stats.json","sitemap.xml","robots.txt","llms.txt",
   "LICENSE","ATTRIBUTION.csv","_headers",".assetsignore",
   "*.png","*.webp","*.wav","*.svg","*.ico","*.txt",
   "favicons","fonts","vendor","sourceicons","nixie","stem","warriorwheel",
   "EraPortals","ImageStorage","erafiles","pagefind",
   "subtopics/**/*.jpg","subtopics/**/*.png"
  ].forEach(p => eleventyConfig.addPassthroughCopy(p));
  return { dir: { input: ".", output: "_site", includes: "_includes", data: "_data" },
           htmlTemplateEngine: "njk", templateFormats: ["njk"], passthroughFileCopy: true };
};
