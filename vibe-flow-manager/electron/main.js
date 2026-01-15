const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, '../public/icon.png')
  });

  // 개발 모드에서는 Vite 서버 사용
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ===== IPC Handlers =====

// Claude Code 실행 - stdin으로 프롬프트 전달
ipcMain.handle('run-claude', async (event, { workingDir, prompt, mode }) => {
  return new Promise((resolve, reject) => {
    console.log('Claude Code 실행:', workingDir);
    console.log('프롬프트 길이:', prompt.length);

    // stdin으로 프롬프트를 전달하기 위해 -p 옵션만 사용
    // 프롬프트는 stdin으로 전달
    const proc = spawn('claude', ['--print', '-'], {
      cwd: workingDir,
      shell: true,
      env: { ...process.env }
    });

    let stdout = '';
    let stderr = '';

    // 60초 타임아웃 (AI 분석은 시간이 걸림)
    const timeout = setTimeout(() => {
      proc.kill();
      console.log('Claude Code 타임아웃');
      resolve({ code: -1, stdout, stderr: 'Timeout after 60 seconds' });
    }, 60000);

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
      console.log('Claude 출력:', data.toString().substring(0, 100));
      if (mainWindow) {
        mainWindow.webContents.send('claude-output', data.toString());
      }
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
      console.log('Claude stderr:', data.toString());
    });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      console.log('Claude Code 종료:', code, 'stdout 길이:', stdout.length);
      resolve({ code, stdout, stderr });
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      console.log('Claude Code 에러:', err);
      reject(err);
    });

    // stdin으로 프롬프트 전달
    proc.stdin.write(prompt);
    proc.stdin.end();
  });
});

// Claude 응답을 프로젝트 폴더에 저장
ipcMain.handle('save-claude-response', async (event, { workingDir, stage, componentName, response, prompt }) => {
  try {
    const vibeFlowDir = path.join(workingDir, '.vibe-flow');
    const stageDir = path.join(vibeFlowDir, stage);

    if (!fs.existsSync(stageDir)) {
      fs.mkdirSync(stageDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeName = componentName.replace(/[^a-zA-Z0-9가-힣]/g, '_');
    const fileName = `${safeName}_${timestamp}.md`;
    const filePath = path.join(stageDir, fileName);

    const content = `# ${componentName} - ${stage}

## 프롬프트
${prompt}

## 응답
${response}

---
생성일시: ${new Date().toLocaleString('ko-KR')}
`;

    fs.writeFileSync(filePath, content, 'utf-8');
    console.log('응답 저장됨:', filePath);

    return { success: true, path: filePath };
  } catch (err) {
    console.error('응답 저장 에러:', err);
    return { success: false, error: err.message };
  }
});

// 프로젝트의 .vibe-flow 폴더 내용 읽기
ipcMain.handle('list-vibe-flow-files', async (event, { workingDir }) => {
  try {
    const vibeFlowDir = path.join(workingDir, '.vibe-flow');
    if (!fs.existsSync(vibeFlowDir)) {
      return { success: true, files: {} };
    }

    const stages = fs.readdirSync(vibeFlowDir).filter(f =>
      fs.statSync(path.join(vibeFlowDir, f)).isDirectory()
    );

    const files = {};
    for (const stage of stages) {
      const stageDir = path.join(vibeFlowDir, stage);
      files[stage] = fs.readdirSync(stageDir).map(f => ({
        name: f,
        path: path.join(stageDir, f)
      }));
    }

    return { success: true, files };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 프로젝트 데이터 저장
ipcMain.handle('save-project', async (event, { projectId, data }) => {
  const dataDir = path.join(__dirname, '../data/projects');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const filePath = path.join(dataDir, `${projectId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  return { success: true };
});

// 프로젝트 데이터 로드
ipcMain.handle('load-project', async (event, { projectId }) => {
  const filePath = path.join(__dirname, '../data/projects', `${projectId}.json`);
  if (fs.existsSync(filePath)) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return { success: true, data };
  }
  return { success: false, error: 'Project not found' };
});

// 프로젝트 목록 조회
ipcMain.handle('list-projects', async () => {
  const dataDir = path.join(__dirname, '../data/projects');
  if (!fs.existsSync(dataDir)) {
    return { projects: [] };
  }
  const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
  const projects = files.map(f => {
    const data = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf-8'));
    return { id: f.replace('.json', ''), name: data.goal, createdAt: data.createdAt };
  });
  return { projects };
});

// 워크플로우 생성
ipcMain.handle('create-workflow', async (event, { projectPath, name, content }) => {
  const workflowDir = path.join(projectPath, '.agent', 'workflows');
  if (!fs.existsSync(workflowDir)) {
    fs.mkdirSync(workflowDir, { recursive: true });
  }
  const fileName = name.toLowerCase().replace(/\s+/g, '-') + '.md';
  const filePath = path.join(workflowDir, fileName);

  const workflowContent = `---
description: ${name}
---

${content}
`;

  fs.writeFileSync(filePath, workflowContent);
  return { success: true, path: filePath };
});

// Claude 대화 히스토리 조회
ipcMain.handle('get-claude-history', async () => {
  const historyPath = path.join(process.env.USERPROFILE || process.env.HOME, '.claude', 'history.jsonl');
  if (fs.existsSync(historyPath)) {
    const content = fs.readFileSync(historyPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    const history = lines.map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);
    return { success: true, history };
  }
  return { success: false, error: 'History not found' };
});

// 폴더 선택 다이얼로그
ipcMain.handle('select-folder', async () => {
  try {
    console.log('폴더 선택 다이얼로그 열기');

    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: '프로젝트 폴더 선택'
    });

    console.log('다이얼로그 결과:', result);

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    const folderPath = result.filePaths[0];
    const folderName = path.basename(folderPath);

    return {
      success: true,
      path: folderPath,
      name: folderName
    };
  } catch (err) {
    console.error('폴더 선택 에러:', err);
    return { success: false, error: err.message };
  }
});
