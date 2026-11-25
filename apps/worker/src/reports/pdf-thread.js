// The PDF render thread (report-pipeline design.md decision 5). Plain CommonJS so the same
// file runs under ts-node-dev, Jest and the built dist (the build copies it). Receives
// { definition, fontsDir, fonts } and posts back { bytes } or { error }.
'use strict';
const path = require('node:path');
const { parentPort, workerData } = require('node:worker_threads');
const pdfmake = require('pdfmake');

const { definition, fontsDir, fonts } = workerData;
const file = (name) => path.join(fontsDir, name);
pdfmake.setFonts({
  NotoSansJP: { normal: file(fonts.body), bold: file(fonts.bodyBold), italics: file(fonts.body), bolditalics: file(fonts.bodyBold) },
  NotoSansMono: { normal: file(fonts.mono), bold: file(fonts.mono), italics: file(fonts.mono), bolditalics: file(fonts.mono) },
});
// ADR 0026 decision 4: never fetch remote URLs; read only the bundled fonts.
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy((p) => path.resolve(p).startsWith(path.resolve(fontsDir) + path.sep));

// A document definition crosses the thread boundary as plain data, so the page-number
// footer (a function in pdfmake) is added here when the definition asks for it.
const { pageNumbers, ...doc } = definition;
if (pageNumbers) {
  doc.footer = (page, pages) => ({ text: `${page} / ${pages}`, alignment: 'center', color: '#64748b', fontSize: 8, margin: [0, 10, 0, 0] });
}

pdfmake
  .createPdf(doc)
  .getBuffer()
  .then((bytes) => parentPort.postMessage({ bytes }))
  .catch((error) => parentPort.postMessage({ error: String(error && error.message ? error.message : error) }));
