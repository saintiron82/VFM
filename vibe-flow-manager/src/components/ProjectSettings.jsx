import { useState, useEffect } from 'react'
import useProjectStore from '../store/projectStore'

const STAGES = ['초안', '플랜', '진행', '검증', '완료']

const STAGE_COLORS = {
    '초안': '#f59e0b',
    '플랜': '#3b82f6',
    '진행': '#10b981',
    '검증': '#f97316',
    '완료': '#8b5cf6'
}

const STAGE_DESCRIPTIONS = {
    '초안': '요구사항 조사 및 기술 분석',
    '플랜': '구현 계획 및 아키텍처 설계',
    '진행': '실제 코드 구현 (Agentic Mode)',
    '검증': '코드 리뷰, 테스트, 품질 검사',
    '완료': '문서화 및 최종 정리'
}

const DEFAULT_FILE_ASSOCIATIONS = {
    'js,jsx,ts,tsx,json,html,css,md': 'vscode',
    'txt,log': 'notepad',
    'png,jpg,jpeg,gif,svg': 'default',
    'pdf': 'default'
}

const EDITOR_OPTIONS = [
    { value: 'vscode', label: 'VS Code' },
    { value: 'notepad', label: '메모장' },
    { value: 'notepad++', label: 'Notepad++' },
    { value: 'default', label: '기본 프로그램' },
    { value: 'custom', label: '직접 지정...' }
]

