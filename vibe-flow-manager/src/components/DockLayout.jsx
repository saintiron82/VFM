import { useRef, useCallback, useEffect } from 'react'
import { Layout, Model, Actions, DockLocation } from 'flexlayout-react'
import 'flexlayout-react/style/dark.css'

import KanbanBoard from './KanbanBoard'
import SolutionExplorer from './SolutionExplorer'
import CardDetail from './CardDetail'
import TerminalPanel from './TerminalPanel'
import DocumentViewer from './DocumentViewer'
import useProjectStore from '../store/projectStore'

// 기본 레이아웃 정의
const defaultLayout = {
    global: {
        tabEnableClose: true,
        tabEnableFloat: true,
        tabSetMinWidth: 100,
        tabSetMinHeight: 100,
        borderMinSize: 100,
        splitterSize: 4,
        tabSetEnableMaximize: true,
        tabSetEnableDrop: true,
        tabSetEnableDrag: true,
        tabSetEnableDivide: true,
    },
    borders: [
        {
            type: 'border',
            location: 'bottom',
            size: 300,
            children: [
                {
                    type: 'tab',
                    id: 'terminal',
                    name: '🔧 터미널',
                    component: 'terminal',
                    enableClose: false
                }
            ]
        }
    ],
    layout: {
        type: 'row',
        weight: 100,
        children: [
            {
                type: 'tabset',
                id: 'leftPanel',
                weight: 20,
                minWidth: 200,
                children: [
                    {
                        type: 'tab',
                        id: 'explorer',
                        name: '📂 탐색기',
                        component: 'explorer',
                        enableClose: false
                    }
                ]
            },
            {
                type: 'tabset',
                id: 'mainPanel',
                weight: 50,
                children: [
                    {
                        type: 'tab',
                        id: 'kanban',
                        name: '📋 칸반',
                        component: 'kanban',
                        enableClose: false
                    }
                ]
            },
            {
                type: 'tabset',
                id: 'rightPanel',
                weight: 30,
                minWidth: 300,
                children: [
                    {
                        type: 'tab',
                        id: 'detail',
                        name: '📝 상세',
                        component: 'detail',
                        enableClose: false
                    }
                ]
            }
        ]
    }
}

// 저장키
const LAYOUT_STORAGE_KEY = 'vfm-dock-layout'

function DockLayout({
    project,
    selectedCard,
    onCardSelect,
    onOpenDocument
}) {
    const layoutRef = useRef(null)
    const modelRef = useRef(null)

    // 레이아웃 모델 초기화
    useEffect(() => {
        // 저장된 레이아웃 로드 시도
        let savedLayout = null
        try {
            const saved = localStorage.getItem(LAYOUT_STORAGE_KEY)
            if (saved) {
                savedLayout = JSON.parse(saved)
            }
        } catch (e) {
            console.warn('Failed to load saved layout:', e)
        }

        modelRef.current = Model.fromJson(savedLayout || defaultLayout)
    }, [])

    // 레이아웃 저장
    const saveLayout = useCallback(() => {
        if (modelRef.current) {
            try {
                const json = modelRef.current.toJson()
                localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(json))
            } catch (e) {
                console.warn('Failed to save layout:', e)
            }
        }
    }, [])

    // 컴포넌트 팩토리 - 각 탭에 어떤 컴포넌트를 렌더링할지 결정
    const factory = useCallback((node) => {
        const component = node.getComponent()

        switch (component) {
            case 'explorer':
                return project ? (
                    <SolutionExplorer
                        projectPath={project.workingDir}
                        onFileSelect={onOpenDocument}
                    />
                ) : (
                    <div className="dock-empty-panel">
                        <p>프로젝트를 선택하세요</p>
                    </div>
                )

            case 'kanban':
                return project ? (
                    <KanbanBoard
                        project={project}
                        onCardSelect={onCardSelect}
                    />
                ) : (
                    <div className="dock-empty-panel">
                        <p>📋 프로젝트를 선택하면 칸반 보드가 표시됩니다</p>
                    </div>
                )

            case 'detail':
                return selectedCard ? (
                    <CardDetail
                        card={selectedCard}
                        onClose={() => onCardSelect(null)}
                    />
                ) : (
                    <div className="dock-empty-panel">
                        <p>📝 카드를 선택하면 상세 정보가 표시됩니다</p>
                    </div>
                )

            case 'terminal':
                return (
                    <TerminalPanel
                        visible={true}
                        embedded={true}
                    />
                )

            case 'document':
                const config = node.getConfig()
                return (
                    <DocumentViewer
                        filePath={config?.filePath}
                        content={config?.content}
                    />
                )

            default:
                return (
                    <div className="dock-empty-panel">
                        <p>알 수 없는 컴포넌트: {component}</p>
                    </div>
                )
        }
    }, [project, selectedCard, onCardSelect, onOpenDocument])

    // 새 문서 탭 열기
    const openDocumentTab = useCallback((filePath) => {
        if (!modelRef.current || !layoutRef.current) return

        const fileName = filePath.split(/[/\\]/).pop()
        const tabId = `doc_${filePath.replace(/[^a-zA-Z0-9]/g, '_')}`

        // 이미 열려있는 탭인지 확인
        const existingNode = modelRef.current.getNodeById(tabId)
        if (existingNode) {
            modelRef.current.doAction(Actions.selectTab(tabId))
            return
        }

        // 메인 패널에 새 탭 추가
        const mainPanel = modelRef.current.getNodeById('mainPanel')
        if (mainPanel) {
            layoutRef.current.addTabToTabSet('mainPanel', {
                type: 'tab',
                id: tabId,
                name: `📄 ${fileName}`,
                component: 'document',
                config: { filePath }
            })
        }
    }, [])

    // 레이아웃 리셋
    const resetLayout = useCallback(() => {
        modelRef.current = Model.fromJson(defaultLayout)
        localStorage.removeItem(LAYOUT_STORAGE_KEY)
        // 강제 리렌더링
        window.location.reload()
    }, [])

    // 패널 토글
    const togglePanel = useCallback((tabId) => {
        if (!modelRef.current) return

        const node = modelRef.current.getNodeById(tabId)
        if (node) {
            const parent = node.getParent()
            if (parent && parent.getType() === 'border') {
                modelRef.current.doAction(Actions.selectTab(tabId))
            }
        }
    }, [])

    if (!modelRef.current) {
        return <div className="dock-loading">레이아웃 로딩 중...</div>
    }

    return (
        <div className="dock-layout-container">
            <Layout
                ref={layoutRef}
                model={modelRef.current}
                factory={factory}
                onModelChange={saveLayout}
                onAction={(action) => {
                    // 액션 로깅 (디버깅용)
                    // console.log('Layout action:', action)
                    return action
                }}
            />
        </div>
    )
}

export default DockLayout
