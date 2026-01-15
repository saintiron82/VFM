import { useState } from 'react'
import useProjectStore from '../store/projectStore'

const STAGES = ['초안', '플랜', '진행', '검증', '완료']
const STAGE_ICONS = {
    '초안': '📝',
    '플랜': '📋',
    '진행': '🔄',
    '검증': '🧪',
    '완료': '✅'
}

function KanbanBoard({ project, onCardSelect }) {
    const { updateComponentStage } = useProjectStore()
    const [draggedCard, setDraggedCard] = useState(null)

    const getComponentsByStage = (stage) => {
        return project.components.filter(c => c.currentStage === stage && !c.parentId)
    }

    const handleDragStart = (e, component) => {
        setDraggedCard(component)
        e.dataTransfer.effectAllowed = 'move'
    }

    const handleDragOver = (e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
    }

    const handleDrop = async (e, stage) => {
        e.preventDefault()
        if (draggedCard && draggedCard.currentStage !== stage) {
            await updateComponentStage(draggedCard.id, stage, { status: 'in-progress' })
        }
        setDraggedCard(null)
    }

    return (
        <div className="kanban-board">
            {STAGES.map(stage => (
                <div
                    key={stage}
                    className="kanban-column"
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, stage)}
                >
                    <div className="column-header">
                        <span className="stage-icon">{STAGE_ICONS[stage]}</span>
                        <span className="stage-name">{stage}</span>
                        <span className="card-count">{getComponentsByStage(stage).length}</span>
                    </div>

                    <div className="column-cards">
                        {getComponentsByStage(stage).map(component => (
                            <div
                                key={component.id}
                                className={`kanban-card ${draggedCard?.id === component.id ? 'dragging' : ''}`}
                                draggable
                                onDragStart={(e) => handleDragStart(e, component)}
                                onClick={() => onCardSelect(component)}
                            >
                                <div className="card-title">{component.name}</div>
                                <div className="card-description">{component.description}</div>
                                {component.childIds?.length > 0 && (
                                    <div className="card-children">
                                        🔀 {component.childIds.length}개 하위 작업
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    )
}

export default KanbanBoard
