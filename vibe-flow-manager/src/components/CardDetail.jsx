import { useState } from 'react'
import useProjectStore from '../store/projectStore'

const STAGE_PROMPTS = {
    '초안': (component) => `"${component.name}"에 대해 다음을 조사하고 정리해주세요:
- 필요한 기술/라이브러리
- 주요 구현 포인트
- 예상 이슈`,

    '플랜': (component) => `"${component.name}" 구현을 위한 상세 계획을 작성해주세요.
implementation_plan.md 형식으로 작성하세요.`,

    '진행': (component) => `다음 계획에 따라 "${component.name}"을 구현해주세요.`,

    '검증': (component) => `"${component.name}" 구현을 테스트하고 walkthrough.md를 작성해주세요.`,

    '완료': () => null
}

const STAGES = ['초안', '플랜', '진행', '검증', '완료']

function CardDetail({ card, onClose }) {
    const { updateComponentStage, splitComponent, deleteComponent, setComponentStage } = useProjectStore()
    const [additionalInstruction, setAdditionalInstruction] = useState('')
    const [executionMode, setExecutionMode] = useState('normal')
    const [output, setOutput] = useState('')
    const [isRunning, setIsRunning] = useState(false)
    const [showSplitModal, setShowSplitModal] = useState(false)
    const [splitInput, setSplitInput] = useState('')
    const [showStageSelector, setShowStageSelector] = useState(false)

    const basePrompt = STAGE_PROMPTS[card.currentStage]?.(card) || ''

    const handleExecute = async () => {
        if (!window.electronAPI) {
            setOutput('Electron API not available (개발 모드)')
            return
        }

        setIsRunning(true)
        setOutput('')

        const fullPrompt = additionalInstruction
            ? `${basePrompt}\n\n## 추가 지침\n${additionalInstruction}`
            : basePrompt

        // 실시간 출력 수신
        window.electronAPI.onClaudeOutput((data) => {
            setOutput(prev => prev + data)
        })

        try {
            const result = await window.electronAPI.runClaude({
                workingDir: card.projectPath || process.cwd(),
                prompt: fullPrompt,
                mode: executionMode
            })

            // 응답을 .vibe-flow 폴더에 저장
            if (result.stdout && card.projectPath) {
                await window.electronAPI.saveClaudeResponse({
                    workingDir: card.projectPath,
                    stage: card.currentStage,
                    componentName: card.name,
                    response: result.stdout,
                    prompt: fullPrompt
                })
            }

            // 로그 저장
            await updateComponentStage(card.id, card.currentStage, {
                status: 'done',
                logs: [...(card.stages[card.currentStage]?.logs || []), {
                    timestamp: new Date().toISOString(),
                    prompt: fullPrompt,
                    result: result.stdout
                }]
            })
        } catch (err) {
            setOutput(`Error: ${err.message}`)
        } finally {
            setIsRunning(false)
        }
    }

    const handleNextStage = async () => {
        const stages = ['초안', '플랜', '진행', '검증', '완료']
        const currentIdx = stages.indexOf(card.currentStage)
        if (currentIdx < stages.length - 1) {
            await updateComponentStage(card.id, stages[currentIdx + 1], { status: 'in-progress' })
        }
    }

    const handleSplit = async () => {
        const subComponents = splitInput.split('\n')
            .filter(line => line.trim())
            .map(line => ({
                name: line.trim(),
                description: `${card.name}의 하위 작업`
            }))

        if (subComponents.length > 0) {
            await splitComponent(card.id, subComponents)
            setShowSplitModal(false)
            setSplitInput('')
        }
    }

    return (
        <div className="card-detail-sidebar">
            <div className="sidebar-header">
                <h3>{card.name}</h3>
                <button className="close-btn" onClick={onClose}>×</button>
            </div>

            <div className="sidebar-content">
                <div className="stage-badge">{card.currentStage}</div>
                <p className="card-description">{card.description}</p>

                <div className="section">
                    <h4>📝 기본 지침</h4>
                    <pre className="base-prompt">{basePrompt || '(이 단계에는 기본 지침이 없습니다)'}</pre>
                </div>

                <div className="section">
                    <h4>✏️ 추가 지침</h4>
                    <textarea
                        value={additionalInstruction}
                        onChange={(e) => setAdditionalInstruction(e.target.value)}
                        placeholder="추가 지침을 입력하세요..."
                        rows={4}
                    />
                </div>

                <div className="section">
                    <h4>⚙️ 실행 모드</h4>
                    <div className="mode-selector">
                        <label>
                            <input
                                type="radio"
                                name="mode"
                                value="normal"
                                checked={executionMode === 'normal'}
                                onChange={(e) => setExecutionMode(e.target.value)}
                            />
                            일반
                        </label>
                        <label>
                            <input
                                type="radio"
                                name="mode"
                                value="continue"
                                checked={executionMode === 'continue'}
                                onChange={(e) => setExecutionMode(e.target.value)}
                            />
                            이어가기 (-c)
                        </label>
                    </div>
                </div>

                <div className="action-buttons">
                    <button
                        className="btn-primary"
                        onClick={handleExecute}
                        disabled={isRunning || !basePrompt}
                    >
                        {isRunning ? '⏳ 실행 중...' : '▶️ Claude Code 실행'}
                    </button>
                    <button className="btn-secondary" onClick={handleNextStage}>
                        → 다음 단계
                    </button>
                    <button className="btn-secondary" onClick={() => setShowSplitModal(true)}>
                        🔀 분해
                    </button>
                    <button className="btn-secondary" onClick={() => setShowStageSelector(true)}>
                        🔄 상태 변경
                    </button>
                    <button
                        className="btn-secondary btn-danger"
                        onClick={async () => {
                            if (confirm(`"${card.name}" 카드를 삭제하시겠습니까?`)) {
                                await deleteComponent(card.id)
                                onClose()
                            }
                        }}
                    >
                        🗑️ 파기
                    </button>
                </div>

                {/* 상태 변경 선택기 */}
                {showStageSelector && (
                    <div className="section stage-selector">
                        <h4>상태 선택</h4>
                        <div className="stage-buttons">
                            {STAGES.map(stage => (
                                <button
                                    key={stage}
                                    className={`btn-secondary ${card.currentStage === stage ? 'active' : ''}`}
                                    onClick={async () => {
                                        await setComponentStage(card.id, stage)
                                        setShowStageSelector(false)
                                    }}
                                >
                                    {stage}
                                </button>
                            ))}
                        </div>
                        <button className="btn-secondary" onClick={() => setShowStageSelector(false)}>
                            취소
                        </button>
                    </div>
                )}

                {output && (
                    <div className="section">
                        <h4>📊 실행 결과</h4>
                        <pre className="output">{output}</pre>
                    </div>
                )}
            </div>

            {/* 분해 모달 */}
            {showSplitModal && (
                <div className="modal-overlay">
                    <div className="modal">
                        <h3>카드 분해</h3>
                        <p>하위 작업을 한 줄에 하나씩 입력하세요:</p>
                        <textarea
                            value={splitInput}
                            onChange={(e) => setSplitInput(e.target.value)}
                            placeholder="OAuth 설정
세션 관리
로그아웃 구현"
                            rows={6}
                        />
                        <div className="modal-actions">
                            <button onClick={() => setShowSplitModal(false)}>취소</button>
                            <button className="btn-primary" onClick={handleSplit}>분해</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default CardDetail
