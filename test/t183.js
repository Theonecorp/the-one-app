/* v0.8.183 시험 — 🪞 GitLab 거울: GitHub 에 올라가는 모든 브랜치 · 태그 · 삭제를 GitLab 에도 (2026-11-11 관리자: "GitLab 은 항상 거울처럼")
 *   ① 모든 브랜치 · 태그 푸시 + 삭제 + 손으로 돌리기에 반응  ② 전체 기록(fetch-depth 0)으로 강제 푸시 — GitHub 이 원본
 *   ③ 토큰은 비밀값(secrets.GITLAB_TOKEN)에서만 · 코드에 토큰 없음 · 없으면 경고만 하고 건너뜀(빨간불 아님)
 *   ④ 지운 브랜치 이름은 env 로만 받아 셸에 바로 끼우지 않음  ⑤ CLAUDE.md 에 자동 거울 안내 */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..'), errs = [];
const y = fs.readFileSync(path.join(root, '.github/workflows/mirror.yml'), 'utf8');
const on = y.split(/\njobs:/)[0];
/* ① */
if (!/push:\s*\n\s*branches: \['\*\*'\]\s*\n\s*tags: \['\*\*'\]/.test(on)) errs.push('① runs on a push to any branch and any tag');
if (!/\n\s*delete:/.test(on) || !/workflow_dispatch/.test(on)) errs.push('① also runs when a branch/tag is deleted and by hand');
/* ② */
if (!/fetch-depth: 0/.test(y)) errs.push('② full history (GitLab refuses shallow pushes)');
if (!/git push --force "https:\/\/oauth2:\$\{GITLAB_TOKEN\}@\$\{GITLAB_REPO\}" \$REFS/.test(y) || !/refs\/remotes\/origin/.test(y) || !/--tags/.test(y)) errs.push('② force-pushes every GitHub branch and the tags');
if (!/gitlab\.com\/theonecorp-group\/the-one-app\.git/.test(y)) errs.push('② goes to the GitLab mirror project');
/* ③ */
if (!/GITLAB_TOKEN: \$\{\{ secrets\.GITLAB_TOKEN \}\}/.test(y)) errs.push('③ token only from the repository secret');
if (/glpat-|oauth2:[A-Za-z0-9_-]{12,}@/.test(y)) errs.push('③ no token written in the file');
if (!/-z "\$GITLAB_TOKEN"/.test(y) || !/::warning::/.test(y) || /exit 1/.test(y.split('id: tok')[1].split('- uses')[0])) errs.push('③ no secret → warning and skip, not a red run');
if (!/concurrency:[\s\S]*cancel-in-progress: false/.test(y)) errs.push('③ one mirror run at a time, none cancelled');
/* ④ */
const del = y.split('delete the same branch')[1] || '';
if (!/NAME: \$\{\{ github\.event\.ref \}\}/.test(del) || /run:[\s\S]*\$\{\{ github\.event\.ref/.test(del)) errs.push('④ deleted ref name passed through env, not pasted into the shell');
if (!/--delete "\$REF"/.test(del)) errs.push('④ deletes the same branch/tag on GitLab');
/* ⑤ */
const md = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8');
if (!/mirror\.yml/.test(md)) errs.push('⑤ CLAUDE.md mentions the automatic mirror');
console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
