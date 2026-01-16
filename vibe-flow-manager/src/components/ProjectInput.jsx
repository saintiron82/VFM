import { useState, useEffect, useRef } from 'react'
import useProjectStore from '../store/projectStore'
import Terminal from './Terminal'

function ProjectInput({ onClose, mode = 'new' }) {
    const {
        createProject,
        updateProject,
        openProject,
        registerProject,
        loadRegisteredProjects
    } = useProjectStore()

    // input | install | brainstorming | doc-generation | decomposing | review
    const [step, setStep] = useState('input')
    const [goal, setGoal] = useState('')
    const [workingDir, setWorkingDir] = useState('')
    const [tasks, setTasks] = useState([])
    const [isLoading, setIsLoading] = useState(false)

    // VFM 패키지 상태
    const [vfmStatus, setVfmStatus] = useState(null) // { installed, version, needsUpdate }
    const [setupMessage, setSetupMessage] = useState('')
    const [showUpdatePrompt, setShowUpdatePrompt] = useState(false)

    // 브레인스토밍 상태
    const [brainstormSession, setBrainstormSession] = useState({
        phase: 'structured', // 'structured' | 'conversation' | 'complete'
        structuredAnswers: {},
        conversationHistory: [],
        currentQuestion: null,
        pendingResponse: '',
        processId: null
    })

    // 생성된 문서
    const [generatedDocs, setGeneratedDocs] = useState({
        claudeMd: '',
        specMd: '',
        phaseMd: ''
    })
    const [showDocPreview, setShowDocPreview] = useState(false)
    const [activeDocTab, setActiveDocTab] = useState('claude')

    // 현재 누적 중인 Claude 출력
    const currentOutputRef = useRef('')
    const conversationEndRef = useRef(null)

    // 터미널 기반 브레인스토밍은 별도 리스너 불필요

    // 폴더 선택 시 VFM 패키지 확인
    const handleFolderSelect = async () => {
        if (!window.electronAPI) return

        const result = await window.electronAPI.selectFolder()
        if (result.success) {
            setWorkingDir(result.path)
            if (!goal) setGoal(result.name)

            // VFM 패키지 확인
            const pkgStatus = await window.electronAPI.checkVfmPackage(result.path)
            setVfmStatus(pkgStatus)

            if (pkgStatus.installed && pkgStatus.needsUpdate) {
                setShowUpdatePrompt(true)
            }
        }
    }

    // VFM 패키지 설치
    const handleInstallVfm = async () => {
        if (!workingDir || !window.electronAPI) return

        setStep('install')
        setSetupMessage('VFM 패키지 설치 중...')

        try {
            // VFM 패키지 설치
            const installResult = await window.electronAPI.installVfmPackage(workingDir)
            if (!installResult.success) {
                throw new Error(installResult.error)
            }

            setSetupMessage('VFM 패키지 설치 완료!')

            // 상태 업데이트
            const newStatus = await window.electronAPI.checkVfmPackage(workingDir)
            setVfmStatus(newStatus)

            // 잠시 후 다음 단계로
            setTimeout(() => {
                setStep('input')
            }, 1000)

        } catch (err) {
            console.error('VFM 설치 에러:', err)
            setSetupMessage(`에러: ${err.message}`)
            setTimeout(() => setStep('input'), 2000)
        }
    }

    // 기존 프로젝트 열기
    const handleOpenExisting = async () => {
        if (!workingDir || !vfmStatus?.installed) return

        setStep('setup')
        setSetupMessage('프로젝트 로딩 중...')

        try {
            await openProject(workingDir)
            onClose()
        } catch (err) {
            console.error('프로젝트 열기 에러:', err)
            setSetupMessage(`에러: ${err.message}`)
            setTimeout(() => setStep('input'), 2000)
        }
    }

    // 브레인스토밍 세션 시작 (터미널 기반)
    const handleStartBrainstorm = async () => {
        if (!goal.trim()) return

        // VFM 패키지가 없으면 먼저 설치
        if (!vfmStatus?.installed) {
            await handleInstallVfm()
            const newStatus = await window.electronAPI?.checkVfmPackage(workingDir)
            if (!newStatus?.installed) {
                return
            }
        }

        setStep('brainstorming')
        setIsLoading(true)

        try {
            // 터미널 세션 시작
            const sessionId = `brainstorm-${Date.now()}`
            const terminalResult = await window.electronAPI.spawnTerminal({
                sessionId,
                cwd: workingDir,
                shell: 'cmd.exe'
            })

            if (terminalResult.success) {
                // 터미널 준비될 때까지 대기 (첫 출력 감지) - 3초 대기
                console.log('Terminal created, waiting for prompt...')
                await new Promise(r => setTimeout(r, 3000))

                console.log('Sending claude command to terminal...')
                try {
                    await window.electronAPI.terminalInput(sessionId, 'claude --agent vfm-brainstorm --model opus')
                    await new Promise(r => setTimeout(r, 100))
                    await window.electronAPI.terminalInput(sessionId, '\r')
                    console.log('Command sent and executed')
                } catch (e) {
                    console.error('terminalInput error:', e)
                }

                setBrainstormSession({
                    terminalSessionId: sessionId,
                    phase: 'structured'
                })
            }
        } catch (err) {
            console.error('Brainstorm start error:', err)
            setStep('input')
        }

        setIsLoading(false)
    }

    // 문서 생성 (터미널 세션 종료 후)
    const handleGenerateDocs = async () => {
        // 터미널 세션 종료
        if (brainstormSession.terminalSessionId) {
            await window.electronAPI.closeTerminal(brainstormSession.terminalSessionId)
        }

        setStep('doc-generation')
        setShowDocPreview(false)

        try {
            // 브레인스토밍 요약을 goal로 전달
            const result = await window.electronAPI.generateProjectDocs(
                workingDir,
                { goal, summary: "Terminal brainstorming completed" },
                goal
            )

            if (result.success) {
                setGeneratedDocs({
                    claudeMd: result.claudeMd || '',
                    specMd: result.specMd || '',
                    phaseMd: result.phaseMd || ''
                })
                setShowDocPreview(true)
            }
        } catch (err) {
            console.error('문서 생성 에러:', err)
            setStep('brainstorming')
        }
    }

    // 문서 저장 및 분해 진행
    const handleSaveDocsAndDecompose = async () => {
        try {
            // 문서 저장
            await window.electronAPI.saveProjectDocs(workingDir, generatedDocs)

            // 이제 문서 기반 분해 진행
            await handleDecomposeWithDocs()
        } catch (err) {
            console.error('문서 저장 에러:', err)
        }
    }

    // 문서 기반 프로젝트 분해
    const handleDecomposeWithDocs = async () => {
        setIsLoading(true)
        setStep('decomposing')

        // 프로젝트 생성
        const project = await createProject(goal, workingDir)

        if (window.electronAPI) {
            const prompt = `프로젝트를 분해해주세요.

프로젝트 목표: ${goal}

다음 문서들을 참고하세요:
- CLAUDE.md: 프로젝트 아키텍처 및 개발 가이드라인
- Spec.md: 기능 명세 및 요구사항
- phase.md: 마일스톤 계획

**중요:** phase.md의 마일스톤 구조에 맞춰 태스크를 분해하되, 각 태스크는 반드시 특정 phase에 속해야 합니다.

응답은 반드시 다음 JSON 형식만 출력해주세요 (다른 텍스트 없이):
{
  "tasks": [
    {
      "name": "태스크 이름",
      "description": "설명",
      "priority": 1,
      "milestone": "v0.1",
      "dependencies": []
    }
  ]
}

milestone은 phase.md에 정의된 마일스톤(v0.1, v0.2 등)을 사용하세요.
dependencies는 이 태스크가 의존하는 다른 태스크의 이름 배열입니다.`;

            try {
                const result = await window.electronAPI.runClaude({
                    workingDir: workingDir,
                    prompt,
                    agent: 'vfm-draft',
                    permissionMode: 'default'
                })

                if (result.stdout && workingDir) {
                    await window.electronAPI.saveClaudeResponse({
                        workingDir: workingDir,
                        stage: '분석',
                        taskName: '프로젝트분해',
                        response: result.stdout,
                        prompt: prompt
                    })
                }

                const jsonMatch = result.stdout?.match(/\{[\s\S]*\}/)
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0])
                    setTasks(parsed.tasks || [])
                    setStep('review')
                } else {
                    throw new Error('JSON 파싱 실패')
                }
            } catch (err) {
                console.error('Decompose error:', err)
                setTasks([
                    { name: '기본 구조', description: '프로젝트 기본 설정', priority: 1, milestone: 'v0.1' }
                ])
                setStep('review')
            }
        } else {
            setTasks([
                { name: '인증 시스템', description: 'Google OAuth 로그인', priority: 1, milestone: 'v0.1' },
                { name: '데이터베이스', description: 'Firebase/Firestore 설정', priority: 2, milestone: 'v0.1' },
                { name: '메인 기능', description: '핵심 비즈니스 로직', priority: 3, milestone: 'v0.2' },
                { name: 'UI/UX', description: '사용자 인터페이스', priority: 4, milestone: 'v0.2' }
            ])
            setStep('review')
        }

        setIsLoading(false)
    }

    // 태스크 확정
    const handleConfirm = async () => {
        // 태스크들을 프로젝트에 추가
        for (const task of tasks) {
            await useProjectStore.getState().addTask(task)
        }
        await updateProject({ status: 'active' })
        onClose()
    }

    // 태스크 추가
    const handleAddTask = () => {
        setTasks([...tasks, { name: '', description: '', priority: tasks.length + 1 }])
    }

    // 태스크 제거
    const handleRemoveTask = (index) => {
        setTasks(tasks.filter((_, i) => i !== index))
    }

    // 태스크 업데이트
    const handleUpdateTask = (index, field, value) => {
        const updated = [...tasks]
        updated[index] = { ...updated[index], [field]: value }
        setTasks(updated)
    }

    return (
        <div className="modal-overlay">
            <div className="modal project-input-modal">
                {step === 'input' && (
                    <>
                        <h2>🚀 {mode === 'new' ? '새 프로젝트' : '프로젝트 열기'}</h2>

                        <div className="form-group">
                            <label>작업 디렉토리</label>
                            <div className="folder-input-row">
                                <input
                                    type="text"
                                    value={workingDir}
                                    onChange={(e) => setWorkingDir(e.target.value)}
                                    placeholder="폴더를 선택하세요"
                                    readOnly
                                />
                                <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={handleFolderSelect}
                                >
                                    폴더 선택
                                </button>
                            </div>

                            {/* VFM 패키지 상태 표시 */}
                            {workingDir && vfmStatus && (
                                <div className="vfm-status">
                                    {vfmStatus.installed ? (
                                        <div className="status-installed">
                                            <span className="status-badge success">
                                                VFM 패키지 설치됨 (v{vfmStatus.version})
                                            </span>
                                            {vfmStatus.needsUpdate && (
                                                <button
                                                    type="button"
                                                    className="btn-small btn-warning"
                                                    onClick={handleInstallVfm}
                                                >
                                                    업데이트
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="status-not-installed">
                                            <span className="status-badge warning">
                                                VFM 패키지 미설치
                                            </span>
                                            <p className="status-desc">
                                                프로젝트 생성 시 자동으로 설치됩니다.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* 기존 프로젝트 열기 버튼 */}
                            {workingDir && vfmStatus?.installed && (
                                <button
                                    type="button"
                                    className="btn-open-existing"
                                    onClick={handleOpenExisting}
                                >
                                    📂 기존 프로젝트 열기
                                </button>
                            )}
                        </div>

                        <div className="form-group">
                            <label>프로젝트 목표</label>
                            <textarea
                                value={goal}
                                onChange={(e) => setGoal(e.target.value)}
                                placeholder="예: 구글 로그인이 있는 개인 일기장 시스템을 만들자"
                                rows={3}
                            />
                        </div>

                        {/* VFM 패키지 안내 */}
                        {workingDir && !vfmStatus?.installed && (
                            <div className="vfm-info-box">
                                <h4>VFM 패키지란?</h4>
                                <p>
                                    VFM 패키지는 프로젝트에 설치되어 5단계 워크플로우와
                                    전용 에이전트를 제공합니다.
                                </p>
                                <ul>
                                    <li>📝 초안 - 요구사항 분석</li>
                                    <li>📋 플랜 - 구현 계획</li>
                                    <li>🔄 진행 - 코드 구현 (Agentic Mode)</li>
                                    <li>🧪 검증 - 테스트 및 리뷰</li>
                                    <li>✅ 완료 - 문서화</li>
                                </ul>
                            </div>
                        )}

                        <div className="modal-actions">
                            <button onClick={onClose}>취소</button>
                            <button
                                className="btn-primary"
                                onClick={handleStartBrainstorm}
                                disabled={!goal.trim() || !workingDir || isLoading}
                            >
                                {isLoading ? '준비 중...' : '🧠 브레인스토밍 시작'}
                            </button>
                        </div>
                    </>
                )}

                {step === 'install' && (
                    <div className="loading-state">
                        <div className="spinner"></div>
                        <h3>VFM 패키지 설치 중...</h3>
                        <p>{setupMessage}</p>
                        <div className="install-progress">
                            <div className="progress-item">📁 .vfm 폴더 생성</div>
                            <div className="progress-item">🤖 에이전트 설치</div>
                            <div className="progress-item">📝 CLAUDE.md 생성</div>
                        </div>
                    </div>
                )}

                {step === 'setup' && (
                    <div className="loading-state">
                        <div className="spinner"></div>
                        <h3>프로젝트 설정 중...</h3>
                        <p>{setupMessage}</p>
                    </div>
                )}

                {step === 'brainstorming' && (
                    <>
                        <h2>🧠 브레인스토밍</h2>
                        <p className="subtitle">터미널에서 Claude와 직접 대화하세요</p>

                        {/* 터미널 */}
                        <div style={{ height: '500px', marginBottom: '1rem', border: '1px solid #444', borderRadius: '8px', overflow: 'hidden' }}>
                            {brainstormSession.terminalSessionId && (
                                <Terminal
                                    sessionId={brainstormSession.terminalSessionId}
                                    cwd={workingDir}
                                    title="브레인스토밍"
                                />
                            )}
                        </div>

                        {/* 문서 생성 버튼 */}
                        <button
                            className="btn-primary"
                            onClick={handleGenerateDocs}
                            style={{ marginTop: '1rem', width: '100%' }}
                        >
                            📝 브레인스토밍 종료 및 문서 생성
                        </button>

                        <div className="modal-actions">
                            <button onClick={() => setStep('input')}>← 뒤로</button>
                        </div>
                    </>
                )}

                {step === 'doc-generation' && (
                    <>
                        <h2>📄 프로젝트 문서 생성</h2>

                        {!showDocPreview ? (
                            <div className="loading-state">
                                <div className="spinner"></div>
                                <p>브레인스토밍 결과를 기반으로 문서를 생성하고 있습니다...</p>
                                <ul className="doc-list" style={{ textAlign: 'left', margin: '1rem auto' }}>
                                    <li>CLAUDE.md - 프로젝트 가이드</li>
                                    <li>Spec.md - 기능 명세서</li>
                                    <li>phase.md - 마일스톤 계획</li>
                                </ul>
                            </div>
                        ) : (
                            <>
                                <p className="subtitle">
                                    생성된 문서를 확인하고 수정할 수 있습니다
                                </p>

                                {/* 문서 탭 */}
                                <div className="doc-tabs">
                                    <button
                                        className={activeDocTab === 'claude' ? 'active' : ''}
                                        onClick={() => setActiveDocTab('claude')}
                                    >
                                        CLAUDE.md
                                    </button>
                                    <button
                                        className={activeDocTab === 'spec' ? 'active' : ''}
                                        onClick={() => setActiveDocTab('spec')}
                                    >
                                        Spec.md
                                    </button>
                                    <button
                                        className={activeDocTab === 'phase' ? 'active' : ''}
                                        onClick={() => setActiveDocTab('phase')}
                                    >
                                        phase.md
                                    </button>
                                </div>

                                {/* 문서 편집기 */}
                                <div className="doc-editor">
                                    <textarea
                                        value={
                                            activeDocTab === 'claude'
                                                ? generatedDocs.claudeMd
                                                : activeDocTab === 'spec'
                                                    ? generatedDocs.specMd
                                                    : generatedDocs.phaseMd
                                        }
                                        onChange={(e) => {
                                            const field =
                                                activeDocTab === 'claude'
                                                    ? 'claudeMd'
                                                    : activeDocTab === 'spec'
                                                        ? 'specMd'
                                                        : 'phaseMd'
                                            setGeneratedDocs({
                                                ...generatedDocs,
                                                [field]: e.target.value
                                            })
                                        }}
                                        rows={20}
                                        className="doc-content"
                                    />
                                </div>

                                <div className="modal-actions">
                                    <button onClick={() => setStep('brainstorming')}>← 수정</button>
                                    <button
                                        className="btn-primary"
                                        onClick={handleSaveDocsAndDecompose}
                                    >
                                        문서 저장 및 분해 시작
                                    </button>
                                </div>
                            </>
                        )}
                    </>
                )}

                {step === 'decomposing' && (
                    <div className="loading-state">
                        <div className="spinner"></div>
                        <h3>AI가 프로젝트를 분석하고 있습니다...</h3>
                        <p>vfm-draft 에이전트가 프로젝트 구조를 분석합니다</p>
                        <p className="hint">phase.md의 마일스톤 기반으로 작업을 분류합니다</p>
                    </div>
                )}

                {step === 'review' && (
                    <>
                        <h2>📦 태스크 검토</h2>
                        <p className="subtitle">
                            AI가 분해한 결과입니다. 수정하거나 추가/삭제할 수 있습니다.
                        </p>

                        <div className="tasks-list">
                            {tasks.map((task, index) => (
                                <div key={index} className="task-item">
                                    <input
                                        type="text"
                                        value={task.name}
                                        onChange={(e) => handleUpdateTask(index, 'name', e.target.value)}
                                        placeholder="태스크 이름"
                                        className="task-name"
                                    />
                                    <input
                                        type="text"
                                        value={task.description}
                                        onChange={(e) => handleUpdateTask(index, 'description', e.target.value)}
                                        placeholder="설명"
                                        className="task-desc"
                                    />
                                    <button
                                        className="btn-icon"
                                        onClick={() => handleRemoveTask(index)}
                                    >
                                        🗑️
                                    </button>
                                </div>
                            ))}
                        </div>

                        <button className="btn-add" onClick={handleAddTask}>
                            + 태스크 추가
                        </button>

                        <div className="modal-actions">
                            <button onClick={() => setStep('input')}>← 뒤로</button>
                            <button
                                className="btn-primary"
                                onClick={handleConfirm}
                                disabled={tasks.length === 0}
                            >
                                ✅ 확정하고 시작
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

export default ProjectInput
