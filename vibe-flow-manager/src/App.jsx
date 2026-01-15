import { useState, useEffect } from 'react'
import ProjectInput from './components/ProjectInput'
import KanbanBoard from './components/KanbanBoard'
import CardDetail from './components/CardDetail'
import useProjectStore from './store/projectStore'

function App() {
    const { currentProject, projects, loadProjects, setCurrentProject } = useProjectStore()
    const [selectedCard, setSelectedCard] = useState(null)
    const [showProjectInput, setShowProjectInput] = useState(false)

    useEffect(() => {
        loadProjects()
    }, [])

    return (
        <div className="app">
            {/* 헤더 */}
            <header className="header">
                <h1>🚀 Vibe Flow Manager</h1>
                <div className="header-actions">
                    <select
                        value={currentProject?.id || ''}
                        onChange={(e) => {
                            const proj = projects.find(p => p.id === e.target.value)
                            setCurrentProject(proj)
                        }}
                    >
                        <option value="">프로젝트 선택...</option>
                        {projects.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                    <button onClick={() => setShowProjectInput(true)}>+ 새 프로젝트</button>
                </div>
            </header>

            {/* 메인 영역 */}
            <main className="main-content">
                {!currentProject ? (
                    <div className="empty-state">
                        <h2>프로젝트를 선택하거나 새로 만드세요</h2>
                        <p>프로젝트 목표를 입력하면 AI가 자동으로 작업을 분해합니다.</p>
                        <button onClick={() => setShowProjectInput(true)}>새 프로젝트 시작</button>
                    </div>
                ) : (
                    <div className="project-view">
                        <div className="project-header">
                            <h2>📌 {currentProject.goal}</h2>
                        </div>

                        <KanbanBoard
                            project={currentProject}
                            onCardSelect={setSelectedCard}
                        />
                    </div>
                )}
            </main>

            {/* 카드 상세 사이드바 */}
            {selectedCard && (
                <CardDetail
                    card={selectedCard}
                    onClose={() => setSelectedCard(null)}
                />
            )}

            {/* 프로젝트 입력 모달 */}
            {showProjectInput && (
                <ProjectInput onClose={() => setShowProjectInput(false)} />
            )}
        </div>
    )
}

export default App
