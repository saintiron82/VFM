# VFM (Vibe Flow Manager)

> **AI 시대의 Jira** — 이슈를 등록하면 AI가 바로 처리합니다

---

## 🎯 한 줄 소개

**이미 구독 중인 Claude Code를 활용해, Jira/Trello처럼 이슈를 관리하고 AI가 직접 작업을 수행하는 프로젝트 관리 도구**

---

## 💡 왜 VFM인가?

### 기존 방식의 문제

| 문제 | 설명 |
|------|------|
| **Claude Code 활용 제한** | 터미널/특정 IDE에서만 사용 가능 |
| **비용 낭비** | 월 $20~100 내면서 제대로 못 씀 |
| **이슈 → 작업 분리** | Jira에서 이슈 만들고, 따로 코딩해야 함 |
| **컨텍스트 유실** | AI 대화가 끊기면 맥락 사라짐 |

### VFM의 해결책

```
이슈 등록 ──→ AI가 분석 ──→ AI가 구현 ──→ AI가 검증 ──→ 완료
              (자동)        (자동)        (자동)
```

**추가 비용 $0** — 이미 내고 있는 Claude 구독 그대로 활용

---

## 🏗️ 핵심 기능

### 📋 칸반 스타일 태스크 관리
- 프로젝트 목표 입력 → AI가 태스크로 자동 분해
- 드래그 앤 드롭으로 상태 관리
- 계층적 태스크 구조 (부모/자식)

### ⚡ 5단계 워크플로우
| 단계 | AI 액션 |
|------|---------|
| 📝 초안 | 요구사항 분석, 기술 결정 |
| 📋 플랜 | 구현 계획, 파일 구조 설계 |
| 🔄 진행 | 실제 코드 작성 |
| 🧪 검증 | 테스트, 코드 리뷰 |
| ✅ 완료 | 문서화, 최종 정리 |

### 🤖 커스텀 AI 에이전트
- `project-analyzer`: 목표 분해
- `vfm-task-executor`: 단계별 실행
- `vfm-code-reviewer`: 코드 검증
- 사용자 정의 에이전트 추가 가능

### 🖥️ 올인원 개발 환경
- 솔루션 탐색기 (파일 트리)
- 내장 터미널 (멀티탭)
- 문서 뷰어 (Markdown/PDF)
- 유연한 도킹 레이아웃

---

## 🔧 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | React 18, Zustand |
| Desktop | Electron |
| AI Engine | Claude Code CLI |
| Layout | flexlayout-react |
| Terminal | xterm.js |

---

## 📊 경쟁사 비교

| | Devin | Factory AI | Cursor | **VFM** |
|---|:---:|:---:|:---:|:---:|
| 추가 비용 | $500/월 | 엔터프라이즈 | $20/월 | **$0** |
| AI 엔진 | 자체 | 자체 | 자체 | **사용자 Claude** |
| 프로젝트 관리 | ❌ | △ | ❌ | **✅** |
| 로컬 실행 | ❌ | ❌ | ✅ | **✅** |
| 커스텀 에이전트 | ❌ | △ | ❌ | **✅** |
| 오픈소스 | ❌ | ❌ | ❌ | **✅** |

---

## 🚀 시작하기

### 사전 요구사항
- Node.js 18+
- Claude Code CLI (`claude` 명령어 사용 가능)
- Claude Pro/Max 구독

### 설치

```bash
# 저장소 클론
git clone https://github.com/your-repo/vfm.git
cd vfm/vibe-flow-manager

# 의존성 설치
npm install

# 실행
npm run start
```

---

## 📁 프로젝트 구조

```
vibe-flow-manager/
├── electron/           # Electron 메인 프로세스
│   ├── main.js         # IPC 핸들러, Claude 연동
│   └── preload.js      # API 노출
├── src/
│   ├── components/     # React 컴포넌트
│   │   ├── KanbanBoard.jsx
│   │   ├── CardDetail.jsx
│   │   ├── DockLayout.jsx
│   │   ├── Terminal*.jsx
│   │   └── ...
│   ├── store/          # Zustand 상태 관리
│   └── styles/         # CSS
└── resources/
    └── agents/         # AI 에이전트 정의
        ├── project-analyzer.md
        ├── vfm-task-executor.md
        └── vfm-code-reviewer.md
```

---

## 🎯 타겟 사용자

1. **Claude Code 구독자** — 이미 내는 비용 최대 활용
2. **솔로 개발자** — 프로젝트 관리 + 개발 자동화
3. **비개발자** — AI로 프로젝트 만들고 싶은 분
4. **팀** — 이슈 단위 AI 위임

---

## 🗺️ 로드맵

- [x] 칸반 보드 + 워크플로우
- [x] Claude Code 연동
- [x] 커스텀 에이전트 시스템
- [x] 도킹 레이아웃
- [ ] Git 통합
- [ ] 자동 진행 모드
- [ ] 협업 기능 (팀)
- [ ] 플러그인 시스템

---

## 📜 라이선스

MIT License

---

## 🙋 기여

Issues와 Pull Requests 환영합니다!

---

**VFM** — *Jira처럼 이슈 올리면, AI가 바로 해결합니다*
