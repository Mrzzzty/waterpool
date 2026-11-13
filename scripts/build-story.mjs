import { build } from 'esbuild'
import { readFile, writeFile } from 'node:fs/promises'

// Keep the normal entry small. The single-file package is a separate artifact,
// so HTTP / Electron visits don't parse tens of MB of unused base64 assets.
const result = await build({
  entryPoints: ['src/story/main.tsx'], bundle: true, write: false, minify: true,
  format: 'iife', platform: 'browser', target: 'es2020', jsx: 'automatic',
  loader: { '.glb': 'dataurl', '.jpg': 'dataurl', '.png': 'dataurl', '.exr': 'dataurl', '.bin': 'dataurl', '.wav': 'dataurl' },
  define: { 'process.env.NODE_ENV': '"production"' }, legalComments: 'inline',
})
const shell = await readFile('story.html', 'utf8')
const css = await readFile('src/story/story.css', 'utf8')
const webEntry=(await readFile('dist/index.html','utf8')).match(/<script[^>]+src="([^"]+)"/)[1]
const webStyles=(await readFile('dist/index.html','utf8')).match(/<link[^>]+href="([^"<>]+\.css)"/g)??[]
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')
await writeFile('dist/story-offline.html', shell
  .replace('<link rel="stylesheet" href="/src/story/story.css">', () => '<style>'+css+'</style>')
  .replace('<script type="module" src="/src/main.tsx"></script>', () => '<script>'+js+'</script>'))
await writeFile('dist/story.html',shell
  .replace('<link rel="stylesheet" href="/src/story/story.css">',()=>webStyles.map(tag=>tag+'>').join(''))
  .replace('<script type="module" src="/src/main.tsx"></script>',()=>'<script type="module">if(location.protocol==="file:"){location.replace("story-offline.html"+location.search+location.hash)}else{import('+JSON.stringify(webEntry)+')}</script>'))
console.log('Web entry: dist/story.html; single-file package: dist/story-offline.html')

