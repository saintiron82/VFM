# VFM UI 개편 계획: 종합 프로젝트 관리 플랫폼

## 비전
VFM을 **플러그인 기반의 확장 가능한 프로젝트 관리 플랫폼**으로 발전

## 현재 구조
```
┌─────────────────────────────────────────────────┐
│ 헤더 (프로젝트 선택, 설정)                       │
├─────────────────────────────────────────────────┤
│ [탐색기] │        칸반 그리드          │ [상세] │
│          │  태스크 × 스테이지          │        │
│          │                             │        │
└─────────────────────────────────────────────────┘
```

## 제안: 도킹 시스템 기반 UI

### 1. 도킹 레이아웃 시스템
```
┌─────────────────────────────────────────────────────────────┐
│ 메뉴바 │ 툴바 (빠른 액션)                                   │
├────────┴────────────────────────────────────────────────────┤
│ ┌──────────┬────────────────────────────┬─────────────────┐ │
│ │ 사이드바  │      메인 영역 (탭)        │   패널 영역     │ │
│ │          │  ┌─────┬─────┬─────┐       │                 │ │
│ │ 📂 탐색기 │  │칸반 │타임라│보드│       │  📋 속성       │ │
│ │ 📊 대시보드│  └─────┴─────┴─────┘       │  💬 채팅       │ │
│ │ 👥 팀     │                            │  📝 노트       │ │
│ │ ⚙️ 설정   │  [도킹 가능한 컨텐츠]      │  🔧 터미널     │ │
│ │          │                            │                 │ │
│ └──────────┴────────────────────────────┴─────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ 상태바 (진행률, 알림, 연결 상태)                             │
└─────────────────────────────────────────────────────────────┘
```

### 2. 플러그인/위젯 시스템

#### 코어 위젯 (내장)
| 위젯 | 설명 |
|------|------|
| 칸반 그리드 | 현재 스프레드시트 스타일 태스크 관리 |
| 솔루션 탐색기 | 파일 트리 + 연결 프로그램 |
| 태스크 상세 | Claude 실행, 기획서, 로그 |
| 터미널 | 내장 터미널 (xterm.js) |
| 채팅/AI | Claude 대화 인터페이스 |

#### 확장 위젯 (플러그인)
| 위젯 | 설명 |
|------|------|
| 타임라인 | 간트 차트, 마일스톤 |
| 대시보드 | 통계, 차트, KPI |
| 팀 관리 | 작업자 할당, 역할 |
| Git 통합 | 브랜치, 커밋, PR |
| 문서 에디터 | 마크다운, 기획서 |
| API 테스터 | REST/GraphQL 테스트 |

### 3. 위젯 구조

```javascript
// 위젯 인터페이스
interface Widget {
  id: string
  name: string
  icon: string
  version: string

  // 위젯 위치
  defaultDock: 'left' | 'right' | 'bottom' | 'center' | 'float'

  // 렌더링
  render: (context: WidgetContext) => React.ReactNode

  // 라이프사이클
  onMount?: () => void
  onUnmount?: () => void
  onProjectChange?: (project: Project) => void

  // 설정
  settings?: WidgetSettings[]
}

// 위젯 컨텍스트
interface WidgetContext {
  project: Project
  tasks: Task[]
  selectedTask: Task | null
  api: VfmAPI
  store: VfmStore
}
```

### 4. 레이아웃 저장/복원

```javascript
// 레이아웃 설정
{
  "layouts": {
    "default": {
      "left": ["explorer", "git"],
      "center": ["kanban"],
      "right": ["taskDetail", "chat"],
      "bottom": ["terminal", "output"]
    },
    "focus": {
      "center": ["kanban"],
      "right": ["taskDetail"]
    },
    "review": {
      "left": ["explorer"],
      "center": ["diff"],
      "right": ["chat"]
    }
  },
  "activeLayout": "default"
}
```

---

## 구현 단계

### Phase 1: 도킹 시스템 기반 (2주)
- [ ] 도킹 라이브러리 선택 (react-mosaic, golden-layout, flexlayout-react)
- [ ] 기본 레이아웃 컨테이너
- [ ] 기존 컴포넌트를 위젯으로 래핑
- [ ] 레이아웃 저장/복원

### Phase 2: 위젯 시스템 (2주)
- [ ] 위젯 인터페이스 정의
- [ ] 위젯 레지스트리
- [ ] 위젯 컨텍스트 (공유 상태)
- [ ] 내장 위젯 마이그레이션

### Phase 3: 확장 기능 (3주)
- [ ] 터미널 위젯 (xterm.js)
- [ ] Git 통합 위젯
- [ ] 타임라인/간트 위젯
- [ ] 팀 관리 위젯

### Phase 4: 플러그인 시스템 (2주)
- [ ] 외부 플러그인 로딩
- [ ] 플러그인 마켓플레이스 (향후)
- [ ] 플러그인 API 문서화

---

## 기술 스택 제안

### 도킹 라이브러리
- **flexlayout-react** (추천): 유연한 도킹, 탭, 분할
- react-mosaic: 간단하지만 제한적
- golden-layout: 강력하지만 React 통합 복잡

### 추가 라이브러리
- xterm.js: 터미널
- @uiw/react-md-editor: 마크다운
- recharts/visx: 차트
- react-flow: 다이어그램
- date-fns + react-calendar: 타임라인

---

## 데이터 모델 확장

### 프로젝트 (확장)
```javascript
{
  id: string,
  name: string,
  goal: string,
  workingDir: string,

  // 팀
  members: TeamMember[],
  roles: Role[],

  // 타임라인
  milestones: Milestone[],
  sprints: Sprint[],

  // 태스크
  tasks: Task[],

  // 설정
  settings: ProjectSettings,
  layout: LayoutConfig
}
```

### 태스크 (확장)
```javascript
{
  id: string,
  name: string,
  description: string,

  // 워크플로우
  currentStage: string,
  stages: StageData[],

  // 담당자
  assignee: string | null,
  reviewers: string[],

  // 일정
  dueDate: Date | null,
  estimatedHours: number | null,

  // 의존성
  dependencies: string[],
  blockedBy: string[],

  // 메타
  priority: 'low' | 'medium' | 'high' | 'critical',
  labels: string[],

  // 계층
  parentId: string | null,
  childIds: string[]
}
```

---

## 우선순위

1. **도킹 시스템** - UI 유연성 확보
2. **터미널 위젯** - 개발자 필수 기능
3. **Git 통합** - 버전 관리 연동
4. **팀 관리** - 협업 기능
5. **타임라인** - 일정 관리

---

## 다음 액션

1. 도킹 라이브러리 POC 작성
2. 위젯 인터페이스 설계
3. 기존 컴포넌트 위젯화
