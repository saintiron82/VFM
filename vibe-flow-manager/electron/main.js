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

// Claude Code 설치 여부 확인 (CLAUDE.md 기준)
ipcMain.handle('check-claude-installed', async (event, { projectPath }) => {
  try {
    const claudeMdPath = path.join(projectPath, 'CLAUDE.md');
    const claudeDir = path.join(projectPath, '.claude');

    // CLAUDE.md 존재 여부가 핵심 판단 기준
    const isInstalled = fs.existsSync(claudeMdPath);
    const hasAgents = fs.existsSync(path.join(claudeDir, 'agents'));

    let installedAgents = [];
    if (hasAgents) {
      installedAgents = fs.readdirSync(path.join(claudeDir, 'agents'))
        .filter(f => f.endsWith('.md'))
        .map(f => f.replace('.md', ''));
    }

    return {
      success: true,
      isInstalled,
      hasClaudeDir: fs.existsSync(claudeDir),
      hasAgents,
      installedAgents
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Claude Code 초기화 (claude CLI 실행하여 /init 수행)
ipcMain.handle('init-claude', async (event, { projectPath }) => {
  return new Promise((resolve) => {
    console.log('Claude Code 초기화 시작:', projectPath);

    // claude CLI 실행하여 /init 명령 수행
    const proc = spawn('claude', [], {
      cwd: projectPath,
      shell: true,
      env: { ...process.env }
    });

    let stdout = '';
    let stderr = '';

    // 30초 타임아웃
    const timeout = setTimeout(() => {
      proc.kill();
      console.log('Claude init 타임아웃');
      resolve({ success: false, error: 'Timeout after 30 seconds' });
    }, 30000);

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
      console.log('Claude init 출력:', data.toString().substring(0, 100));
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
      console.log('Claude init stderr:', data.toString());
    });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      console.log('Claude init 종료:', code);

      // CLAUDE.md 생성 확인
      const claudeMdPath = path.join(projectPath, 'CLAUDE.md');
      const claudeMdExists = fs.existsSync(claudeMdPath);

      if (claudeMdExists) {
        // .claude/agents 폴더 생성 (에이전트 설치용)
        const agentsDir = path.join(projectPath, '.claude', 'agents');
        if (!fs.existsSync(agentsDir)) {
          fs.mkdirSync(agentsDir, { recursive: true });
        }

        resolve({ success: true, path: projectPath });
      } else {
        resolve({
          success: false,
          error: 'CLAUDE.md가 생성되지 않았습니다. claude CLI를 확인해주세요.',
          stdout,
          stderr
        });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      console.log('Claude init 에러:', err);
      resolve({ success: false, error: err.message });
    });

    // /init 명령 전송
    proc.stdin.write('/init\n');

    // 잠시 후 종료 명령
    setTimeout(() => {
      proc.stdin.write('/exit\n');
      proc.stdin.end();
    }, 5000);
  });
});

// VFM 에이전트 설치
ipcMain.handle('install-agents', async (event, { projectPath, agentNames }) => {
  try {
    console.log('에이전트 설치:', projectPath, agentNames);

    const targetAgentsDir = path.join(projectPath, '.claude', 'agents');

    // 에이전트 폴더가 없으면 생성
    if (!fs.existsSync(targetAgentsDir)) {
      fs.mkdirSync(targetAgentsDir, { recursive: true });
    }

    // 리소스 폴더에서 에이전트 파일 복사
    const resourcesDir = app.isPackaged
      ? path.join(process.resourcesPath, 'agents')
      : path.join(__dirname, '../resources/agents');

    const installedAgents = [];
    const errors = [];

    for (const agentName of agentNames) {
      const sourceFile = path.join(resourcesDir, `${agentName}.md`);
      const targetFile = path.join(targetAgentsDir, `${agentName}.md`);

      if (fs.existsSync(sourceFile)) {
        fs.copyFileSync(sourceFile, targetFile);
        installedAgents.push(agentName);
        console.log(`에이전트 설치됨: ${agentName}`);
      } else {
        errors.push(`에이전트 파일 없음: ${agentName}`);
        console.error(`에이전트 파일 없음: ${sourceFile}`);
      }
    }

    return {
      success: true,
      installedAgents,
      errors: errors.length > 0 ? errors : null
    };
  } catch (err) {
    console.error('에이전트 설치 에러:', err);
    return { success: false, error: err.message };
  }
});

// 사용 가능한 에이전트 목록 조회
ipcMain.handle('list-available-agents', async () => {
  try {
    const resourcesDir = app.isPackaged
      ? path.join(process.resourcesPath, 'agents')
      : path.join(__dirname, '../resources/agents');

    if (!fs.existsSync(resourcesDir)) {
      return { success: true, agents: [] };
    }

    const agents = fs.readdirSync(resourcesDir)
      .filter(f => f.endsWith('.md'))
      .map(f => {
        const filePath = path.join(resourcesDir, f);
        const content = fs.readFileSync(filePath, 'utf-8');

        // YAML frontmatter 파싱
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
        let name = f.replace('.md', '');
        let description = '';
        let color = 'gray';

        if (frontmatterMatch) {
          const frontmatter = frontmatterMatch[1];
          const nameMatch = frontmatter.match(/name:\s*(.+)/);
          const descMatch = frontmatter.match(/description:\s*"?([^"]+)"?/);
          const colorMatch = frontmatter.match(/color:\s*(\w+)/);

          if (nameMatch) name = nameMatch[1].trim();
          if (descMatch) description = descMatch[1].trim().substring(0, 100);
          if (colorMatch) color = colorMatch[1].trim();
        }

        return { name, description, color, fileName: f };
      });

    return { success: true, agents };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
