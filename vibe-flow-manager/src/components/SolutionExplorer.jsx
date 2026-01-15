import { useState, useEffect, useCallback } from 'react'

// 파일 아이콘 매핑
const getFileIcon = (name, isDirectory) => {
    if (isDirectory) return '📁'

    const ext = name.split('.').pop()?.toLowerCase()
    const icons = {
        js: '📜', jsx: '⚛️', ts: '📘', tsx: '⚛️',
        json: '📋', md: '📝', html: '🌐', css: '🎨',
        py: '🐍', java: '☕', go: '🔷', rs: '🦀',
        png: '🖼️', jpg: '🖼️', svg: '🎨', gif: '🖼️',
        txt: '📄', yml: '⚙️', yaml: '⚙️', env: '🔐',
        sh: '💻', bat: '💻', ps1: '💻'
    }
    return icons[ext] || '📄'
}

function TreeItem({ item, level = 0, onSelect, selectedPath, onContextMenu }) {
    const [expanded, setExpanded] = useState(level < 1)
    const [children, setChildren] = useState(item.children || null)
    const [loading, setLoading] = useState(false)

    const isSelected = selectedPath === item.path

    const handleToggle = async (e) => {
        e.stopPropagation()

        if (item.isDirectory) {
            if (!expanded && !children) {
                // 폴더 내용 로드
                setLoading(true)
                try {
                    const result = await window.electronAPI.listDirectory(item.path, false)
                    if (result.success) {
                        setChildren(result.items)
                    }
                } catch (err) {
                    console.error('디렉토리 로드 에러:', err)
                }
                setLoading(false)
            }
            setExpanded(!expanded)
        } else {
            onSelect(item)
        }
    }

    const handleContextMenu = (e) => {
        e.preventDefault()
        e.stopPropagation()
        onContextMenu(e, item)
    }

    return (
        <div className="tree-item-wrapper">
            <div
                className={`tree-item ${isSelected ? 'selected' : ''}`}
                style={{ paddingLeft: `${level * 16 + 8}px` }}
                onClick={handleToggle}
                onContextMenu={handleContextMenu}
                onDoubleClick={() => item.isDirectory ? null : onSelect(item, true)}
            >
                {item.isDirectory && (
                    <span className="tree-arrow">{expanded ? '▼' : '▶'}</span>
                )}
                <span className="tree-icon">{getFileIcon(item.name, item.isDirectory)}</span>
                <span className="tree-name">{item.name}</span>
                {loading && <span className="tree-loading">...</span>}
            </div>

            {expanded && children && (
                <div className="tree-children">
                    {children.map((child, idx) => (
                        <TreeItem
                            key={child.path || idx}
                            item={child}
                            level={level + 1}
                            onSelect={onSelect}
                            selectedPath={selectedPath}
                            onContextMenu={onContextMenu}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

function SolutionExplorer({ projectPath, onClose }) {
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(true)
    const [selectedPath, setSelectedPath] = useState(null)
    const [contextMenu, setContextMenu] = useState(null) // { x, y, item }

    // 디렉토리 로드
    const loadDirectory = useCallback(async () => {
        if (!projectPath || !window.electronAPI) return

        setLoading(true)
        try {
            const result = await window.electronAPI.listDirectory(projectPath, false)
            if (result.success) {
                setItems(result.items)
            }
        } catch (err) {
            console.error('디렉토리 로드 에러:', err)
        }
        setLoading(false)
    }, [projectPath])

    useEffect(() => {
        loadDirectory()
    }, [loadDirectory])

    // 클릭 시 컨텍스트 메뉴 닫기
    useEffect(() => {
        const handleClick = () => setContextMenu(null)
        window.addEventListener('click', handleClick)
        return () => window.removeEventListener('click', handleClick)
    }, [])

    const handleSelect = async (item, openWithEditor = false) => {
        setSelectedPath(item.path)

        if (!item.isDirectory && openWithEditor) {
            // 더블클릭: VS Code로 열기
            await window.electronAPI.openInVscode(item.path)
        }
    }

    const handleContextMenu = (e, item) => {
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            item
        })
    }

    const handleMenuAction = async (action) => {
        if (!contextMenu?.item) return

        const { item } = contextMenu
        setContextMenu(null)

        switch (action) {
            case 'vscode':
                await window.electronAPI.openInVscode(item.path)
                break
            case 'explorer':
                await window.electronAPI.openInExplorer(item.path)
                break
            case 'notepad':
                await window.electronAPI.openWithEditor(item.path, 'notepad')
                break
            case 'default':
                await window.electronAPI.openFile(item.path)
                break
        }
    }

    // VS Code로 프로젝트 전체 열기
    const handleOpenProjectInVscode = async () => {
        await window.electronAPI.openInVscode(projectPath)
    }

    return (
        <div className="solution-explorer">
            <div className="explorer-header">
                <h3>📂 솔루션 탐색기</h3>
                <div className="explorer-actions">
                    <button
                        className="btn-icon"
                        onClick={handleOpenProjectInVscode}
                        title="VS Code에서 열기"
                    >
                        💻
                    </button>
                    <button
                        className="btn-icon"
                        onClick={loadDirectory}
                        title="새로고침"
                    >
                        🔄
                    </button>
                    <button className="btn-icon" onClick={onClose} title="닫기">
                        ✕
                    </button>
                </div>
            </div>

            <div className="explorer-content">
                {loading ? (
                    <div className="explorer-loading">로딩 중...</div>
                ) : items.length === 0 ? (
                    <div className="explorer-empty">파일이 없습니다</div>
                ) : (
                    <div className="tree-container">
                        {items.map((item, idx) => (
                            <TreeItem
                                key={item.path || idx}
                                item={item}
                                onSelect={handleSelect}
                                selectedPath={selectedPath}
                                onContextMenu={handleContextMenu}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* 컨텍스트 메뉴 */}
            {contextMenu && (
                <div
                    className="context-menu"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                >
                    <div className="context-menu-item" onClick={() => handleMenuAction('vscode')}>
                        💻 VS Code에서 열기
                    </div>
                    <div className="context-menu-item" onClick={() => handleMenuAction('explorer')}>
                        📁 탐색기에서 열기
                    </div>
                    {!contextMenu.item.isDirectory && (
                        <>
                            <div className="context-menu-divider" />
                            <div className="context-menu-item" onClick={() => handleMenuAction('notepad')}>
                                📝 메모장으로 열기
                            </div>
                            <div className="context-menu-item" onClick={() => handleMenuAction('default')}>
                                📄 기본 프로그램으로 열기
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}

export default SolutionExplorer
