import { useState } from 'react'
import useProjectStore from '../store/projectStore'

function ProjectInput({ onClose }) {
    const { createProject, updateProject } = useProjectStore()
    const [step, setStep] = useState('input') // input | decomposing | review
    const [goal, setGoal] = useState('')
    const [workingDir, setWorkingDir] = useState('')
    const [components, setComponents] = useState([])
    const [isLoading, setIsLoading] = useState(false)

    const handleDecompose = async () => {
        if (!goal.trim()) return

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
  "components": [
    {
      "name": "컴포넌트 이름",
      "description": "설명",
      "priority": 1
    }
  ]
}`;

            try {
                const result = await window.electronAPI.runClaude({
                    workingDir: workingDir || process.cwd(),
                    prompt
                })

                // 분석 결과를 .vibe-flow 폴더에 저장
                if (result.stdout && workingDir) {
                    await window.electronAPI.saveClaudeResponse({
                        workingDir: workingDir,
                        stage: '분석',
                        componentName: '프로젝트분해',
                        response: result.stdout,
                        prompt: prompt
                    })
                }

                // JSON 파싱 시도
                const jsonMatch = result.stdout.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0])
                    setComponents(parsed.components || [])
                    setStep('review')
                }
            } catch (err) {
                console.error('Decompose error:', err)
                // 기본 컴포넌트로 폴백
                setComponents([
                    { name: '기본 구조', description: '프로젝트 기본 설정', priority: 1 }
                ])
                setStep('review')
            }
        } else {
            // 개발 모드: 더미 데이터
            setComponents([
                { name: '인증 시스템', description: 'Google OAuth 로그인', priority: 1 },
                { name: '데이터베이스', description: 'Firebase/Firestore 설정', priority: 2 },
                { name: '메인 기능', description: '핵심 비즈니스 로직', priority: 3 },
                { name: 'UI/UX', description: '사용자 인터페이스', priority: 4 }
            ])
            setStep('review')
        }

        setIsLoading(false)
    }

    const handleConfirm = async () => {
        // 컴포넌트들을 프로젝트에 추가
        for (const comp of components) {
            await useProjectStore.getState().addComponent(comp)
        }
        await updateProject({ status: 'active' })
        onClose()
    }

    const handleAddComponent = () => {
        setComponents([...components, { name: '', description: '', priority: components.length + 1 }])
    }

    const handleRemoveComponent = (index) => {
        setComponents(components.filter((_, i) => i !== index))
    }

    const handleUpdateComponent = (index, field, value) => {
        const updated = [...components]
        updated[index] = { ...updated[index], [field]: value }
        setComponents(updated)
    }

    return (
        <div className="modal-overlay">
            <div className="modal project-input-modal">
                {step === 'input' && (
                    <>
                        <h2>🚀 새 프로젝트</h2>

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
                                    onClick={async () => {
                                        if (window.electronAPI) {
                                            const result = await window.electronAPI.selectFolder();
                                            if (result.success) {
                                                setWorkingDir(result.path);
                                                if (!goal) setGoal(result.name);
                                            }
                                        }
                                    }}
                                >
                                    📁 폴더 선택
                                </button>
                            </div>
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

                {step === 'decomposing' && (
                    <div className="loading-state">
                        <div className="spinner"></div>
                        <h3>AI가 프로젝트를 분석하고 있습니다...</h3>
                        <p>잠시만 기다려주세요</p>
                    </div>
                )}

                {step === 'review' && (
                    <>
                        <h2>📦 컴포넌트 검토</h2>
                        <p className="subtitle">AI가 분해한 결과입니다. 수정하거나 추가/삭제할 수 있습니다.</p>

                        <div className="components-list">
                            {components.map((comp, index) => (
                                <div key={index} className="component-item">
                                    <input
                                        type="text"
                                        value={comp.name}
                                        onChange={(e) => handleUpdateComponent(index, 'name', e.target.value)}
                                        placeholder="컴포넌트 이름"
                                        className="component-name"
                                    />
                                    <input
                                        type="text"
                                        value={comp.description}
                                        onChange={(e) => handleUpdateComponent(index, 'description', e.target.value)}
                                        placeholder="설명"
                                        className="component-desc"
                                    />
                                    <button
                                        className="btn-icon"
                                        onClick={() => handleRemoveComponent(index)}
                                    >
                                        🗑️
                                    </button>
                                </div>
                            ))}
                        </div>

                        <button className="btn-add" onClick={handleAddComponent}>
                            + 컴포넌트 추가
                        </button>

                        <div className="modal-actions">
                            <button onClick={() => setStep('input')}>← 뒤로</button>
                            <button
                                className="btn-primary"
                                onClick={handleConfirm}
                                disabled={components.length === 0}
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
