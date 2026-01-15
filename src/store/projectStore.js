import { create } from 'zustand'

const useProjectStore = create((set, get) => ({
    projects: [],
    currentProject: null,

    // 프로젝트 목록 로드
    loadProjects: async () => {
        if (window.electronAPI) {
            const result = await window.electronAPI.listProjects()
            set({ projects: result.projects || [] })
        }
    },

    // 프로젝트 선택
    setCurrentProject: async (project) => {
        if (project && window.electronAPI) {
            const result = await window.electronAPI.loadProject(project.id)
            if (result.success) {
                set({ currentProject: result.data })
            }
        } else {
            set({ currentProject: project })
        }
    },

    // 새 프로젝트 생성
    createProject: async (goal, workingDir) => {
        const project = {
            id: Date.now().toString(),
            goal,
            workingDir,
            createdAt: new Date().toISOString(),
            components: [],
            status: 'decomposing'
        }

        if (window.electronAPI) {
            await window.electronAPI.saveProject(project.id, project)
        }

        set(state => ({
            projects: [...state.projects, { id: project.id, name: goal, createdAt: project.createdAt }],
            currentProject: project
        }))

        return project
    },

    // 프로젝트 업데이트
    updateProject: async (updates) => {
        const { currentProject } = get()
        if (!currentProject) return

        const updated = { ...currentProject, ...updates }

        if (window.electronAPI) {
            await window.electronAPI.saveProject(updated.id, updated)
        }

        set({ currentProject: updated })
    },

    // 컴포넌트 추가
    addComponent: async (component) => {
        const { currentProject, updateProject } = get()
        if (!currentProject) return

        const newComponent = {
            id: Date.now().toString(),
            ...component,
            currentStage: '초안',
            stages: {
                '초안': { status: 'pending', logs: [] },
                '플랜': { status: 'pending', logs: [] },
                '진행': { status: 'pending', logs: [] },
                '검증': { status: 'pending', logs: [] },
                '완료': { status: 'pending', logs: [] }
            }
        }

        await updateProject({
            components: [...currentProject.components, newComponent]
        })
    },

    // 컴포넌트 단계 업데이트
    updateComponentStage: async (componentId, stage, stageData) => {
        const { currentProject, updateProject } = get()
        if (!currentProject) return

        const components = currentProject.components.map(c => {
            if (c.id === componentId) {
                return {
                    ...c,
                    currentStage: stage,
                    stages: {
                        ...c.stages,
                        [stage]: { ...c.stages[stage], ...stageData }
                    }
                }
            }
            return c
        })

        await updateProject({ components })
    },

    // 컴포넌트 분해
    splitComponent: async (componentId, subComponents) => {
        const { currentProject, updateProject } = get()
        if (!currentProject) return

        const newComponents = subComponents.map((sub, idx) => ({
            id: `${componentId}-${idx}`,
            name: sub.name,
            description: sub.description,
            parentId: componentId,
            currentStage: '초안',
            stages: {
                '초안': { status: 'pending', logs: [] },
                '플랜': { status: 'pending', logs: [] },
                '진행': { status: 'pending', logs: [] },
                '검증': { status: 'pending', logs: [] },
                '완료': { status: 'pending', logs: [] }
            }
        }))

        const components = currentProject.components.map(c => {
            if (c.id === componentId) {
                return { ...c, childIds: newComponents.map(nc => nc.id) }
            }
            return c
        })

        await updateProject({
            components: [...components, ...newComponents]
        })
    },

    // 컴포넌트 삭제 (파기)
    deleteComponent: async (componentId) => {
        const { currentProject, updateProject } = get()
        if (!currentProject) return

        const components = currentProject.components.filter(c => c.id !== componentId)
        await updateProject({ components })
    },

    // 컴포넌트 상태 직접 변경
    setComponentStage: async (componentId, newStage) => {
        const { currentProject, updateProject } = get()
        if (!currentProject) return

        const components = currentProject.components.map(c => {
            if (c.id === componentId) {
                return { ...c, currentStage: newStage }
            }
            return c
        })

        await updateProject({ components })
    }
}))

export default useProjectStore
