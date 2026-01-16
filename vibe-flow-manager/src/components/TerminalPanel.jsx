import { useState } from 'react'
import Terminal from './Terminal'
import useProjectStore from '../store/projectStore'

function TerminalPanel({ visible = true, onToggle, embedded = false }) {
    const { currentProject } = useProjectStore()
    const [sessions, setSessions] = useState([])
    const [activeSession, setActiveSession] = useState(null)

    // 새 터미널 생성
    const createSession = (cwd = null, title = null, taskId = null) => {
        const sessionId = `term_${Date.now()}`
        const workingDir = cwd || currentProject?.workingDir || process.cwd()
        const sessionTitle = title || `터미널 ${sessions.length + 1}`

        const newSession = {
            sessionId,
            cwd: workingDir,
            title: sessionTitle,
            taskId
        }

        setSessions(prev => [...prev, newSession])
        setActiveSession(sessionId)
    }

    // 세션 닫기
    const closeSession = (sessionId) => {
        setSessions(prev => prev.filter(s => s.sessionId !== sessionId))

        // 활성 세션이 닫힌 경우 다른 세션으로 전환
        if (activeSession === sessionId) {
            const remainingSessions = sessions.filter(s => s.sessionId !== sessionId)
            setActiveSession(remainingSessions.length > 0 ? remainingSessions[0].sessionId : null)
        }
    }

    // embedded 모드가 아니고 visible이 false면 렌더링하지 않음
    if (!embedded && !visible) return null

    // embedded 모드에서는 다른 클래스 사용
    const panelClass = embedded ? 'terminal-panel-embedded' : 'terminal-panel'

    return (
        <div className={panelClass}>
            <div className="terminal-header">
                <div className="terminal-tabs">
                    {sessions.map(s => (
                        <div
                            key={s.sessionId}
                            className={`terminal-tab ${activeSession === s.sessionId ? 'active' : ''}`}
                        >
                            <span
                                className="tab-title"
                                onClick={() => setActiveSession(s.sessionId)}
                            >
                                🔧 {s.title}
                            </span>
                            <button
                                className="tab-close"
                                onClick={() => closeSession(s.sessionId)}
                            >
                                ×
                            </button>
                        </div>
                    ))}
                    <button
                        className="terminal-new-tab"
                        onClick={() => createSession()}
                        title="새 터미널"
                    >
                        +
                    </button>
                </div>

                {/* embedded 모드에서는 토글 버튼 숨김 */}
                {!embedded && onToggle && (
                    <div className="terminal-actions">
                        <button
                            className="terminal-action-btn"
                            onClick={onToggle}
                            title="터미널 닫기"
                        >
                            ▼
                        </button>
                    </div>
                )}
            </div>

            <div className="terminal-content">
                {sessions.length === 0 ? (
                    <div className="terminal-empty">
                        <p>터미널 세션이 없습니다</p>
                        <button onClick={() => createSession()}>새 터미널 시작</button>
                    </div>
                ) : (
                    sessions.map(s => (
                        <div
                            key={s.sessionId}
                            className="terminal-session"
                            style={{ display: activeSession === s.sessionId ? 'block' : 'none' }}
                        >
                            <Terminal
                                sessionId={s.sessionId}
                                cwd={s.cwd}
                                title={s.title}
                                onClose={() => closeSession(s.sessionId)}
                            />
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}

export default TerminalPanel

