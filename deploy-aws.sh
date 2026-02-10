#!/bin/bash
set -e

echo "🚀 OpenClaw AWS EC2 배포 스크립트"
echo "=================================="
echo ""

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. 시스템 업데이트
echo -e "${GREEN}[1/8] 시스템 업데이트 중...${NC}"
sudo apt update && sudo apt upgrade -y

# 2. Docker 설치
echo -e "${GREEN}[2/8] Docker 설치 중...${NC}"
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
    echo -e "${YELLOW}Docker가 설치되었습니다. 변경사항 적용을 위해 재로그인이 필요합니다.${NC}"
else
    echo -e "${YELLOW}Docker가 이미 설치되어 있습니다.${NC}"
fi

# 3. Docker Compose 설치
echo -e "${GREEN}[3/8] Docker Compose 설치 중...${NC}"
if ! docker compose version &> /dev/null; then
    sudo apt install -y docker-compose-plugin
else
    echo -e "${YELLOW}Docker Compose가 이미 설치되어 있습니다.${NC}"
fi

# 4. 필수 패키지 설치
echo -e "${GREEN}[4/8] 필수 패키지 설치 중...${NC}"
sudo apt install -y git curl wget nano ufw

# 5. 방화벽 설정
echo -e "${GREEN}[5/8] 방화벽 설정 중...${NC}"
sudo ufw --force enable
sudo ufw allow 22/tcp
sudo ufw allow 18789/tcp
sudo ufw allow 18790/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
echo -e "${GREEN}방화벽 규칙이 설정되었습니다.${NC}"

# 6. OpenClaw 저장소 클론
echo -e "${GREEN}[6/8] OpenClaw 저장소 클론 중...${NC}"
if [ ! -d "$HOME/openclaw" ]; then
    cd $HOME
    git clone https://github.com/Richard-JHLee/openclaw.git
    cd openclaw
else
    echo -e "${YELLOW}OpenClaw 디렉토리가 이미 존재합니다. 업데이트 중...${NC}"
    cd $HOME/openclaw
    git pull origin main
fi

# 7. 환경 변수 설정
echo -e "${GREEN}[7/8] 환경 변수 설정 중...${NC}"
if [ ! -f .env ]; then
    cat > .env << 'EOF'
# OpenClaw Configuration
OPENCLAW_CONFIG_DIR=${HOME}/.openclaw
OPENCLAW_WORKSPACE_DIR=${HOME}/.openclaw/workspace
OPENCLAW_GATEWAY_PORT=18789
OPENCLAW_BRIDGE_PORT=18790
OPENCLAW_GATEWAY_BIND=lan
OPENCLAW_IMAGE=openclaw:local

# API Keys (필요한 키를 입력하세요)
# CLAUDE_AI_SESSION_KEY=your_claude_key_here
# OPENAI_API_KEY=your_openai_key_here
# ANTHROPIC_API_KEY=your_anthropic_key_here

# Gateway Token (자동 생성됨)
# OPENCLAW_GATEWAY_TOKEN=
EOF
    echo -e "${GREEN}.env 파일이 생성되었습니다.${NC}"
    echo -e "${YELLOW}API 키를 설정하려면 'nano .env' 명령으로 편집하세요.${NC}"
else
    echo -e "${YELLOW}.env 파일이 이미 존재합니다.${NC}"
fi

# 8. Docker 이미지 빌드
echo -e "${GREEN}[8/8] Docker 이미지 빌드 중... (시간이 걸릴 수 있습니다)${NC}"
docker build -t openclaw:local -f Dockerfile .

echo ""
echo -e "${GREEN}=================================="
echo "✅ 설치가 완료되었습니다!"
echo "==================================${NC}"
echo ""
echo -e "${YELLOW}다음 단계:${NC}"
echo "1. API 키 설정: nano .env"
echo "2. 온보딩 실행: docker compose run --rm openclaw-cli onboard"
echo "3. 게이트웨이 시작: docker compose up -d openclaw-gateway"
echo "4. 대시보드 URL 확인: docker compose run --rm openclaw-cli dashboard --no-open"
echo ""
echo -e "${YELLOW}접속 URL:${NC}"
echo "http://$(curl -s ifconfig.me):18789"
echo ""
echo -e "${RED}주의: Docker 그룹 변경사항을 적용하려면 재로그인이 필요할 수 있습니다.${NC}"
echo "재로그인 후: newgrp docker"
