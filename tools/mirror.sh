#!/bin/sh
# GitLab 거울에 밀어 넣기 — GitHub 이 막혔을 때도 코드가 밖에 남게 (두 번째 원격)
#   평소에는 .github/workflows/mirror.yml 이 GitHub 푸시마다 자동으로 맞춤 — 이 스크립트는 GitHub 이 막혔을 때 손으로
#   sh tools/mirror.sh            : 지금 브랜치 + main + 태그를 GitLab 에 푸시
#   sh tools/mirror.sh --all      : 모든 브랜치
#   토큰은 환경 변수 GITLAB_TOKEN (클라우드 환경 설정 · 채팅 · 코드에는 넣지 않는다) — 저장소에 남지 않도록 URL 에만 잠깐 씀
#   GitLab 프로젝트: https://gitlab.com/theonecorp-group/the-one-app  (평소 자동 거울은 GitHub Actions mirror.yml — GitLab 의 pull mirror 는 유료라 쓰지 않음)
cd "$(dirname "$0")/.." || exit 2
[ -n "$GITLAB_TOKEN" ] || { echo "GITLAB_TOKEN 이 없습니다 — 클라우드 환경 변수에 넣고 새 세션에서 다시"; exit 1; }
URL="https://oauth2:${GITLAB_TOKEN}@gitlab.com/theonecorp-group/the-one-app.git"
BR=$(git rev-parse --abbrev-ref HEAD)
if [ "$1" = "--all" ]; then git push "$URL" --all && git push "$URL" --tags
else git push "$URL" "$BR" && { git show-ref -q refs/remotes/origin/main && git push "$URL" refs/remotes/origin/main:refs/heads/main; git push "$URL" --tags; }
fi
echo "GitLab 거울 푸시 끝 — https://gitlab.com/theonecorp-group/the-one-app"
