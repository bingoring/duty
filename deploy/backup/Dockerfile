# Build Spec 3-1 R-OPS-3·4 — 매일 DB 덤프 → age 암호화 → 서버 보관 + Cloud Storage 복사
FROM alpine:3.22
RUN apk add --no-cache postgresql16-client age rclone tzdata bash coreutils
ENV TZ=Asia/Seoul RCLONE_CONFIG=/dev/null
COPY backup.sh restore.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/restore.sh
CMD ["/usr/local/bin/backup.sh", "--daemon"]
