import browserslist from 'browserslist'
import fs from 'fs'
import {browserslistToTargets, bundle} from 'lightningcss'

const outputPath = './dist/styles.css'
const targets = browserslistToTargets(browserslist('>= 0.25%'))

fs.mkdirSync('./dist', {recursive: true})

const {code} = bundle({
  filename: './styles/styles.css',
  minify: true,
  targets,
  sourceMap: false,
})

console.log('CSS bundle size:', code.length / 1e3, 'kb')
fs.writeFileSync(outputPath, code)
console.log(`Wrote ${outputPath}`)