function ProjectSettings({ projectPath, onClose }) {
    const { vfmConfig, availableAgents, updateVfmConfig } = useProjectStore()

    const [config, setConfig] = useState(null)
    const [isSaving, setIsSaving] = useState(false)
    const [hasChanges, setHasChanges] = useState(false)
    const [activeTab, setActiveTab] = useState('agents') // agents, files, explorer
    const [newExtension, setNewExtension] = useState('')
    const [newEditor, setNewEditor] = useState('vscode')
    const [customEditorPath, setCustomEditorPath] = useState('')

    // 설정 로드
    useEffect(() => {
        if (vfmConfig) {
            setConfig({
                ...vfmConfig,
                fileAssociations: vfmConfig.fileAssociations || DEFAULT_FILE_ASSOCIATIONS,
                explorerSettings: vfmConfig.explorerSettings || {
                    showHiddenFiles: true,
                    defaultEditor: 'vscode',
                    customEditorPath: ''
                }
            })
        }
    }, [vfmConfig])

    // 단계별 에이전트 변경
    const handleAgentChange = (stage, agentName) => {
        setConfig(prev => ({
            ...prev,
            stageAgents: {
                ...prev.stageAgents,
                [stage]: agentName
            }
        }))
        setHasChanges(true)
    }

    // 설정 저장
    const handleSave = async () => {
        if (!hasChanges) return

        setIsSaving(true)
        try {
            await updateVfmConfig(config)
            setHasChanges(false)
        } catch (err) {
            console.error('설정 저장 에러:', err)
            alert('설정 저장에 실패했습니다.')
        } finally {
            setIsSaving(false)
        }
    }

    // 선택된 에이전트 정보 가져오기
    const getAgentInfo = (agentName) => {
        return availableAgents.find(a => a.name === agentName)
    }

    // 파일 연결 추가
    const handleAddFileAssociation = () => {
        if (!newExtension.trim()) return

        const editor = newEditor === 'custom' ? customEditorPath : newEditor
        if (!editor) return

        setConfig(prev => ({
            ...prev,
            fileAssociations: {
                ...prev.fileAssociations,
                [newExtension.trim().toLowerCase()]: editor
            }
        }))
        setNewExtension('')
        setNewEditor('vscode')
        setCustomEditorPath('')
        setHasChanges(true)
    }

    // 파일 연결 삭제
    const handleRemoveFileAssociation = (ext) => {
        setConfig(prev => {
            const newAssoc = { ...prev.fileAssociations }
            delete newAssoc[ext]
            return { ...prev, fileAssociations: newAssoc }
        })
        setHasChanges(true)
    }

    // 파일 연결 변경
    const handleFileAssociationChange = (ext, editor) => {
        setConfig(prev => ({
            ...prev,
            fileAssociations: {
                ...prev.fileAssociations,
                [ext]: editor
            }
        }))
        setHasChanges(true)
    }

    // 탐색기 설정 변경
    const handleExplorerSettingChange = (key, value) => {
        setConfig(prev => ({
            ...prev,
            explorerSettings: {
                ...prev.explorerSettings,
                [key]: value
            }
        }))
        setHasChanges(true)
    }

    if (!config) {
        return (
            <div className="modal-overlay">
                <div className="modal project-settings-modal">
                    <div className="loading-state">
                        <div className="spinner"></div>
                        <p>설정 로딩 중...</p>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="modal-overlay">
            <div className="modal project-settings-modal">
                <div className="modal-header">
                    <h2>⚙️ 프로젝트 설정</h2>
                    <button className="btn-icon close-btn" onClick={onClose}>×</button>
                </div>

                <div className="modal-content">
                    {/* 프로젝트 정보 */}
                    <div className="settings-section">
                        <h3>프로젝트 정보</h3>
                        <div className="info-grid">
                            <div className="info-item">
                                <span className="info-label">경로</span>
                                <span className="info-value">{projectPath}</span>
                            </div>
                            <div className="info-item">
                                <span className="info-label">VFM 버전</span>
                                <span className="info-value">{config.version || '1.0.0'}</span>
                            </div>
                            {config.installedAt && (
                                <div className="info-item">
                                    <span className="info-label">설치일</span>
                                    <span className="info-value">
                                        {new Date(config.installedAt).toLocaleDateString()}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 단계별 에이전트 설정 */}
                    <div className="settings-section">
                        <h3>단계별 에이전트 설정</h3>
                        <p className="section-desc">
                            각 단계에서 사용할 에이전트를 선택하세요.
                            에이전트에 포함된 모델과 권한 모드가 자동으로 적용됩니다.
                        </p>

                        <div className="stage-agents-list">
                            {STAGES.map(stage => {
                                const selectedAgentName = config.stageAgents?.[stage]
                                const selectedAgent = getAgentInfo(selectedAgentName)

                                return (
                                    <div key={stage} className="stage-agent-row">
                                        <div className="stage-info">
                                            <div
                                                className="stage-badge"
                                                style={{ backgroundColor: STAGE_COLORS[stage] }}
                                            >
                                                {stage}
                                            </div>
                                            <span className="stage-desc">
                                                {STAGE_DESCRIPTIONS[stage]}
                                            </span>
                                        </div>

                                        <div className="agent-selector">
                                            <select
                                                value={selectedAgentName || ''}
                                                onChange={(e) => handleAgentChange(stage, e.target.value)}
                                            >
                                                <option value="">에이전트 선택...</option>
                                                {availableAgents.map(agent => (
                                                    <option key={agent.name} value={agent.name}>
                                                        {agent.name} ({agent.model})
                                                    </option>
                                                ))}
                                            </select>

                                            {selectedAgent && (
                                                <div className="agent-details">
                                                    <span className="agent-model">
                                                        {selectedAgent.model}
                                                    </span>
                                                    {selectedAgent.permissionMode === 'acceptEdits' && (
                                                        <span className="agentic-badge">
                                                            Agentic
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* 사용 가능한 에이전트 목록 */}
                    <div className="settings-section">
                        <h3>사용 가능한 에이전트</h3>
                        <div className="available-agents-grid">
                            {availableAgents.map(agent => (
                                <div key={agent.name} className="agent-card">
                                    <div className="agent-header">
                                        <span
                                            className="agent-color"
                                            style={{ backgroundColor: agent.color || '#6b7280' }}
                                        />
                                        <span className="agent-name">{agent.name}</span>
                                    </div>
                                    <p className="agent-desc">{agent.description}</p>
                                    <div className="agent-meta">
                                        <span className="meta-model">{agent.model}</span>
                                        <span className="meta-permission">
                                            {agent.permissionMode === 'acceptEdits' ? 'Agentic' : 'Default'}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {availableAgents.length === 0 && (
                            <div className="empty-agents">
                                에이전트가 없습니다. .claude/agents/ 폴더에 에이전트를 추가하세요.
                            </div>
                        )}
                    </div>

                    {/* 커스텀 에이전트 추가 안내 */}
                    <div className="settings-section">
                        <h3>커스텀 에이전트 추가</h3>
                        <div className="custom-agent-guide">
                            <p>
                                프로젝트의 <code>.claude/agents/</code> 폴더에 마크다운 파일을 추가하여
                                커스텀 에이전트를 만들 수 있습니다.
                            </p>
                            <pre className="code-example">{`---
name: my-custom-agent
description: "내 커스텀 에이전트"
model: sonnet
permissionMode: acceptEdits
color: blue
---

에이전트 지침을 여기에 작성...`}</pre>
                        </div>
                    </div>
                </div>

                <div className="modal-footer">
                    <button className="btn-secondary" onClick={onClose}>
                        취소
                    </button>
                    <button
                        className="btn-primary"
                        onClick={handleSave}
                        disabled={!hasChanges || isSaving}
                    >
                        {isSaving ? '저장 중...' : '저장'}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default ProjectSettings
