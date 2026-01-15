// nodeIntegration: true 모드에서 사용
const { ipcRenderer } = require('electron');

window.electronAPI = {
    test: () => 'preload works!',
    selectFolder: () => ipcRenderer.invoke('select-folder'),

    // VFM 패키지
    checkVfmPackage: (projectPath) => ipcRenderer.invoke('check-vfm-package', { projectPath }),
    installVfmPackage: (projectPath) => ipcRenderer.invoke('install-vfm-package', { projectPath }),
    loadProjectData: (projectPath) => ipcRenderer.invoke('load-project-data', { projectPath }),
    saveProjectData: (projectPath, data) => ipcRenderer.invoke('save-project-data', { projectPath, data }),

    // 프로젝트 목록
    listRegisteredProjects: () => ipcRenderer.invoke('list-registered-projects'),
    registerProject: (projectPath, name) => ipcRenderer.invoke('register-project', { projectPath, name }),
    updateProjectAccess: (projectPath) => ipcRenderer.invoke('update-project-access', { projectPath }),
    unregisterProject: (projectPath) => ipcRenderer.invoke('unregister-project', { projectPath }),

    // VFM 설정
    loadVfmConfig: (projectPath) => ipcRenderer.invoke('load-vfm-config', { projectPath }),
    saveVfmConfig: (projectPath, config) => ipcRenderer.invoke('save-vfm-config', { projectPath, config }),
    listAvailableAgents: (projectPath) => ipcRenderer.invoke('list-available-agents', { projectPath }),

    // Claude 실행
    runClaude: (options) => ipcRenderer.invoke('run-claude', options),
    onClaudeOutput: (callback) => {
        ipcRenderer.on('claude-output', (event, data) => callback(data));
    },
    saveClaudeResponse: (options) => ipcRenderer.invoke('save-claude-response', options),

    // 양방향 통신 (대화형 모드)
    respondToClaude: (processId, response) => ipcRenderer.invoke('respond-to-claude', { processId, response }),
    closeClaude: (processId) => ipcRenderer.invoke('close-claude', { processId }),
    getClaudeStatus: (processId) => ipcRenderer.invoke('get-claude-status', { processId }),
    onClaudeQuestion: (callback) => {
        ipcRenderer.on('claude-question', (event, data) => callback(data));
    },
    removeClaudeQuestionListener: () => {
        ipcRenderer.removeAllListeners('claude-question');
    },

    // 파일 관리
    listVibeFlowFiles: (options) => ipcRenderer.invoke('list-vibe-flow-files', options),
    openFile: (filePath) => ipcRenderer.invoke('open-file', { filePath }),

    // 폴더 탐색기 및 외부 편집기
    listDirectory: (dirPath, recursive = false) => ipcRenderer.invoke('list-directory', { dirPath, recursive }),
    openInVscode: (targetPath) => ipcRenderer.invoke('open-in-vscode', { targetPath }),
    openInExplorer: (targetPath) => ipcRenderer.invoke('open-in-explorer', { targetPath }),
    openWithEditor: (targetPath, editor) => ipcRenderer.invoke('open-with-editor', { targetPath, editor })
};

console.log('✅ electronAPI loaded:', Object.keys(window.electronAPI));
