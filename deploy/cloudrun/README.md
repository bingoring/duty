# Cloud Run + Firebase Hosting 운영 (3-13)

요청이 없으면 0대로 줄어드는 구성이다. 설계: `docs/waypoint/03-operations/13-serverless.md`.

```
offplz.com ─ Firebase Hosting(인증서·CDN, 모든 경로를 rewrite)
              └─ Cloud Run duty-web (서울, 0~2대) ─ Cloud SQL duty-db (소켓 /cloudsql/…)
                   ├─ Cloud Run duty-solver (비공개, ID 토큰으로 호출)
                   └─ Cloud Tasks duty-generate → duty-web /api/generate/run (x-duty-task-key)
```

- 자원 만들기: `deploy/gcp/serverless.sh` (기본은 출력만, `--apply`로 실행).
- 배포: `main` 머지 뒤 CI의 `deploy-cloudrun` 잡. 운영 절차는 [docs/operations.md](../../docs/operations.md).
- `public/`은 비워 둔다. 모든 요청이 `duty-web`으로 간다(`firebase.json`).
- Firebase Hosting은 요청 쿠키 중 `__session`만 전달한다. 세션 쿠키 이름이 `__session`인 까닭이다.
- Hosting CDN 캐시는 Hosting을 배포할 때만 비워진다. 그래서 CI는 매 배포마다 `firebase deploy --only hosting`을 돈다.
