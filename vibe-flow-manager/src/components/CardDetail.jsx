import { useState, useEffect, useMemo, useRef } from 'react'
import useProjectStore from '../store/projectStore'

const STAGE_PROMPTS = {
    '초안': (task) => `"${task.name}"에 대해 다음을 조사하고 정리해주세요:
- 필요한 기술/라이브러리
- 주요 구현 포인트
- 예상 이슈`,

    '플랜': (task) => `"${task.name}" 구현을 위한 상세 계획을 작성해주세요.
implementation_plan.md 형식으로 작성하세요.`,

    '진행': (task) => `다음 계획에 따라 "${task.name}"을 구현해주세요.`,

    '검증': (task) => `"${task.name}" 구현을 테스트하고 walkthrough.md를 작성해주세요.`,

    '완료': (task) => `"${task.name}" 구현이 완료되었습니다. 문서화 및 최종 정리를 수행해주세요.`
}

const STAGES = ['초안', '플랜', '진행', '검증', '완료']

const STAGE_COLORS = {
    '초안': '#f59e0b',
    '플랜': '#3b82f6',
    '진행': '#10b981',
    '검증': '#f97316',
    '완료': '#8b5cf6'
}

function CardDetail({ card, project, onClose }) {
    const {
        updateTaskStage,
        splitTask,
        deleteTask,
        setTaskStage,
        getAgentForStage,
        checkIntegrationReady,
        setIntegrationStatus,
        getChildTasks,
        currentProject
    } = useProjectStore()

    const [additionalInstruction, setAdditionalInstruction] = useState('')
    const [executionMode, setExecutionMode] = useState('normal')
    const [output, setOutput] = useState('')
    const [isRunning, setIsRunning] = useState(false)
    const [showSplitModal, setShowSplitModal] = useState(false)
    const [splitInput, setSplitInput] = useState('')
    const [showStageSelector, setShowStageSelector] = useState(false)

    // 자동 진행 관련 상태
    const [autoProgressTarget, setAutoProgressTarget] = useState('')
    const [isAutoProgressing, setIsAutoProgressing] = useState(false)
    const [autoProgressLog, setAutoProgressLog] = useState([])

    // 알림 및 파일 접근 상태
    const [completionNotice, setCompletionNotice] = useState(null) // { type: 'success' | 'error', message }
    const [generatedFiles, setGeneratedFiles] = useState({}) // { stage: [{name, path}] }
    const [showFilesSection, setShowFilesSection] = useState(false)
    const notificationRef = useRef(null)

    // 양방향 통신 상태
    const [useInteractiveMode, setUseInteractiveMode] = useState(false) // 사용자 선택
    const [isInteractiveSession, setIsInteractiveSession] = useState(false) // 현재 세션 상태
    const [pendingQuestion, setPendingQuestion] = useState(null) // { processId, question }
    const [userResponse, setUserResponse] = useState('')
    const [activeProcessId, setActiveProcessId] = useState(null)

    // 대화 기록 (실시간 표시용)
    const [conversationHistory, setConversationHistory] = useState([])
    // { type: 'claude' | 'user' | 'system', content: string, timestamp: Date }
    const conversationEndRef = useRef(null)

    // 현재 단계 에이전트 정보
    const currentAgent = useMemo(() => {
        return getAgentForStage(card.currentStage)
    }, [card.currentStage, getAgentForStage])

    // 자식 태스크 정보
    const childTasks = useMemo(() => {
        return getChildTasks(card.id)
    }, [card.id, getChildTasks, currentProject?.tasks])

    // 통합 가능 여부
    const integrationReady = useMemo(() => {
        return checkIntegrationReady(card.id)
    }, [card.id, checkIntegrationReady, currentProject?.tasks])

    // 남은 단계 (자동 진행용)
    const remainingStages = useMemo(() => {
        const currentIdx = STAGES.indexOf(card.currentStage)
        return STAGES.slice(currentIdx + 1)
    }, [card.currentStage])

    const basePrompt = STAGE_PROMPTS[card.currentStage]?.(card) || ''
    const workingDir = currentProject?.workingDir || card.projectPath

    // 생성된 파일 목록 로드 (해당 task가 생성한 문서만 필터링)
    useEffect(() => {
        const loadGeneratedFiles = async () => {
            if (!window.electronAPI || !workingDir) return

            const result = await window.electronAPI.listVibeFlowFiles({ workingDir })
            if (result.success && result.files) {
                // task 이름으로 파일 필터링 (파일명에 task 이름이 포함된 것만)
                const taskNameSafe = card.name.replace(/[^a-zA-Z0-9가-힣]/g, '_')
                const filteredFiles = {}

                Object.entries(result.files).forEach(([stage, files]) => {
                    const filtered = files.filter(file =>
                        file.name.includes(taskNameSafe) ||
                        file.name.toLowerCase().includes(card.name.toLowerCase().replace(/\s+/g, '_'))
                    )
                    if (filtered.length > 0) {
                        filteredFiles[stage] = filtered
                    }
                })

                setGeneratedFiles(filteredFiles)
            }
        }
        loadGeneratedFiles()
    }, [workingDir, isRunning, card.name])

    // 양방향 통신 - 질문 이벤트 리스너
    useEffect(() => {
        if (!window.electronAPI?.onClaudeQuestion) return

        const handleQuestion = (data) => {
            console.log('Claude 질문 수신:', data)
            if (data.processId === activeProcessId) {
                setPendingQuestion({
                    processId: data.processId,
                    question: data.question
                })
                // 대화 기록에 질문 추가 (특별 표시)
                setConversationHistory(prev => [...prev, {
                    type: 'question',
                    content: data.question,
                    timestamp: new Date()
                }])
            }
        }

        window.electronAPI.onClaudeQuestion(handleQuestion)

        return () => {
            if (window.electronAPI?.removeClaudeQuestionListener) {
                window.electronAPI.removeClaudeQuestionListener()
            }
        }
    }, [activeProcessId])

    // 완료 알림 깜빡임 효과 & 자동 해제
    useEffect(() => {
        if (completionNotice) {
            const timer = setTimeout(() => {
                setCompletionNotice(null)
            }, 5000)
            return () => clearTimeout(timer)
        }
    }, [completionNotice])

    // 대화 기록 자동 스크롤
    useEffect(() => {
        if (conversationEndRef.current) {
            conversationEndRef.current.scrollIntoView({ behavior: 'smooth' })
        }
    }, [conversationHistory])

    // 사용자 응답 전송
    const handleSendResponse = async () => {
        if (!pendingQuestion || !userResponse.trim()) return

        try {
            const result = await window.electronAPI.respondToClaude(
                pendingQuestion.processId,
                userResponse.trim()
            )
            if (result.success) {
                // 대화 기록에 사용자 응답 추가
                setConversationHistory(prev => [...prev, {
                    type: 'user',
                    content: userResponse.trim(),
                    timestamp: new Date()
                }])
                setOutput(prev => prev + `\n\n📝 사용자 응답: ${userResponse}\n`)
                setUserResponse('')
                setPendingQuestion(null)
            } else {
                console.error('응답 전송 실패:', result.error)
            }
        } catch (err) {
            console.error('응답 전송 에러:', err)
        }
    }

    // Claude 프로세스 취소
    const handleCancelClaude = async () => {
        if (!activeProcessId) return

        try {
            await window.electronAPI.closeClaude(activeProcessId)
            setIsRunning(false)
            setIsInteractiveSession(false)
            setPendingQuestion(null)
            setActiveProcessId(null)
            setCompletionNotice({
                type: 'error',
                message: '⚠️ Claude 실행이 취소되었습니다.'
            })
        } catch (err) {
            console.error('프로세스 취소 에러:', err)
        }
    }

    // 단일 단계 실행
    const executeStage = async (stage, prompt, useInteractive = false) => {
        if (!window.electronAPI) {
            throw new Error('Electron API not available')
        }

        const agent = getAgentForStage(stage)

        // 디버그 로깅
        console.log('=== executeStage 디버그 ===')
        console.log('단계:', stage)
        console.log('에이전트:', agent)
        console.log('에이전트 이름:', agent?.name)
        console.log('모델:', agent?.model)
        console.log('권한 모드:', agent?.permissionMode)
        console.log('대화형 모드:', useInteractive)

        // 에이전트가 없을 때 기본값 (진행 단계는 특별 처리)
        const agentName = agent?.name || `vfm-${stage === '초안' ? 'draft' : stage === '플랜' ? 'plan' : stage === '진행' ? 'progress' : stage === '검증' ? 'verify' : 'complete'}`
        const model = agent?.model || 'sonnet'
        // 진행 단계는 반드시 acceptEdits 필요 (코드 생성을 위해)
        const permissionMode = agent?.permissionMode || (stage === '진행' ? 'acceptEdits' : 'default')

        console.log('실제 사용 값 - 에이전트:', agentName, '모델:', model, '권한:', permissionMode)

        // taskId 생성 (대화형 모드용)
        const taskId = `${card.id}-${Date.now()}`
        if (useInteractive) {
            setActiveProcessId(taskId)
            setIsInteractiveSession(true)
        }

        // 대화 기록 초기화 및 시작 메시지
        setConversationHistory([{
            type: 'system',
            content: `🚀 ${stage} 단계 실행 시작 (에이전트: ${agentName})`,
            timestamp: new Date()
        }])

        // 출력 버퍼 (청크 단위로 들어오므로 문장 단위로 모아서 처리)
        let outputBuffer = ''

        // 실시간 출력 수신
        const outputHandler = (data) => {
            if (data.data) {
                setOutput(prev => prev + data.data)

                // 대화 기록에 Claude 출력 추가 (줄바꿈 기준으로 분리)
                outputBuffer += data.data
                const lines = outputBuffer.split('\n')

                // 마지막 줄은 아직 완성되지 않았을 수 있으므로 버퍼에 유지
                outputBuffer = lines.pop() || ''

                // 완성된 줄들을 대화 기록에 추가
                lines.forEach(line => {
                    const trimmed = line.trim()
                    if (trimmed) {
                        setConversationHistory(prev => {
                            // 중복 방지: 같은 내용이 마지막에 있으면 추가하지 않음
                            const last = prev[prev.length - 1]
                            if (last?.type === 'claude' && last?.content === trimmed) {
                                return prev
                            }
                            return [...prev, {
                                type: 'claude',
                                content: trimmed,
                                timestamp: new Date()
                            }]
                        })
                    }
                })
            }
        }
        window.electronAPI.onClaudeOutput(outputHandler)

        try {
            const result = await window.electronAPI.runClaude({
                workingDir,
                prompt,
                mode: executionMode,
                agent: agentName,
                model: model,
                permissionMode: permissionMode,
                taskId: taskId,
                interactive: useInteractive
            })

            // 응답 저장
            if (result.stdout && workingDir) {
                await window.electronAPI.saveClaudeResponse({
                    workingDir,
                    stage,
                    taskName: card.name,
                    response: result.stdout,
                    prompt
                })
            }

            // 대화형 모드 상태 정리
            if (useInteractive) {
                setActiveProcessId(null)
                setIsInteractiveSession(false)
                setPendingQuestion(null)
            }

            return { success: true, output: result.stdout }
        } catch (err) {
            // 대화형 모드 상태 정리
            if (useInteractive) {
                setActiveProcessId(null)
                setIsInteractiveSession(false)
                setPendingQuestion(null)
            }
            return { success: false, error: err.message }
        }
    }

    // Orchestrator로 라우팅 판단
    const consultOrchestrator = async (userRequest) => {
        try {
            const completedStages = Object.keys(card.stages).filter(s => card.stages[s]?.status === 'done')

            const orchestratorPrompt = `## Task Context
- Name: ${card.name}
- Description: ${card.description || 'No description'}
- Current Stage: ${card.currentStage}
- Completed Stages: ${completedStages.join(', ') || 'None'}

## User Request
${userRequest}

## Your Job
Determine if this request is appropriate for the current stage (${card.currentStage}).
Respond in JSON format as specified in your instructions.`

            const result = await window.electronAPI.runClaude({
                workingDir,
                prompt: orchestratorPrompt,
                agent: 'vfm-orchestrator',
                model: 'sonnet',
                permissionMode: 'default'
            })

            if (!result.stdout) {
                return null
            }

            // JSON 추출 (마크다운 코드 블록 제거)
            const jsonMatch = result.stdout.match(/```json\s*([\s\S]*?)\s*```/) ||
                             result.stdout.match(/\{[\s\S]*\}/)

            if (jsonMatch) {
                const jsonStr = jsonMatch[1] || jsonMatch[0]
                return JSON.parse(jsonStr)
            }

            return null
        } catch (err) {
            console.warn('Orchestrator 호출 실패:', err)
            return null // Orchestrator 실패 시 현재 단계로 진행
        }
    }

    // 현재 단계 실행
    const handleExecute = async () => {
        setIsRunning(true)
        setOutput('')
        setCompletionNotice(null)

        const fullPrompt = additionalInstruction
            ? `${basePrompt}\n\n## 추가 지침\n${additionalInstruction}`
            : basePrompt

        try {
            // Orchestrator 판단 (사용자가 추가 지시를 입력한 경우에만)
            if (additionalInstruction?.trim()) {
                setOutput('🔍 Orchestrator가 요청을 분석 중...\n\n')

                const routing = await consultOrchestrator(fullPrompt)

                if (routing && !routing.currentStageOk) {
                    // 단계 변경 제안
                    const confirmMessage = `⚠️ 단계 변경 제안

현재 요청: "${additionalInstruction}"

${routing.reasoning}

제안: "${routing.suggestedStage}" 단계로 이동
${routing.note || ''}

이 단계로 이동하시겠습니까?

[확인] - ${routing.suggestedStage} 단계로 이동
[취소] - 현재 단계(${card.currentStage})에서 실행`

                    if (window.confirm(confirmMessage)) {
                        // 단계 이동
                        setOutput(prev => prev + `\n✓ ${routing.suggestedStage} 단계로 이동합니다.\n\n`)
                        await setTaskStage(card.id, routing.suggestedStage)
                        setIsRunning(false)
                        return
                    } else {
                        setOutput(prev => prev + `\n→ 현재 단계(${card.currentStage})에서 계속 진행합니다.\n\n`)
                    }
                } else if (routing) {
                    setOutput(prev => prev + `✓ ${routing.reasoning}\n\n`)
                }
            }

            const result = await executeStage(card.currentStage, fullPrompt, useInteractiveMode)

            if (result.success) {
                // BLOCKED 상태 감지
                const isBlocked = result.output?.includes('## BLOCKED') ||
                                  result.output?.includes('**Status**: Cannot proceed')

                if (isBlocked) {
                    // BLOCKED - 완료 처리하지 않음
                    await updateTaskStage(card.id, card.currentStage, {
                        status: 'blocked',
                        logs: [...(card.stages[card.currentStage]?.logs || []), {
                            timestamp: new Date().toISOString(),
                            prompt: fullPrompt,
                            result: result.output,
                            agent: currentAgent?.name,
                            blocked: true
                        }]
                    })
                    // 차단 알림
                    setCompletionNotice({
                        type: 'error',
                        message: `🚫 ${card.currentStage} 단계 차단됨 - 전제조건 확인 필요`
                    })
                } else {
                    // 정상 완료
                    await updateTaskStage(card.id, card.currentStage, {
                        status: 'done',
                        logs: [...(card.stages[card.currentStage]?.logs || []), {
                            timestamp: new Date().toISOString(),
                            prompt: fullPrompt,
                            result: result.output,
                            agent: currentAgent?.name
                        }]
                    })
                    // 성공 알림
                    setCompletionNotice({
                        type: 'success',
                        message: `✅ ${card.currentStage} 단계 완료!`
                    })
                }
            } else {
                setOutput(prev => prev + `\n\nError: ${result.error}`)
                // 실패 알림
                setCompletionNotice({
                    type: 'error',
                    message: `❌ 실행 실패: ${result.error}`
                })
            }
        } catch (err) {
            setOutput(`Error: ${err.message}`)
            setCompletionNotice({
                type: 'error',
                message: `❌ 오류: ${err.message}`
            })
        } finally {
            setIsRunning(false)
        }
    }

    // 자동 진행 실행
    const handleAutoProgress = async () => {
        if (!autoProgressTarget) return

        setIsAutoProgressing(true)
        setAutoProgressLog([])
        setOutput('')

        const currentIdx = STAGES.indexOf(card.currentStage)
        const targetIdx = STAGES.indexOf(autoProgressTarget)

        for (let i = currentIdx; i <= targetIdx; i++) {
            const stage = STAGES[i]
            const stagePrompt = STAGE_PROMPTS[stage]?.(card) || ''

            if (!stagePrompt) {
                setAutoProgressLog(prev => [...prev, { stage, status: 'skipped', message: '프롬프트 없음' }])
                continue
            }

            setAutoProgressLog(prev => [...prev, { stage, status: 'running', message: '실행 중...' }])

            try {
                // 단계 시작 상태로 변경
                await setTaskStage(card.id, stage)

                const result = await executeStage(stage, stagePrompt)

                if (result.success) {
                    await updateTaskStage(card.id, stage, {
                        status: 'done',
                        logs: [...(card.stages[stage]?.logs || []), {
                            timestamp: new Date().toISOString(),
                            prompt: stagePrompt,
                            result: result.output,
                            autoProgress: true
                        }]
                    })

                    setAutoProgressLog(prev =>
                        prev.map(log =>
                            log.stage === stage
                                ? { ...log, status: 'completed', message: '완료' }
                                : log
                        )
                    )

                    // 다음 단계로 이동 (마지막이 아닌 경우)
                    if (i < targetIdx) {
                        await setTaskStage(card.id, STAGES[i + 1])
                    }
                } else {
                    setAutoProgressLog(prev =>
                        prev.map(log =>
                            log.stage === stage
                                ? { ...log, status: 'failed', message: result.error }
                                : log
                        )
                    )
                    break // 실패 시 중단
                }
            } catch (err) {
                setAutoProgressLog(prev =>
                    prev.map(log =>
                        log.stage === stage
                            ? { ...log, status: 'failed', message: err.message }
                            : log
                    )
                )
                break
            }
        }

        setIsAutoProgressing(false)
        setAutoProgressTarget('')

        // 완료 알림
        const completedCount = autoProgressLog.filter(l => l.status === 'completed').length
        const failedCount = autoProgressLog.filter(l => l.status === 'failed').length
        if (failedCount > 0) {
            setCompletionNotice({
                type: 'error',
                message: `⚠️ 자동 진행 중단: ${completedCount}개 완료, 1개 실패`
            })
        } else {
            setCompletionNotice({
                type: 'success',
                message: `✅ 자동 진행 완료: ${completedCount}개 단계 완료!`
            })
        }
    }

    // 파일 열기 (외부 편집기)
    const handleOpenFile = async (filePath) => {
        if (window.electronAPI?.openFile) {
            const result = await window.electronAPI.openFile(filePath)
            if (!result.success) {
                console.error('파일 열기 실패:', result.error)
            }
        }
    }

    // 다음 단계로 이동
    const handleNextStage = async () => {
        const currentIdx = STAGES.indexOf(card.currentStage)
        if (currentIdx < STAGES.length - 1) {
            await updateTaskStage(card.id, STAGES[currentIdx + 1], { status: 'in-progress' })
        }
    }

    // 자식 태스크 생성
    const handleSplit = async () => {
        const subTasks = splitInput.split('\n')
            .filter(line => line.trim())
            .map(line => ({
                name: line.trim(),
                description: `${card.name}의 하위 태스크`
            }))

        if (subTasks.length > 0) {
            await splitTask(card.id, subTasks)
            setShowSplitModal(false)
            setSplitInput('')
        }
    }

    // 통합 실행
    const handleIntegrate = async () => {
        if (!integrationReady) return

        setIsRunning(true)
        setOutput('')

        // 자식들의 결과 수집
        const childSummaries = childTasks.map(c => {
            const completeLogs = c.stages?.['완료']?.logs || []
            const lastLog = completeLogs[completeLogs.length - 1]
            return `### ${c.name}\n${lastLog?.result || '(결과 없음)'}`
        }).join('\n\n')

        const integrationPrompt = `다음 하위 태스크들을 통합해주세요:

${childSummaries}

통합 후 "${card.name}" 태스크가 정상 동작하는지 확인하세요.`

        try {
            const result = await executeStage(card.currentStage, integrationPrompt)

            if (result.success) {
                await setIntegrationStatus(card.id, 'integrated')
                // 검증 단계로 이동
                await setTaskStage(card.id, '검증')
            }
        } catch (err) {
            setOutput(`통합 실패: ${err.message}`)
        } finally {
            setIsRunning(false)
        }
    }

    return (
        <div className="card-detail-sidebar">
            {/* 진행 중 오버레이 */}
            {(isRunning || isAutoProgressing) && !pendingQuestion && (
                <div className="processing-overlay">
                    <div className="processing-content">
                        <div className="processing-spinner"></div>
                        <div className="processing-text">
                            {isAutoProgressing ? '🚀 자동 진행 중...' : '⚡ Claude 실행 중...'}
                        </div>
                        <div className="processing-stage">{card.currentStage}</div>
                        {isInteractiveSession && (
                            <button
                                className="btn-cancel"
                                onClick={handleCancelClaude}
                            >
                                ❌ 취소
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* 질문/응답 모달 (양방향 통신) */}
            {pendingQuestion && (
                <div className="question-modal-overlay">
                    <div className="question-modal">
                        <div className="question-header">
                            <span className="question-icon">🤔</span>
                            <h4>Claude가 응답을 기다리고 있습니다</h4>
                        </div>
                        <div className="question-content">
                            <pre className="question-text">{pendingQuestion.question}</pre>
                        </div>
                        <div className="response-input">
                            <textarea
                                value={userResponse}
                                onChange={(e) => setUserResponse(e.target.value)}
                                placeholder="응답을 입력하세요..."
                                rows={3}
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault()
                                        handleSendResponse()
                                    }
                                }}
                            />
                        </div>
                        <div className="question-actions">
                            <button
                                className="btn-secondary"
                                onClick={handleCancelClaude}
                            >
                                ❌ 취소
                            </button>
                            <button
                                className="btn-primary"
                                onClick={handleSendResponse}
                                disabled={!userResponse.trim()}
                            >
                                📤 응답 전송
                            </button>
                        </div>
                        <div className="quick-responses">
                            <span className="quick-label">빠른 응답:</span>
                            <button onClick={() => setUserResponse('yes')}>Yes</button>
                            <button onClick={() => setUserResponse('no')}>No</button>
                            <button onClick={() => setUserResponse('y')}>Y</button>
                            <button onClick={() => setUserResponse('n')}>N</button>
                            <button onClick={() => setUserResponse('')}>(Enter)</button>
                        </div>
                    </div>
                </div>
            )}

            {/* 완료 알림 (깜빡임) */}
            {completionNotice && (
                <div
                    ref={notificationRef}
                    className={`completion-notice ${completionNotice.type} blink`}
                >
                    {completionNotice.message}
                    <button
                        className="notice-close"
                        onClick={() => setCompletionNotice(null)}
                    >
                        ×
                    </button>
                </div>
            )}

            <div className="sidebar-header">
                <h3>{card.name}</h3>
                <button className="close-btn" onClick={onClose}>×</button>
            </div>

            <div className="sidebar-content">
                {/* 현재 상태 */}
                <div className="card-status-header">
                    <div
                        className="stage-badge"
                        style={{ backgroundColor: STAGE_COLORS[card.currentStage] }}
                    >
                        {card.currentStage}
                    </div>
                    {card.parentId && (
                        <span className="child-badge">하위 작업</span>
                    )}
                </div>

                <p className="card-description">{card.description}</p>

                {/* 에이전트 정보 */}
                {currentAgent && (
                    <div className="section agent-info">
                        <h4>🤖 현재 에이전트</h4>
                        <div className="agent-card">
                            <span className="agent-name">{currentAgent.name}</span>
                            <span className="agent-model">{currentAgent.model}</span>
                            {currentAgent.permissionMode === 'acceptEdits' && (
                                <span className="agentic-badge">Agentic</span>
                            )}
                        </div>
                        <p className="agent-desc">{currentAgent.description}</p>
                    </div>
                )}

                {/* 자식 태스크 정보 */}
                {childTasks.length > 0 && (
                    <div className="section children-info">
                        <h4>📦 하위 태스크</h4>
                        <div className="children-list">
                            {childTasks.map(child => (
                                <div key={child.id} className="child-item">
                                    <span className="child-name">{child.name}</span>
                                    <span
                                        className="child-stage"
                                        style={{ color: STAGE_COLORS[child.currentStage] }}
                                    >
                                        {child.currentStage}
                                    </span>
                                </div>
                            ))}
                        </div>
                        {integrationReady && (
                            <div className="integration-ready-notice">
                                ✨ 모든 하위 태스크가 완료되었습니다. 통합을 실행하세요.
                            </div>
                        )}
                    </div>
                )}

                {/* 기본 지침 */}
                <div className="section">
                    <h4>📝 기본 지침</h4>
                    <pre className="base-prompt">{basePrompt || '(이 단계에는 기본 지침이 없습니다)'}</pre>
                </div>

                {/* 추가 지침 */}
                <div className="section">
                    <h4>✏️ 추가 지침</h4>
                    <textarea
                        value={additionalInstruction}
                        onChange={(e) => setAdditionalInstruction(e.target.value)}
                        placeholder="추가 지침을 입력하세요..."
                        rows={4}
                        disabled={isRunning || isAutoProgressing}
                    />
                </div>

                {/* 실행 모드 */}
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
                                disabled={isRunning || isAutoProgressing}
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
                                disabled={isRunning || isAutoProgressing}
                            />
                            이어가기 (-c)
                        </label>
                    </div>

                    {/* 대화형 모드 토글 */}
                    <div className="interactive-mode-toggle" style={{ marginTop: '0.75rem' }}>
                        <input
                            type="checkbox"
                            id="interactiveMode"
                            checked={useInteractiveMode}
                            onChange={(e) => setUseInteractiveMode(e.target.checked)}
                            disabled={isRunning || isAutoProgressing}
                        />
                        <label htmlFor="interactiveMode">
                            💬 대화형 모드 (Claude 질문에 응답 가능)
                        </label>
                        <span className="help-icon" title="Claude가 질문할 때 직접 응답할 수 있습니다">ⓘ</span>
                    </div>
                </div>

                {/* 자동 진행 */}
                {remainingStages.length > 0 && (
                    <div className="section auto-progress-section">
                        <h4>🚀 자동 진행</h4>
                        <div className="auto-progress-controls">
                            <select
                                value={autoProgressTarget}
                                onChange={(e) => setAutoProgressTarget(e.target.value)}
                                disabled={isRunning || isAutoProgressing}
                            >
                                <option value="">목표 단계 선택...</option>
                                {remainingStages.map(stage => (
                                    <option key={stage} value={stage}>
                                        {stage}까지 자동 진행
                                    </option>
                                ))}
                            </select>
                            <button
                                className="btn-primary btn-auto"
                                onClick={handleAutoProgress}
                                disabled={!autoProgressTarget || isRunning || isAutoProgressing}
                            >
                                {isAutoProgressing ? '⏳ 진행 중...' : '▶️ 자동 실행'}
                            </button>
                        </div>

                        {/* 자동 진행 로그 */}
                        {autoProgressLog.length > 0 && (
                            <div className="auto-progress-log">
                                {autoProgressLog.map((log, idx) => (
                                    <div key={idx} className={`log-item ${log.status}`}>
                                        <span className="log-stage">{log.stage}</span>
                                        <span className="log-status">
                                            {log.status === 'running' && '⏳'}
                                            {log.status === 'completed' && '✅'}
                                            {log.status === 'failed' && '❌'}
                                            {log.status === 'skipped' && '⏭️'}
                                        </span>
                                        <span className="log-message">{log.message}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* 액션 버튼 */}
                <div className="action-buttons">
                    <button
                        className="btn-primary"
                        onClick={handleExecute}
                        disabled={isRunning || isAutoProgressing || !basePrompt}
                    >
                        {isRunning ? '⏳ 실행 중...' : '▶️ 현재 단계 실행'}
                    </button>

                    {integrationReady && (
                        <button
                            className="btn-primary btn-integrate"
                            onClick={handleIntegrate}
                            disabled={isRunning || isAutoProgressing}
                        >
                            🔗 통합 실행
                        </button>
                    )}

                    <button
                        className="btn-secondary"
                        onClick={handleNextStage}
                        disabled={isRunning || isAutoProgressing || card.currentStage === '완료'}
                    >
                        → 다음 단계
                    </button>

                    <button
                        className="btn-secondary"
                        onClick={() => setShowSplitModal(true)}
                        disabled={isRunning || isAutoProgressing}
                    >
                        🔀 분해
                    </button>

                    <button
                        className="btn-secondary"
                        onClick={() => setShowStageSelector(true)}
                        disabled={isRunning || isAutoProgressing}
                    >
                        🔄 상태 변경
                    </button>

                    <button
                        className="btn-secondary btn-danger"
                        onClick={async () => {
                            if (confirm(`"${card.name}" 태스크를 삭제하시겠습니까?`)) {
                                await deleteTask(card.id)
                                onClose()
                            }
                        }}
                        disabled={isRunning || isAutoProgressing}
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
                                    style={{
                                        borderColor: card.currentStage === stage ? STAGE_COLORS[stage] : undefined
                                    }}
                                    onClick={async () => {
                                        await setTaskStage(card.id, stage)
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

                {/* 대화 기록 (실시간) */}
                {(isRunning || conversationHistory.length > 0) && (
                    <div className="section conversation-section">
                        <h4>💬 대화 기록</h4>
                        <div className="conversation-container">
                            {conversationHistory.map((msg, idx) => (
                                <div key={idx} className={`conversation-message ${msg.type}`}>
                                    <span className="message-icon">
                                        {msg.type === 'claude' && '🤖'}
                                        {msg.type === 'user' && '👤'}
                                        {msg.type === 'system' && 'ℹ️'}
                                        {msg.type === 'question' && '❓'}
                                    </span>
                                    <span className="message-content">{msg.content}</span>
                                    <span className="message-time">
                                        {msg.timestamp.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                    </span>
                                </div>
                            ))}
                            <div ref={conversationEndRef} />
                        </div>
                        {conversationHistory.length > 0 && !isRunning && (
                            <button
                                className="btn-secondary btn-small"
                                onClick={() => setConversationHistory([])}
                                style={{ marginTop: '0.5rem' }}
                            >
                                🗑️ 기록 지우기
                            </button>
                        )}
                    </div>
                )}

                {/* 실행 결과 (전체 출력) */}
                {output && (
                    <div className="section">
                        <h4>📊 실행 결과 (Raw)</h4>
                        <pre className="output">{output}</pre>
                    </div>
                )}

                {/* 생성된 문서/파일 */}
                <div className="section generated-files-section">
                    <h4
                        className="files-header clickable"
                        onClick={() => setShowFilesSection(!showFilesSection)}
                    >
                        📁 생성된 문서
                        <span className="expand-icon">{showFilesSection ? '▼' : '▶'}</span>
                        {Object.values(generatedFiles).flat().length > 0 && (
                            <span className="files-count">
                                ({Object.values(generatedFiles).flat().length}개)
                            </span>
                        )}
                    </h4>

                    {showFilesSection && (
                        <div className="files-content">
                            {Object.keys(generatedFiles).length === 0 ? (
                                <p className="no-files">아직 생성된 문서가 없습니다.</p>
                            ) : (
                                Object.entries(generatedFiles).map(([stage, files]) => (
                                    <div key={stage} className="files-stage-group">
                                        <div className="files-stage-name">{stage}</div>
                                        <div className="files-list">
                                            {files.map((file, idx) => (
                                                <div
                                                    key={idx}
                                                    className="file-item"
                                                    onClick={() => handleOpenFile(file.path)}
                                                    title={file.path}
                                                >
                                                    <span className="file-icon">📄</span>
                                                    <span className="file-name">{file.name}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* 분해 모달 */}
            {showSplitModal && (
                <div className="modal-overlay">
                    <div className="modal">
                        <h3>태스크 분해</h3>
                        <p>하위 태스크를 한 줄에 하나씩 입력하세요:</p>
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
