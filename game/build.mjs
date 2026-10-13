// Assembles public/index.html from the game sources in src/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = f => fs.readFileSync(path.join(here, 'src', f), 'utf8');

const page = src('a_page.html');
const game = src('b_core.js').replace('/*__ADVENTURES__*/', src('adv_bell.js')) + src('c_render.js').replace('__HANDS__', src('hands.json').trim()).replace('__ART__', src('art.json').trim()) + src('d_audio.js') + src('e_game.js').replace('/*__UI__*/', src('f_ui.js'));
const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<script src="https://telegram.org/js/telegram-web-app.js"></script>
${page.replace('</style>', '</style>\n<style>\n' + src('platform.css') + '</style>').trim()}
<script>
${src('platform.js')}
</script>
<script>
${game}
</script>
</html>
`;
fs.mkdirSync(path.join(here, 'public'), { recursive: true });
fs.writeFileSync(path.join(here, 'public', 'index.html'), html);
console.log(`public/index.html: ${(html.length / 1024).toFixed(0)} KB`);
// `node build.mjs --artifact out.html`: the same game as a claude.ai page, where the AI master runs on the player's own Claude account.
const ai = process.argv.indexOf('--artifact');
if (ai > 0){
  const out = process.argv[ai + 1];
  const page2 = page.replace('</style>', '</style>\n<style>\n' + src('platform.css') + '</style>').trim();
  fs.writeFileSync(out, page2 + '\n<script>\n' + game + '\n</script>\n');
  console.log(`${out}: artifact build`);
}
