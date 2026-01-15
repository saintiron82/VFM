import { useState, useEffect } from 'react'
import ProjectInput from './components/ProjectInput'
import DockLayout from './components/DockLayout'
import useProjectStore from './store/projectStore'

function App() {
    const {
        currentProject,
        registeredProjects,
        loadRegisteredProjects,
        openProject
    } = useProjectStore()
    const [selectedCard, setSelectedCard] = useState(null)
    const [showProjectInput, setShowProjectInput] = useState(false)

    useEffect(() => {
        loadRegisteredProjects()
    }, [])

    const handleProjectSelect = async (projectPath) => {
        if (projectPath) {
            await openProject(projectPath)
        }
    }

    const handleOpenDocument = (filePath) => {
        // 문서 열기 이벤트 처리 - DockLayout에서 처리
        console.log('Open document:', filePath)
    }

    return (
        <div className="app">
            {/* 헤더 */}
            <header className="header">
                <h1>🚀 Vibe Flow Manager</h1>
                <div className="header-actions">
                    <select
                        value={currentProject?.workingDir || ''}
                        onChange={(e) => handleProjectSelect(e.target.value)}
                    >
                        <option value="">프로젝트 선택...</option>
                        {registeredProjects.map(p => (
                            <option key={p.path} value={p.path}>{p.name}</option>
                        ))}
                    </select>
                    <button onClick={() => setShowProjectInput(true)}>+ 새 프로젝트</button>
                </div>
            </header>

            {/* 도킹 레이아웃 */}
            {!currentProject ? (
                <main className="main-content">
                    <div className="empty-state">
                        <h2>프로젝트를 선택하거나 새로 만드세요</h2>
                        <p>프로젝트 목표를 입력하면 AI가 자동으로 태스크를 분해합니다.</p>
                        <button onClick={() => setShowProjectInput(true)}>새 프로젝트 시작</button>
                    </div>
                </main>
            ) : (
                <DockLayout
                    project={currentProject}
                    selectedCard={selectedCard}
                    onCardSelect={setSelectedCard}
                    onOpenDocument={handleOpenDocument}
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
