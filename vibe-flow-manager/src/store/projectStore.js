import { create } from 'zustand'

const STAGES = ['초안', '플랜', '진행', '검증', '완료']

const useProjectStore = create((set, get) => ({
    // 등록된 프로젝트 목록 (중앙 관리)
    registeredProjects: [],
    // 현재 열린 프로젝트
    currentProject: null,
    // VFM 설정 (현재 프로젝트)
    vfmConfig: null,
    // 사용 가능한 에이전트 목록
    availableAgents: [],

    // ===== 프로젝트 목록 관리 (중앙) =====

    // 등록된 프로젝트 목록 로드
    loadRegisteredProjects: async () => {
        if (window.electronAPI) {
            const result = await window.electronAPI.listRegisteredProjects()
            set({ registeredProjects: result.projects || [] })
        }
    },

    // 프로젝트 등록
    registerProject: async (projectPath, name) => {
        if (window.electronAPI) {
            await window.electronAPI.registerProject(projectPath, name)
            await get().loadRegisteredProjects()
        }
    },

    // 프로젝트 등록 해제
    unregisterProject: async (projectPath) => {
        if (window.electronAPI) {
            await window.electronAPI.unregisterProject(projectPath)
            await get().loadRegisteredProjects()
        }
    },

    // ===== 프로젝트 열기/생성 =====

    // 프로젝트 열기 (기존 프로젝트)
    openProject: async (projectPath) => {
        if (!window.electronAPI) return null

        // 접근 시간 업데이트
        await window.electronAPI.updateProjectAccess(projectPath)

        // 프로젝트 데이터 로드 (.vfm/project.json)
        const result = await window.electronAPI.loadProjectData(projectPath)
        if (result.success && result.data) {
            set({ currentProject: { ...result.data, workingDir: projectPath } })
        } else {
            // 데이터가 없으면 빈 프로젝트 생성
            const newProject = {
                id: Date.now().toString(),
                goal: '',
                workingDir: projectPath,
                createdAt: new Date().toISOString(),
                tasks: [],
                status: 'ready'
            }
            set({ currentProject: newProject })
        }

        // VFM 설정 로드
        const configResult = await window.electronAPI.loadVfmConfig(projectPath)
        if (configResult.success) {
            set({ vfmConfig: configResult.config })
        }

        // 에이전트 목록 로드
        const agentsResult = await window.electronAPI.listAvailableAgents(projectPath)
        if (agentsResult.agents) {
            set({ availableAgents: agentsResult.agents })
        }

        return get().currentProject
    },

    // 새 프로젝트 생성 (VFM 패키지 설치 후)
    createProject: async (goal, workingDir) => {
        const project = {
            id: Date.now().toString(),
            goal,
            workingDir,
            createdAt: new Date().toISOString(),
            tasks: [],
            status: 'decomposing'
        }

        if (window.electronAPI) {
            // .vfm/project.json에 저장
            await window.electronAPI.saveProjectData(workingDir, project)
            // 중앙 목록에 등록
            await window.electronAPI.registerProject(workingDir, goal)

            // VFM 설정 및 에이전트 로드 (중요!)
            const configResult = await window.electronAPI.loadVfmConfig(workingDir)
            if (configResult.success && configResult.config) {
                set({ vfmConfig: configResult.config })
            }

            const agentsResult = await window.electronAPI.listAvailableAgents(workingDir)
            if (agentsResult.agents) {
                set({ availableAgents: agentsResult.agents })
            }
        }

        set({ currentProject: project })
        await get().loadRegisteredProjects()

        return project
    },

    // 프로젝트 닫기
    closeProject: () => {
        set({ currentProject: null, vfmConfig: null, availableAgents: [] })
    },

    // ===== 프로젝트 데이터 관리 =====

    // 프로젝트 업데이트
    updateProject: async (updates) => {
        const { currentProject } = get()
        if (!currentProject) return

        const updated = { ...currentProject, ...updates }

        if (window.electronAPI && currentProject.workingDir) {
            await window.electronAPI.saveProjectData(currentProject.workingDir, updated)
        }

        set({ currentProject: updated })
    },

    // VFM 설정 업데이트
    updateVfmConfig: async (configUpdates) => {
        const { currentProject, vfmConfig } = get()
        if (!currentProject || !vfmConfig) return

        const updated = { ...vfmConfig, ...configUpdates }

        if (window.electronAPI) {
            await window.electronAPI.saveVfmConfig(currentProject.workingDir, updated)
        }

        set({ vfmConfig: updated })
    },

    // ===== 태스크 관리 =====

    // 태스크 추가
    addTask: async (task) => {
        const { currentProject, updateProject } = get()
        if (!currentProject) return null

        const newTask = {
            id: Date.now().toString(),
            ...task,
            parentId: task.parentId || null,
            childIds: [],
            currentStage: '초안',
            integrationStatus: 'pending',
            stages: {
                '초안': { status: 'pending', logs: [] },
                '플랜': { status: 'pending', logs: [] },
                '진행': { status: 'pending', logs: [] },
                '검증': { status: 'pending', logs: [] },
                '완료': { status: 'pending', logs: [] }
            }
        }

        await updateProject({
            tasks: [...currentProject.tasks, newTask]
        })

        return newTask.id
    },

    // 태스크 업데이트
    updateTask: async (taskId, updates) => {
        const { currentProject, updateProject } = get()
        if (!currentProject) return

        const tasks = currentProject.tasks.map(t => {
            if (t.id === taskId) {
                return { ...t, ...updates }
            }
            return t
        })

        await updateProject({ tasks })
    },

    // 태스크 단계 업데이트
    updateTaskStage: async (taskId, stage, stageData) => {
        const { currentProject, updateProject } = get()
        if (!currentProject) return

        const tasks = currentProject.tasks.map(t => {
            if (t.id === taskId) {
                return {
                    ...t,
                    currentStage: stage,
                    stages: {
                        ...t.stages,
                        [stage]: { ...t.stages[stage], ...stageData }
                    }
                }
            }
            return t
        })

        await updateProject({ tasks })
    },

    // 태스크 분해 (자식 태스크 생성)
    splitTask: async (taskId, subTasks) => {
        const { currentProject, updateProject } = get()
        if (!currentProject) return

        const newChildIds = []

        for (const sub of subTasks) {
            const newTask = {
                id: `${taskId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                name: sub.name,
                description: sub.description,
                parentId: taskId,
                childIds: [],
                currentStage: '초안',
                integrationStatus: 'pending',
                stages: {
                    '초안': { status: 'pending', logs: [] },
                    '플랜': { status: 'pending', logs: [] },
                    '진행': { status: 'pending', logs: [] },
                    '검증': { status: 'pending', logs: [] },
                    '완료': { status: 'pending', logs: [] }
                }
            }
            newChildIds.push(newTask.id)
            currentProject.tasks.push(newTask)
        }

        // 부모 태스크에 childIds 업데이트
        const tasks = currentProject.tasks.map(t => {
            if (t.id === taskId) {
                return {
                    ...t,
                    childIds: [...(t.childIds || []), ...newChildIds]
                }
            }
            return t
        })

        await updateProject({ tasks })
        return newChildIds
    },

    // 태스크 삭제
    deleteTask: async (taskId) => {
        const { currentProject, updateProject } = get()
        if (!currentProject) return

        // 자식 태스크도 함께 삭제
        const getDescendantIds = (id) => {
            const task = currentProject.tasks.find(t => t.id === id)
            if (!task || !task.childIds?.length) return [id]
            return [id, ...task.childIds.flatMap(getDescendantIds)]
        }

        const idsToDelete = new Set(getDescendantIds(taskId))

        // 부모의 childIds에서 제거
        const task = currentProject.tasks.find(t => t.id === taskId)
        const tasks = currentProject.tasks
            .filter(t => !idsToDelete.has(t.id))
            .map(t => {
                if (task?.parentId && t.id === task.parentId) {
                    return {
                        ...t,
                        childIds: (t.childIds || []).filter(id => id !== taskId)
                    }
                }
                return t
            })

        await updateProject({ tasks })
    },

    // 태스크 단계 직접 변경
    setTaskStage: async (taskId, newStage) => {
        const { currentProject, updateProject } = get()
        if (!currentProject) return

        const tasks = currentProject.tasks.map(t => {
            if (t.id === taskId) {
                return {
                    ...t,
                    currentStage: newStage,
                    stages: {
                        ...t.stages,
                        [newStage]: { ...t.stages[newStage], status: 'in-progress' }
                    }
                }
            }
            return t
        })

        await updateProject({ tasks })
    },

    // ===== 계층 관리 =====

    // 태스크의 자식들 가져오기
    getChildTasks: (taskId) => {
        const { currentProject } = get()
        if (!currentProject) return []

        const task = currentProject.tasks.find(t => t.id === taskId)
        if (!task?.childIds?.length) return []

        return currentProject.tasks.filter(t => task.childIds.includes(t.id))
    },

    // 통합 준비 상태 확인
    checkIntegrationReady: (taskId) => {
        const { getChildTasks } = get()
        const children = getChildTasks(taskId)

        if (children.length === 0) return false
        return children.every(t => t.currentStage === '완료')
    },

    // 통합 상태 업데이트
    setIntegrationStatus: async (taskId, status) => {
        const { updateTask } = get()
        await updateTask(taskId, { integrationStatus: status })
    },

    // ===== 에이전트 관리 =====

    // 단계별 에이전트 가져오기
    getAgentForStage: (stage) => {
        const { vfmConfig, availableAgents } = get()
        if (!vfmConfig) return null

        const agentName = vfmConfig.stageAgents?.[stage]
        if (!agentName) return null

        return availableAgents.find(a => a.name === agentName) || null
    },

    // 단계별 에이전트 변경
    setAgentForStage: async (stage, agentName) => {
        const { vfmConfig, updateVfmConfig } = get()
        if (!vfmConfig) return

        await updateVfmConfig({
            stageAgents: {
                ...vfmConfig.stageAgents,
                [stage]: agentName
            }
        })
    },

    // ===== 유틸리티 =====

    // 단계 목록 가져오기
    getStages: () => STAGES,

    // 다음 단계 가져오기
    getNextStage: (currentStage) => {
        const idx = STAGES.indexOf(currentStage)
        if (idx < 0 || idx >= STAGES.length - 1) return null
        return STAGES[idx + 1]
    },

    // 루트 태스크만 가져오기
    getRootTasks: () => {
        const { currentProject } = get()
        if (!currentProject) return []
        return currentProject.tasks.filter(t => !t.parentId)
    },

    // 특정 단계의 태스크들 가져오기
    getTasksByStage: (stage, parentId = null) => {
        const { currentProject } = get()
        if (!currentProject) return []

        return currentProject.tasks.filter(t => {
            const stageMatch = t.currentStage === stage
            if (parentId === null) {
                return stageMatch && !t.parentId
            }
            return stageMatch && t.parentId === parentId
        })
    }
}))

export default useProjectStore
