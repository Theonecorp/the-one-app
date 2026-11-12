/* v0.8.193 시험 — 🪞 GitLab 거울: SSH 배포 키(GITLAB_SSH_KEY, 만료 없음)로도 올림 · 토큰(GITLAB_TOKEN)은 예비 · gitlab.com 호스트 키 지문 확인 (2026-11-12 관리자: "토큰은 체험판 · 만료 → 배포 키로")
 *   ① 두 비밀값 중 하나만 있어도 거울이 돎 · 둘 다 없으면 경고만 (빨갛게 되지 않음)
 *   ② SSH 키가 있으면 git@gitlab.com 으로 · 호스트 키 지문이 GitLab 공개 값(SHA256:eUXGGm1…)과 다르면 멈춤
 *   ③ 푸시 · 지우기가 같은 주소(GL_URL)를 씀 — 토큰이 명령 줄에 직접 들어가지 않음 */
const fs = require('fs'), path = require('path'), yaml = (() => { try { return require('yaml'); } catch (e) { return null; } })();
const s = fs.readFileSync(path.resolve(__dirname, '..', '.github/workflows/mirror.yml'), 'utf8'), errs = [], log = (...a) => console.log(...a);
/* ① */
if (!/GITLAB_SSH_KEY: \$\{\{ secrets\.GITLAB_SSH_KEY \}\}/.test(s) || !/GITLAB_TOKEN: \$\{\{ secrets\.GITLAB_TOKEN \}\}/.test(s)) errs.push('① both secrets are read');
if (!/\[ -z "\$GITLAB_TOKEN" \] && \[ -z "\$GITLAB_SSH_KEY" \]/.test(s) || !/::warning::/.test(s)) errs.push('① skip with a warning only when both are missing');
/* ② */
if (!/GL_URL=git@gitlab\.com:theonecorp-group\/the-one-app\.git/.test(s)) errs.push('② SSH url');
if (!/SHA256:eUXGGm1YGsMAS7vkcx6JOJdOGHPem5gQp4taiCfCLB8/.test(s) || !/StrictHostKeyChecking=yes/.test(s)) errs.push('② pinned gitlab.com host key');
/* ③ */
const pushes = s.match(/git push [^\n]*/g) || []; log('pushes:', pushes.length);
if (pushes.length !== 3 || pushes.some(p => !/"\$GL_URL"/.test(p) || /oauth2/.test(p))) errs.push('③ every push uses GL_URL');
console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
