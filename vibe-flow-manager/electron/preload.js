const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Claude Code 실행
    runClaude: (options) => ipcRenderer.invoke('run-claude', options),

    // Claude 출력 실시간 수신
    onClaudeOutput: (callback) => {
        ipcRenderer.on('claude-output', (event, data) => callback(data));
    },

    // 프로젝트 CRUD
    saveProject: (projectId, data) => ipcRenderer.invoke('save-project', { projectId, data }),
    loadProject: (projectId) => ipcRenderer.invoke('load-project', { projectId }),
    listProjects: () => ipcRenderer.invoke('list-projects'),

    // 워크플로우 생성
    createWorkflow: (options) => ipcRenderer.invoke('create-workflow', options),

    // 히스토리 조회
    getClaudeHistory: () => ipcRenderer.invoke('get-claude-history'),

    // 폴더 선택
    selectFolder: () => ipcRenderer.invoke('select-folder'),

    // Claude 응답 저장
    saveClaudeResponse: (options) => ipcRenderer.invoke('save-claude-response', options),

    // .vibe-flow 폴더 파일 목록
    listVibeFlowFiles: (workingDir) => ipcRenderer.invoke('list-vibe-flow-files', { workingDir })
});
