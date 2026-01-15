import { useState, useMemo } from 'react'
import useProjectStore from '../store/projectStore'

const STAGES = ['초안', '플랜', '진행', '검증', '완료']
const STAGE_ICONS = {
    '초안': '📝',
    '플랜': '📋',
    '진행': '🔄',
    '검증': '🧪',
    '완료': '✅'
}

const STAGE_COLORS = {
    '초안': '#f59e0b',
    '플랜': '#3b82f6',
    '진행': '#10b981',
    '검증': '#f97316',
    '완료': '#8b5cf6'
}

// TaskRow 컴포넌트
function TaskRow({ task, allTasks, depth, expandedTasks, onToggle, onStageClick, onTaskClick }) {
    const children = allTasks.filter(t => t.parentId === task.id)
    const hasChildren = children.length > 0
    const isExpanded = expandedTasks.has(task.id)

    // 자식 완료 상태 계산
    const childrenStatus = hasChildren ? {
        total: children.length,
        completed: children.filter(t => t.currentStage === '완료').length
    } : null

    return (
        <>
            <tr className={`task-row depth-${depth}`}>
                {/* 태스크명 셀 */}
                <td className="task-name-cell" onClick={() => onTaskClick(task)}>
                    <div className="task-name-content" style={{ paddingLeft: `${depth * 20}px` }}>
                        {/* 펼침/접힘 버튼 */}
                        {hasChildren ? (
                            <button
                                className="expand-btn"
                                onClick={(e) => { e.stopPropagation(); onToggle(task.id) }}
                            >
                                {isExpanded ? '▼' : '▶'}
                            </button>
                        ) : (
                            <span className="expand-placeholder"></span>
                        )}

                        {depth > 0 && <span className="child-indicator">↳</span>}

                        <div className="task-info">
                            <span className="task-name">{task.name}</span>
                            {childrenStatus && (
                                <span className="children-badge">
                                    {childrenStatus.completed}/{childrenStatus.total}
                                </span>
                            )}
                        </div>
                    </div>
                </td>

                {/* 스테이지 셀들 */}
                {STAGES.map(stage => {
                    const isCurrentStage = task.currentStage === stage
                    return (
                        <td
                            key={stage}
                            className={`stage-cell ${isCurrentStage ? 'active' : ''}`}
                            onClick={() => onStageClick(task.id, stage)}
                            style={{
                                '--stage-color': STAGE_COLORS[stage]
                            }}
                        >
                            <div className={`stage-marker ${isCurrentStage ? 'current' : 'inactive'}`}>
                                {isCurrentStage && STAGE_ICONS[stage]}
                            </div>
                        </td>
                    )
                })}
            </tr>

            {/* 하위 태스크 (펼쳐진 경우) */}
            {isExpanded && children.map(child => (
                <TaskRow
                    key={child.id}
                    task={child}
                    allTasks={allTasks}
                    depth={depth + 1}
                    expandedTasks={expandedTasks}
                    onToggle={onToggle}
                    onStageClick={onStageClick}
                    onTaskClick={onTaskClick}
                />
            ))}
        </>
    )
}

function KanbanBoard({ project, onCardSelect }) {
    const { updateTaskStage } = useProjectStore()
    const [expandedTasks, setExpandedTasks] = useState(new Set())

    // 최상위 태스크만 가져오기
    const rootTasks = useMemo(() => {
        return project.tasks.filter(t => !t.parentId)
    }, [project.tasks])

    // 전체 통계
    const stats = useMemo(() => {
        const total = project.tasks.length
        const byStage = STAGES.reduce((acc, stage) => {
            acc[stage] = project.tasks.filter(t => t.currentStage === stage).length
            return acc
        }, {})
        return { total, byStage }
    }, [project.tasks])

    // 펼침/접힘 토글
    const toggleExpand = (taskId) => {
        setExpandedTasks(prev => {
            const next = new Set(prev)
            if (next.has(taskId)) {
                next.delete(taskId)
            } else {
                next.add(taskId)
            }
            return next
        })
    }

    // 스테이지 클릭 핸들러
    const handleStageClick = async (taskId, stage) => {
        await updateTaskStage(taskId, stage, { status: 'in-progress' })
    }

    // 태스크 클릭 핸들러
    const handleTaskClick = (task) => {
        onCardSelect(task)
    }

    return (
        <div className="kanban-grid-container">
            {/* 통계 바 */}
            <div className="stats-bar">
                <span className="stat-total">전체: {stats.total}</span>
                <div className="stat-stages">
                    {STAGES.map(stage => (
                        <span
                            key={stage}
                            className="stat-stage"
                            style={{ color: STAGE_COLORS[stage] }}
                        >
                            {STAGE_ICONS[stage]} {stats.byStage[stage]}
                        </span>
                    ))}
                </div>
            </div>

            {/* 칸반 그리드 (스프레드시트 스타일) */}
            <div className="kanban-grid-wrapper">
                <table className="kanban-grid">
                    <thead>
                        <tr>
                            <th className="task-header">태스크</th>
                            {STAGES.map(stage => (
                                <th
                                    key={stage}
                                    className="stage-header"
                                    style={{ color: STAGE_COLORS[stage] }}
                                >
                                    <span className="stage-icon">{STAGE_ICONS[stage]}</span>
                                    <span className="stage-name">{stage}</span>
                                    <span className="stage-count">{stats.byStage[stage]}</span>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rootTasks.length > 0 ? (
                            rootTasks.map(task => (
                                <TaskRow
                                    key={task.id}
                                    task={task}
                                    allTasks={project.tasks}
                                    depth={0}
                                    expandedTasks={expandedTasks}
                                    onToggle={toggleExpand}
                                    onStageClick={handleStageClick}
                                    onTaskClick={handleTaskClick}
                                />
                            ))
                        ) : (
                            <tr>
                                <td colSpan={6} className="empty-message">
                                    태스크가 없습니다
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

export default KanbanBoard
