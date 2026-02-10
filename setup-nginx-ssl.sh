#!/bin/bash
set -e

echo "🔒 Nginx + SSL 설정 스크립트"
echo "============================"
echo ""

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 도메인 입력 받기
read -p "도메인 이름을 입력하세요 (예: openclaw.example.com): " DOMAIN
read -p "이메일 주소를 입력하세요 (Let's Encrypt 알림용): " EMAIL

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
    echo -e "${RED}도메인과 이메일을 모두 입력해야 합니다.${NC}"
    exit 1
fi

# 1. Nginx 설치
echo -e "${GREEN}[1/4] Nginx 설치 중...${NC}"
sudo apt update
sudo apt install -y nginx

# 2. Nginx 설정 파일 생성
echo -e "${GREEN}[2/4] Nginx 설정 파일 생성 중...${NC}"
sudo tee /etc/nginx/sites-available/openclaw > /dev/null << EOF
server {
    listen 80;
    server_name ${DOMAIN};

    # Let's Encrypt 인증을 위한 설정
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # 나머지 요청은 OpenClaw로 프록시
    location / {
        proxy_pass http://localhost:18789;
        proxy_http_version 1.1;
        
        # WebSocket 지원
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        
        # 헤더 설정
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # 타임아웃 설정
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
EOF

# 3. Nginx 설정 활성화
echo -e "${GREEN}[3/4] Nginx 설정 활성화 중...${NC}"
sudo ln -sf /etc/nginx/sites-available/openclaw /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx

# 4. Certbot 설치 및 SSL 인증서 발급
echo -e "${GREEN}[4/4] SSL 인증서 발급 중...${NC}"
sudo apt install -y certbot python3-certbot-nginx

# SSL 인증서 발급
sudo certbot --nginx -d ${DOMAIN} --non-interactive --agree-tos -m ${EMAIL} --redirect

echo ""
echo -e "${GREEN}============================"
echo "✅ SSL 설정이 완료되었습니다!"
echo "============================${NC}"
echo ""
echo -e "${GREEN}HTTPS 접속 URL:${NC}"
echo "https://${DOMAIN}"
echo ""
echo -e "${YELLOW}SSL 인증서는 자동으로 갱신됩니다.${NC}"
echo "갱신 테스트: sudo certbot renew --dry-run"
