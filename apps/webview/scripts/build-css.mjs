import browserslist from 'browserslist'
import fs from 'fs'
import {browserslistToTargets, bundle} from 'lightningcss'

const path = './dist/assets/styles.css'
let targets = browserslistToTargets(browserslist('>= 0.25%'))

fs.mkdirSync('./dist/assets', {recursive: true})

let {code} = bundle({
  filename: './src/styles/styles.css',
  minify: true,
  targets,
  sourceMap: false,
})

console.log('Css bundle size:', code.length / 1e3, 'kb')
fs.writeFileSync(path, code)
