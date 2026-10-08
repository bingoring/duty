# 운영 문서 — 설치·업데이트·백업·복구

> Build Spec 3-1(waypoint `projects/duty/03-operations/deployment/`). GCP 서울 VM 한 대에 Docker Compose 한 벌로 운영한다.
> 비밀값(DB 비밀번호·백업 개인키·임시 비밀번호·명단 CSV)은 저장소·채팅·이미지·로그에 남기지 않는다.

## 구성

| 서비스    | 역할                                                                   | 공개          |
| --------- | ---------------------------------------------------------------------- | ------------- |
| `caddy`   | HTTPS(Let's Encrypt 자동 발급·갱신), HTTP→HTTPS, HSTS, 역방향 프록시   | 80·443 (유일) |
| `web`     | Next.js 앱. `/api/health`로 상태 확인                                  | 없음          |
| `solver`  | CP-SAT 듀티 생성                                                       | 없음          |
| `db`      | PostgreSQL 16 (볼륨 `db-data`)                                         | 없음          |
| `backup`  | 매일 03:00 암호화 덤프 → `/opt/duty/backups` 14일 + Cloud Storage 90일 | 없음          |
| `migrate` | 배포마다 한 번 마이그레이션, 관리자·명단 가져오기 도구                 | 없음          |

## 1. GCP 준비 (한 번)

1. 결제 계정 ID 확인: `gcloud billing accounts list`
2. 자원 생성(비용 발생) — 먼저 `DRY_RUN=1`로 명령을 확인한다.

   ```bash
   PROJECT_ID=duty-<무작위> BILLING_ACCOUNT=<결제 계정> BUCKET=<PROJECT_ID>-backups ./deploy/gcp/provision.sh
   ```

   마지막 줄에 나오는 **고정 IP**를 적어 둔다.

3. 도메인 등록 업체에서 DNS **A 레코드**를 고정 IP로 지정한다(예: `duty.example.com`). 반영 확인: `dig +short duty.example.com`

## 2. 백업 키 (한 번, 사용자 PC에서)

```bash
age-keygen -o duty-backup.key     # 첫 줄 "public key: age1..." 이 공개키
```

- **공개키**(`age1...`)만 서버 `.env.prod`의 `BACKUP_AGE_RECIPIENT`에 넣는다.
- **개인키 파일**(`duty-backup.key`)은 서버에 올리지 않는다. PC와 오프라인 한 곳(USB·비밀번호 관리자)에 보관한다. 잃으면 백업을 풀 수 없다.

## 3. 서버 설정·최초 부팅 (한 번)

```bash
gcloud compute ssh duty-vm --tunnel-through-iap --zone asia-northeast3-a --project <PROJECT_ID>
curl -fsSL https://raw.githubusercontent.com/bingoring/duty/main/deploy/server-setup.sh | sudo bash
exit   # docker 그룹 반영을 위해 다시 접속
```

다시 접속한 뒤:

```bash
cd /opt/duty
cp .env.prod.example .env.prod && chmod 600 .env.prod
nano .env.prod     # DOMAIN, POSTGRES_PASSWORD(openssl rand -base64 32), ADMIN_EMPLOYEE_NO·ADMIN_NAME, BACKUP_AGE_RECIPIENT, BACKUP_REMOTE의 버킷 이름
docker compose -f compose.prod.yaml --env-file .env.prod up -d --build
docker compose -f compose.prod.yaml --env-file .env.prod ps     # 모두 Up(healthy)
curl -fsS https://<DOMAIN>/api/health && echo OK
```

첫 관리자(수간호사) — 임시 비밀번호는 **이 화면에 한 번만** 나온다. `--rm`이라 컨테이너 로그로 남지 않는다.

```bash
docker compose -f compose.prod.yaml --env-file .env.prod run --rm migrate pnpm db:bootstrap
```

간호사 명단 — 실명 CSV(형식: `apps/web/src/server/seed/roster.example.csv`)를 PC에서 올리고, 가져온 뒤 **바로 지운다**.

```bash
# PC에서
gcloud compute scp roster.csv duty-vm:/tmp/roster.csv --tunnel-through-iap --zone asia-northeast3-a --project <PROJECT_ID>
# 서버에서
docker compose -f compose.prod.yaml --env-file .env.prod run --rm -v /tmp/roster.csv:/data/roster.csv:ro migrate pnpm db:import-roster /data/roster.csv
shred -u /tmp/roster.csv
```

명단 가져오기가 출력한 간호사별 임시 비밀번호는 각자에게 직접 전달하고 어디에도 저장하지 않는다(첫 로그인 때 변경이 강제된다).

**운영 확인:** 관리자 로그인 → 비밀번호 변경 → 간호사 관리에 명단 → 간호사 한 명 로그인 → 백업 1회(아래 4) → 버킷에 파일 → 복구 리허설(아래 6).

## 4. 백업 확인

- 자동: 매일 03:00(서울). 로그: `docker compose -f compose.prod.yaml --env-file .env.prod logs backup | tail` → `backup_ok`·`backup_uploaded` (실패는 `backup_failed`)
- 지금 한 번: `docker compose -f compose.prod.yaml --env-file .env.prod exec backup backup.sh`
- 서버 사본: `/opt/duty/backups/duty-YYYYMMDD-HHMM.dump.age` (14일), 버킷 사본: `gs://<BUCKET>/duty/` (90일 뒤 자동 삭제). 서버 서비스 계정은 버킷에서 지울 수 없다.

## 5. 업데이트 · 되돌리기

```bash
cd /opt/duty
docker compose -f compose.prod.yaml --env-file .env.prod exec backup backup.sh   # 업데이트 전 백업
git pull
docker compose -f compose.prod.yaml --env-file .env.prod up -d --build           # migrate가 먼저 돈다
curl -fsS https://<DOMAIN>/api/health && echo OK
```

되돌리기: `git log --oneline`에서 이전 커밋을 골라 `git checkout <커밋>` 후 같은 `up -d --build`. 그 사이 **마이그레이션이 바뀌었으면** DB도 업데이트 전 백업으로 복구한다(아래 6).

## 6. 복구

개인키가 있는 곳(사용자 PC)에서 한다. **먼저 별도 DB에 리허설**하고, 운영 DB 복구는 앱을 멈춘 뒤에 한다.

```bash
# 1) 백업 파일 가져오기 (버킷 또는 서버)
gcloud storage cp gs://<BUCKET>/duty/duty-YYYYMMDD-HHMM.dump.age . --project <PROJECT_ID>
# 2) 서버로 개인키와 함께 잠시 올리지 말고, PC에서 복호화한 덤프만 올린다
age -d -i duty-backup.key duty-YYYYMMDD-HHMM.dump.age > restore.dump
gcloud compute scp restore.dump duty-vm:/tmp/restore.dump --tunnel-through-iap --zone asia-northeast3-a --project <PROJECT_ID>
# 3) 서버에서 (리허설: 별도 DB)
docker compose -f compose.prod.yaml --env-file .env.prod exec -T db createdb -U duty duty_restore
docker compose -f compose.prod.yaml --env-file .env.prod exec -T db pg_restore -U duty --no-owner -d duty_restore < /tmp/restore.dump
#    운영 복구: web을 멈추고(stop web) -d duty --clean --if-exists 로 같은 명령 → start web
shred -u /tmp/restore.dump
```

## 7. 장애 대응

| 증상                                  | 확인                        | 조치                                                             |
| ------------------------------------- | --------------------------- | ---------------------------------------------------------------- |
| 접속 안 됨                            | `ps`, `logs caddy`          | 인증서 실패면 DNS A 레코드·방화벽 80/443 확인                    |
| 502                                   | `logs web`, `/api/health`   | 503이면 DB(`logs db`), `restart web`                             |
| 생성이 "연결할 수 없음"               | `logs web                   | grep solver_unreachable`, `logs solver`                          | `restart solver`. 메모리 부족이면 `SOLVER_WORKERS`·VM 크기 |
| 디스크 부족                           | `df -h`, `docker system df` | `docker image prune -f`(사용 중 이미지는 남는다), 백업 보관 일수 |
| 로그인 "이 네트워크에서 … 막았습니다" | IP 제한(10분 20회 실패)     | 10분 기다리거나 `restart web`(제한 초기화)                       |

모든 명령은 `/opt/duty`에서 `docker compose -f compose.prod.yaml --env-file .env.prod <명령>` 형태다.
