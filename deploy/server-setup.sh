#!/usr/bin/env bash
# Build Spec 3-1 — VM 안에서 한 번 실행(sudo). Docker·자동 보안 업데이트·스왑 2GB·앱 디렉터리.
#   gcloud compute ssh duty-vm --tunnel-through-iap --zone asia-northeast3-a
#   curl -fsSL https://raw.githubusercontent.com/bingoring/duty/main/deploy/server-setup.sh | sudo bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y docker.io docker-compose-v2 git unattended-upgrades
systemctl enable --now docker
dpkg-reconfigure -f noninteractive unattended-upgrades
# 솔버가 순간적으로 메모리를 쓰므로 스왑을 둔다
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
# 앱은 /opt/duty, 배포 사용자(sudo 사용자)가 docker를 쓰게 한다
install -d -o "${SUDO_USER:-root}" /opt/duty
usermod -aG docker "${SUDO_USER:-root}" || true
[ -d /opt/duty/.git ] || sudo -u "${SUDO_USER:-root}" git clone https://github.com/bingoring/duty.git /opt/duty
echo "설치 완료. 다시 접속한 뒤 /opt/duty/.env.prod를 만들고 docs/operations.md 「최초 부팅」을 따르세요."
