import { useState, useEffect } from 'react'
import useProjectStore from '../store/projectStore'

function ProjectInput({ onClose, mode = 'new' }) {
    const {
        createProject,
        updateProject,
        openProject,
        registerProject,
        loadRegisteredProjects
    } = useProjectStore()

    // input | install | setup | decomposing | review
    const [step, setStep] = useState('input')
    const [goal, setGoal] = useState('')
    const [workingDir, setWorkingDir] = useState('')
    const [tasks, setTasks] = useState([])
    const [isLoading, setIsLoading] = useState(false)

    // VFM 패키지 상태
    const [vfmStatus, setVfmStatus] = useState(null) // { installed, version, needsUpdate }
    const [setupMessage, setSetupMessage] = useState('')
    const [showUpdatePrompt, setShowUpdatePrompt] = useState(false)

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

    // 프로젝트 분해 시작
    const handleDecompose = async () => {
        if (!goal.trim()) return

        // VFM 패키지가 없으면 먼저 설치
        if (!vfmStatus?.installed) {
            await handleInstallVfm()
            // 설치 완료 후 계속
            const newStatus = await window.electronAPI?.checkVfmPackage(workingDir)
            if (!newStatus?.installed) {
                return // 설치 실패
            }
        }

        setIsLoading(true)
        setStep('decomposing')

        // 프로젝트 생성
        const project = await createProject(goal, workingDir)

        // Claude Code로 분해 요청
        if (window.electronAPI) {
            const prompt = `다음 프로젝트 목표를 분석하여 JSON 형식으로 분해해주세요:

목표: ${goal}

응답은 반드시 다음 JSON 형식만 출력해주세요 (다른 텍스트 없이):
{
  "tasks": [
    {
      "name": "태스크 이름",
      "description": "설명",
      "priority": 1
    }
  ]
}`;

            try {
                const result = await window.electronAPI.runClaude({
                    workingDir: workingDir,
                    prompt,
                    agent: 'vfm-draft',
                    permissionMode: 'default'
                })

                // 분석 결과 저장
                if (result.stdout && workingDir) {
                    await window.electronAPI.saveClaudeResponse({
                        workingDir: workingDir,
                        stage: '분석',
                        taskName: '프로젝트분해',
                        response: result.stdout,
                        prompt: prompt
                    })
                }

                // JSON 파싱 시도
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
                // 기본 태스크로 폴백
                setTasks([
                    { name: '기본 구조', description: '프로젝트 기본 설정', priority: 1 }
                ])
                setStep('review')
            }
        } else {
            // 개발 모드: 더미 데이터
            setTasks([
                { name: '인증 시스템', description: 'Google OAuth 로그인', priority: 1 },
                { name: '데이터베이스', description: 'Firebase/Firestore 설정', priority: 2 },
                { name: '메인 기능', description: '핵심 비즈니스 로직', priority: 3 },
                { name: 'UI/UX', description: '사용자 인터페이스', priority: 4 }
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
                                onClick={handleDecompose}
                                disabled={!goal.trim() || !workingDir}
                            >
                                🤖 AI로 분해
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

                {step === 'decomposing' && (
                    <div className="loading-state">
                        <div className="spinner"></div>
                        <h3>AI가 프로젝트를 분석하고 있습니다...</h3>
                        <p>vfm-draft 에이전트가 프로젝트 구조를 분석합니다</p>
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
