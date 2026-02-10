# AWS EC2 배포 가이드

OpenClaw를 AWS EC2에 배포하는 완전한 가이드입니다.

## 📋 사전 요구사항

- AWS 계정
- SSH 키 페어
- (선택사항) 도메인 이름

## 🚀 1단계: EC2 인스턴스 생성

### 1.1 AWS Console에서 EC2 인스턴스 시작

1. **AWS Management Console** 접속
2. **EC2 서비스** 선택
3. **인스턴스 시작** 클릭

### 1.2 인스턴스 설정

#### AMI 선택
- **Ubuntu Server 22.04 LTS** (64-bit x86)

#### 인스턴스 타입
- **최소**: `t3.medium` (2 vCPU, 4GB RAM)
- **권장**: `t3.large` (2 vCPU, 8GB RAM)
- **프로덕션**: `t3.xlarge` (4 vCPU, 16GB RAM)

#### 키 페어
- 기존 키 페어 선택 또는 새로 생성
- `.pem` 파일 안전하게 보관

#### 네트워크 설정
보안 그룹에서 다음 포트 허용:

| 포트 | 프로토콜 | 소스 | 설명 |
|------|---------|------|------|
| 22 | TCP | My IP | SSH 접속 |
| 80 | TCP | 0.0.0.0/0 | HTTP (SSL 리다이렉트용) |
| 443 | TCP | 0.0.0.0/0 | HTTPS |
| 18789 | TCP | 0.0.0.0/0 | OpenClaw Gateway |
| 18790 | TCP | 0.0.0.0/0 | OpenClaw Bridge (선택) |

#### 스토리지
- **최소**: 30 GB gp3
- **권장**: 50 GB gp3

### 1.3 인스턴스 시작

**인스턴스 시작** 버튼 클릭 후 인스턴스가 실행될 때까지 대기

## 🔧 2단계: 서버 접속 및 설정

### 2.1 SSH 접속

```bash
# 키 파일 권한 설정 (최초 1회)
chmod 400 your-key.pem

# EC2 인스턴스 접속
ssh -i your-key.pem ubuntu@YOUR_EC2_PUBLIC_IP
```

### 2.2 자동 설치 스크립트 실행

```bash
# 저장소 클론
git clone https://github.com/Richard-JHLee/openclaw.git
cd openclaw

# 실행 권한 부여
chmod +x deploy-aws.sh

# 배포 스크립트 실행
./deploy-aws.sh
```

스크립트가 자동으로 다음을 수행합니다:
- ✅ 시스템 업데이트
- ✅ Docker 및 Docker Compose 설치
- ✅ 방화벽 설정
- ✅ OpenClaw 저장소 클론
- ✅ 환경 변수 파일 생성
- ✅ Docker 이미지 빌드

### 2.3 API 키 설정

```bash
nano .env
```

다음 API 키를 설정하세요:

```bash
# Anthropic Claude
ANTHROPIC_API_KEY=your_anthropic_key_here

# OpenAI
OPENAI_API_KEY=your_openai_key_here

# 또는 Claude 세션 키
CLAUDE_AI_SESSION_KEY=your_claude_session_key_here
```

저장: `Ctrl + O`, `Enter`, 종료: `Ctrl + X`

## 🎯 3단계: OpenClaw 시작

### 3.1 온보딩 실행

```bash
docker compose run --rm openclaw-cli onboard
```

대화형 마법사가 시작됩니다:
1. 모델 제공자 선택 (Anthropic/OpenAI)
2. API 키 확인
3. 기본 설정 구성

### 3.2 게이트웨이 시작

```bash
docker compose up -d openclaw-gateway
```

### 3.3 상태 확인

```bash
# 컨테이너 상태 확인
docker compose ps

# 로그 확인
docker compose logs -f openclaw-gateway

# 대시보드 URL 가져오기
docker compose run --rm openclaw-cli dashboard --no-open
```

### 3.4 접속 테스트

브라우저에서 다음 URL 접속:
```
http://YOUR_EC2_PUBLIC_IP:18789
```

## 🔒 4단계: SSL 설정 (선택사항, 권장)

도메인이 있는 경우 HTTPS를 설정하세요.

### 4.1 도메인 DNS 설정

도메인 관리 페이지에서 A 레코드 추가:
- **호스트**: `@` 또는 `openclaw`
- **타입**: `A`
- **값**: EC2 퍼블릭 IP
- **TTL**: 300

