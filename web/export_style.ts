import path from 'node:path'
import fs from 'node:fs'
import generateStyle from './src/style'

const styles_path = path.join('./public', 'styles')

fs.mkdirSync(styles_path, { recursive: true })

fs.writeFileSync(
    path.join(styles_path, 'style-basic.json'),
    JSON.stringify(generateStyle('basic', 'https://map.emfcamp.org', '/'))
)

fs.writeFileSync(
    path.join(styles_path, 'style-basic-dark.json'),
    JSON.stringify(generateStyle('basic', 'https://map.emfcamp.org', '/', 'dark'))
)