### 4.2 SSL 설정 스크립트 실행

```bash
cd ~/openclaw
chmod +x setup-nginx-ssl.sh
./setup-nginx-ssl.sh
```

스크립트가 요청하는 정보 입력:
- 도메인 이름 (예: openclaw.example.com)
- 이메일 주소 (Let's Encrypt 알림용)

### 4.3 HTTPS 접속

```
https://your-domain.com
```

## 📊 5단계: 모니터링 및 관리

### 로그 확인

```bash
# 실시간 로그
docker compose logs -f openclaw-gateway

# 최근 100줄
docker compose logs --tail=100 openclaw-gateway
```

### 컨테이너 관리

```bash
# 재시작
docker compose restart openclaw-gateway

# 중지
docker compose down

# 시작
docker compose up -d openclaw-gateway

# 상태 확인
docker compose ps
```

### 업데이트

```bash
cd ~/openclaw
git pull origin main
docker compose down
docker build -t openclaw:local -f Dockerfile .
docker compose up -d openclaw-gateway
```

### 디스크 정리

```bash
# 사용하지 않는 Docker 이미지 정리
docker system prune -a

# 로그 정리
docker compose logs --tail=0 openclaw-gateway
```

## 🔧 문제 해결

### 포트 18789에 접속할 수 없음

1. **보안 그룹 확인**
   ```bash
   # AWS Console에서 EC2 보안 그룹 확인
   # 포트 18789가 0.0.0.0/0에서 허용되어 있는지 확인
   ```

2. **방화벽 확인**
   ```bash
   sudo ufw status
   sudo ufw allow 18789/tcp
   ```

3. **컨테이너 상태 확인**
   ```bash
   docker compose ps
   docker compose logs openclaw-gateway
   ```

### Docker 권한 오류

```bash
# Docker 그룹에 사용자 추가
sudo usermod -aG docker $USER

# 재로그인 또는
newgrp docker
```

### 메모리 부족

```bash
# 스왑 파일 생성 (2GB)
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# 영구 설정
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### SSL 인증서 갱신

```bash
# 수동 갱신
sudo certbot renew

# 갱신 테스트
sudo certbot renew --dry-run
```

## 💰 비용 최적화

### 1. 인스턴스 타입 조정
- 사용량이 적으면 `t3.small`로 다운그레이드
- 사용량이 많으면 `t3.large`로 업그레이드

### 2. 예약 인스턴스
- 1년 또는 3년 예약으로 최대 72% 절감

### 3. 스팟 인스턴스
- 개발/테스트 환경에서 최대 90% 절감

### 4. 자동 시작/중지
- 사용하지 않는 시간에 인스턴스 중지
- CloudWatch Events + Lambda로 자동화

## 🔐 보안 권장사항

### 1. SSH 키 관리
```bash
# SSH 키 기반 인증만 허용
sudo nano /etc/ssh/sshd_config
# PasswordAuthentication no
sudo systemctl restart sshd
```

### 2. 자동 보안 업데이트
```bash
sudo apt install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

### 3. Fail2Ban 설치
```bash
sudo apt install fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### 4. 정기적인 백업
```bash
# 설정 백업
tar -czf openclaw-backup-$(date +%Y%m%d).tar.gz ~/.openclaw

# S3로 백업 (선택사항)
aws s3 cp openclaw-backup-*.tar.gz s3://your-backup-bucket/
```

## 📞 지원

문제가 발생하면:
1. [GitHub Issues](https://github.com/Richard-JHLee/openclaw/issues)
2. [원본 프로젝트 문서](https://docs.openclaw.ai)

## 📝 체크리스트

배포 완료 확인:

- [ ] EC2 인스턴스 생성 및 실행
- [ ] 보안 그룹 설정 (포트 22, 80, 443, 18789, 18790)
- [ ] SSH 접속 성공
- [ ] Docker 및 Docker Compose 설치
- [ ] OpenClaw 저장소 클론
- [ ] API 키 설정
- [ ] 온보딩 완료
- [ ] 게이트웨이 시작
- [ ] HTTP 접속 테스트 성공
- [ ] (선택) 도메인 DNS 설정
- [ ] (선택) SSL 인증서 설치
- [ ] (선택) HTTPS 접속 테스트 성공

축하합니다! 🎉 OpenClaw가 AWS에서 실행 중입니다.
