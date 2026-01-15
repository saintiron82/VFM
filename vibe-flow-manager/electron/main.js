const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow;

// 활성 Claude 프로세스 관리 (양방향 통신용)
const activeClaudeProcesses = new Map(); // taskId -> { proc, status }

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // 빌드된 파일에서 로드
  mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));

  // 개발자 도구 (필요시 주석 해제)
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ===== IPC Handlers =====

// Claude Code 실행 - 양방향 통신 지원
ipcMain.handle('run-claude', async (event, { workingDir, prompt, mode, agent, model, permissionMode, taskId, interactive = false }) => {
  return new Promise((resolve, reject) => {
    console.log('Claude Code 실행:', workingDir);
    console.log('프롬프트 길이:', prompt.length);
    console.log('에이전트:', agent, '모델:', model, '권한모드:', permissionMode);
    console.log('대화형 모드:', interactive, 'taskId:', taskId);

    // CLI 인자 구성
    const args = ['--print'];

    // 에이전트 지정 (프로젝트의 .claude/agents/ 내 파일)
    if (agent) {
      args.push('--agent', agent);
    }

    // 모델 지정
    if (model) {
      args.push('--model', model);
    }

    // 권한 모드 (Agentic Mode를 위해 중요!)
    // acceptEdits: 파일 수정 자동 승인
    // bypassPermissions: 모든 권한 자동 승인
    // default: 기본 (권한 요청)
    if (permissionMode && permissionMode !== 'default') {
      args.push('--permission-mode', permissionMode);
    }

    // 이어가기 모드
    if (mode === 'continue') {
      args.push('--continue');
    }

    // stdin 입력 모드
    args.push('-');

    console.log('Claude CLI 인자:', args.join(' '));

    const proc = spawn('claude', args, {
      cwd: workingDir,
      shell: true,
      env: { ...process.env }
    });

    let stdout = '';
    let stderr = '';
    let waitingForInput = false;
    let currentQuestion = '';

    // 프로세스 등록 (대화형 모드일 때)
    const processId = taskId || Date.now().toString();
    if (interactive) {
      activeClaudeProcesses.set(processId, {
        proc,
        status: 'running',
        workingDir
      });
    }

    // 5분 타임아웃 (Agentic Mode는 시간이 오래 걸림)
    const timeout = setTimeout(() => {
      activeClaudeProcesses.delete(processId);
      proc.kill();
      console.log('Claude Code 타임아웃');
      resolve({ code: -1, stdout, stderr: 'Timeout after 5 minutes', processId });
    }, 300000);

    // 질문 감지 패턴
    const questionPatterns = [
      /\?\s*$/,                          // 물음표로 끝남
      /\[Y\/n\]/i,                        // [Y/n] 형태
      /\[y\/N\]/i,                        // [y/N] 형태
      /please (provide|enter|specify)/i, // 입력 요청
      /waiting for.*input/i,             // 입력 대기
      /press enter/i,                    // 엔터 요청
      /\(yes\/no\)/i,                     // (yes/no) 형태
    ];

    const isQuestion = (text) => {
      return questionPatterns.some(pattern => pattern.test(text));
    };

    proc.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      console.log('Claude 출력:', chunk.substring(0, 100));

      // 실시간 출력 전송
      if (mainWindow) {
        mainWindow.webContents.send('claude-output', { processId, data: chunk });
      }

      // 질문 감지 (대화형 모드)
      if (interactive) {
        // 마지막 줄에서 질문 감지
        const lines = stdout.split('\n');
        const lastLine = lines[lines.length - 1].trim();

        if (isQuestion(lastLine) || isQuestion(chunk)) {
          waitingForInput = true;
          currentQuestion = lastLine || chunk.trim();
          console.log('Claude 질문 감지:', currentQuestion);

          // 질문 이벤트 전송
          if (mainWindow) {
            mainWindow.webContents.send('claude-question', {
              processId,
              question: currentQuestion
            });
          }

          // 프로세스 상태 업데이트
          const processInfo = activeClaudeProcesses.get(processId);
          if (processInfo) {
            processInfo.status = 'waiting';
            processInfo.question = currentQuestion;
          }
        }
      }
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
      console.log('Claude stderr:', data.toString());
    });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      activeClaudeProcesses.delete(processId);
      console.log('Claude Code 종료:', code, 'stdout 길이:', stdout.length);
      resolve({ code, stdout, stderr, processId });
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      activeClaudeProcesses.delete(processId);
      console.log('Claude Code 에러:', err);
      reject(err);
    });

    // stdin으로 프롬프트 전달
    proc.stdin.write(prompt);

    // 대화형 모드가 아닐 때만 stdin 닫기
    if (!interactive) {
      proc.stdin.end();
    }
  });
});

// Claude에 응답 전송 (대화형 모드)
ipcMain.handle('respond-to-claude', async (event, { processId, response }) => {
  console.log('Claude 응답 전송:', processId, response);

  const processInfo = activeClaudeProcesses.get(processId);
  if (!processInfo) {
    return { success: false, error: 'Process not found or already closed' };
  }

  try {
    processInfo.proc.stdin.write(response + '\n');
    processInfo.status = 'running';
    processInfo.question = null;

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Claude 프로세스 종료 (대화형 모드)
ipcMain.handle('close-claude', async (event, { processId }) => {
  console.log('Claude 프로세스 종료 요청:', processId);

  const processInfo = activeClaudeProcesses.get(processId);
  if (!processInfo) {
    return { success: false, error: 'Process not found' };
  }

  try {
    processInfo.proc.stdin.end();
    processInfo.proc.kill();
    activeClaudeProcesses.delete(processId);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 활성 Claude 프로세스 상태 조회
ipcMain.handle('get-claude-status', async (event, { processId }) => {
  const processInfo = activeClaudeProcesses.get(processId);
  if (!processInfo) {
    return { exists: false };
  }

  return {
    exists: true,
    status: processInfo.status,
    question: processInfo.question
  };
});

// Claude 응답을 프로젝트 폴더에 저장
ipcMain.handle('save-claude-response', async (event, { workingDir, stage, taskName, response, prompt }) => {
  try {
    const vibeFlowDir = path.join(workingDir, '.vibe-flow');
    const stageDir = path.join(vibeFlowDir, stage);

    if (!fs.existsSync(stageDir)) {
      fs.mkdirSync(stageDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeName = taskName.replace(/[^a-zA-Z0-9가-힣]/g, '_');
    const fileName = `${safeName}_${timestamp}.md`;
    const filePath = path.join(stageDir, fileName);

    const content = `# ${taskName} - ${stage}

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

// 사용 가능한 에이전트 목록 조회 (프로젝트별)
ipcMain.handle('list-available-agents', async (event, { projectPath }) => {
  try {
    // 프로젝트의 .claude/agents 폴더에서 에이전트 조회
    const agentsDir = projectPath
      ? path.join(projectPath, '.claude', 'agents')
      : null;

    if (!agentsDir || !fs.existsSync(agentsDir)) {
      return { success: true, agents: [] };
    }

    const agents = fs.readdirSync(agentsDir)
      .filter(f => f.endsWith('.md'))
      .map(f => {
        const filePath = path.join(agentsDir, f);
        const content = fs.readFileSync(filePath, 'utf-8');

        // YAML frontmatter 파싱
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
        let name = f.replace('.md', '');
        let description = '';
        let color = 'gray';
        let model = 'sonnet';
        let permissionMode = 'default';

        if (frontmatterMatch) {
          const frontmatter = frontmatterMatch[1];
          const nameMatch = frontmatter.match(/name:\s*(.+)/);
          const descMatch = frontmatter.match(/description:\s*"?([^"]+)"?/);
          const colorMatch = frontmatter.match(/color:\s*(\w+)/);
          const modelMatch = frontmatter.match(/model:\s*(\w+)/);
          const permMatch = frontmatter.match(/permissionMode:\s*(\w+)/);

          if (nameMatch) name = nameMatch[1].trim();
          if (descMatch) description = descMatch[1].trim().substring(0, 100);
          if (colorMatch) color = colorMatch[1].trim();
          if (modelMatch) model = modelMatch[1].trim();
          if (permMatch) permissionMode = permMatch[1].trim();
        }

        return { name, description, color, model, permissionMode, fileName: f };
      });

    return { success: true, agents };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ===== VFM 패키지 시스템 =====

// VFM 패키지 설치 확인
ipcMain.handle('check-vfm-package', async (event, { projectPath }) => {
  try {
    const vfmDir = path.join(projectPath, '.vfm');
    const configPath = path.join(vfmDir, 'config.json');

    if (!fs.existsSync(configPath)) {
      return { installed: false };
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return {
      installed: true,
      version: config.version || '1.0.0',
      needsUpdate: false // TODO: 버전 비교 로직
    };
  } catch (err) {
    return { installed: false, error: err.message };
  }
});

// VFM 패키지 설치
ipcMain.handle('install-vfm-package', async (event, { projectPath }) => {
  try {
    const vfmPackageDir = app.isPackaged
      ? path.join(process.resourcesPath, 'vfm-package')
      : path.join(__dirname, '../vfm-package');

    // .vfm 폴더 생성
    const vfmDir = path.join(projectPath, '.vfm');
    if (!fs.existsSync(vfmDir)) {
      fs.mkdirSync(vfmDir, { recursive: true });
    }

    // config.json 복사
    const srcConfig = path.join(vfmPackageDir, '.vfm', 'config.json');
    const destConfig = path.join(vfmDir, 'config.json');
    if (fs.existsSync(srcConfig)) {
      fs.copyFileSync(srcConfig, destConfig);
    }

    // .claude/agents 폴더 생성 및 에이전트 복사
    const claudeDir = path.join(projectPath, '.claude', 'agents');
    if (!fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true });
    }

    const srcAgentsDir = path.join(vfmPackageDir, '.claude', 'agents');
    if (fs.existsSync(srcAgentsDir)) {
      const agents = fs.readdirSync(srcAgentsDir).filter(f => f.endsWith('.md'));
      for (const agent of agents) {
        fs.copyFileSync(
          path.join(srcAgentsDir, agent),
          path.join(claudeDir, agent)
        );
      }
    }

    // CLAUDE.md 복사 (없는 경우에만)
    const srcClaudeMd = path.join(vfmPackageDir, 'CLAUDE.md');
    const destClaudeMd = path.join(projectPath, 'CLAUDE.md');
    if (fs.existsSync(srcClaudeMd) && !fs.existsSync(destClaudeMd)) {
      fs.copyFileSync(srcClaudeMd, destClaudeMd);
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 프로젝트 데이터 로드 (.vfm/project.json)
ipcMain.handle('load-project-data', async (event, { projectPath }) => {
  try {
    const projectFile = path.join(projectPath, '.vfm', 'project.json');

    if (!fs.existsSync(projectFile)) {
      return { success: true, data: null };
    }

    const data = JSON.parse(fs.readFileSync(projectFile, 'utf-8'));
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 프로젝트 데이터 저장 (.vfm/project.json)
ipcMain.handle('save-project-data', async (event, { projectPath, data }) => {
  try {
    const vfmDir = path.join(projectPath, '.vfm');
    if (!fs.existsSync(vfmDir)) {
      fs.mkdirSync(vfmDir, { recursive: true });
    }

    const projectFile = path.join(vfmDir, 'project.json');
    fs.writeFileSync(projectFile, JSON.stringify(data, null, 2));

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ===== 중앙 프로젝트 목록 관리 =====

const getRegistryPath = () => {
  return path.join(app.getPath('userData'), 'projects-registry.json');
};

const loadRegistry = () => {
  const registryPath = getRegistryPath();
  if (!fs.existsSync(registryPath)) {
    return { projects: [] };
  }
  return JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
};

const saveRegistry = (registry) => {
  const registryPath = getRegistryPath();
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
};

// 등록된 프로젝트 목록 조회
ipcMain.handle('list-registered-projects', async () => {
  try {
    const registry = loadRegistry();

    // 존재하지 않는 프로젝트 필터링
    const validProjects = registry.projects.filter(p => {
      return fs.existsSync(path.join(p.path, '.vfm'));
    });

    // 최근 접근 순 정렬
    validProjects.sort((a, b) => new Date(b.lastAccessed) - new Date(a.lastAccessed));

    return { success: true, projects: validProjects };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 프로젝트 등록
ipcMain.handle('register-project', async (event, { projectPath, name }) => {
  try {
    const registry = loadRegistry();

    // 이미 등록된 프로젝트인지 확인
    const existing = registry.projects.find(p => p.path === projectPath);
    if (existing) {
      existing.lastAccessed = new Date().toISOString();
      if (name) existing.name = name;
    } else {
      registry.projects.push({
        path: projectPath,
        name: name || path.basename(projectPath),
        registeredAt: new Date().toISOString(),
        lastAccessed: new Date().toISOString()
      });
    }

    saveRegistry(registry);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 프로젝트 접근 시간 업데이트
ipcMain.handle('update-project-access', async (event, { projectPath }) => {
  try {
    const registry = loadRegistry();
    const project = registry.projects.find(p => p.path === projectPath);

    if (project) {
      project.lastAccessed = new Date().toISOString();
      saveRegistry(registry);
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 프로젝트 등록 해제
ipcMain.handle('unregister-project', async (event, { projectPath }) => {
  try {
    const registry = loadRegistry();
    registry.projects = registry.projects.filter(p => p.path !== projectPath);
    saveRegistry(registry);

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ===== VFM 설정 =====

// VFM 설정 로드
ipcMain.handle('load-vfm-config', async (event, { projectPath }) => {
  try {
    const configPath = path.join(projectPath, '.vfm', 'config.json');

    if (!fs.existsSync(configPath)) {
      return { success: true, config: null };
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return { success: true, config };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// VFM 설정 저장
ipcMain.handle('save-vfm-config', async (event, { projectPath, config }) => {
  try {
    const vfmDir = path.join(projectPath, '.vfm');
    if (!fs.existsSync(vfmDir)) {
      fs.mkdirSync(vfmDir, { recursive: true });
    }

    const configPath = path.join(vfmDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 파일 열기 (기본 프로그램으로)
ipcMain.handle('open-file', async (event, { filePath }) => {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'File not found' };
    }
    await shell.openPath(filePath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ===== 폴더 탐색기 및 외부 편집기 =====

// 디렉토리 내용 읽기 (트리 구조용)
ipcMain.handle('list-directory', async (event, { dirPath, recursive = false }) => {
  try {
    if (!fs.existsSync(dirPath)) {
      return { success: false, error: 'Directory not found' };
    }

    const readDir = (dir, depth = 0, maxDepth = 3) => {
      if (depth > maxDepth) return [];

      const items = fs.readdirSync(dir, { withFileTypes: true });
      return items
        .filter(item => !item.name.startsWith('.') && item.name !== 'node_modules')
        .map(item => {
          const itemPath = path.join(dir, item.name);
          const isDirectory = item.isDirectory();

          return {
            name: item.name,
            path: itemPath,
            isDirectory,
            children: isDirectory && recursive && depth < maxDepth
              ? readDir(itemPath, depth + 1, maxDepth)
              : null
          };
        })
        .sort((a, b) => {
          // 폴더 먼저, 그 다음 알파벳 순
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        });
    };

    const items = readDir(dirPath);
    return { success: true, items };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// VS Code로 파일/폴더 열기
ipcMain.handle('open-in-vscode', async (event, { targetPath }) => {
  try {
    if (!fs.existsSync(targetPath)) {
      return { success: false, error: 'Path not found' };
    }

    // VS Code 실행 (code 명령어 사용)
    const proc = spawn('code', [targetPath], {
      shell: true,
      detached: true,
      stdio: 'ignore'
    });
    proc.unref();

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 파일 탐색기에서 폴더 열기
ipcMain.handle('open-in-explorer', async (event, { targetPath }) => {
  try {
    if (!fs.existsSync(targetPath)) {
      return { success: false, error: 'Path not found' };
    }

    // 파일인 경우 상위 폴더 열고 파일 선택
    const isFile = fs.statSync(targetPath).isFile();
    if (isFile) {
      shell.showItemInFolder(targetPath);
    } else {
      shell.openPath(targetPath);
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 외부 편집기로 열기 (사용자 지정 편집기)
ipcMain.handle('open-with-editor', async (event, { targetPath, editor }) => {
  try {
    if (!fs.existsSync(targetPath)) {
      return { success: false, error: 'Path not found' };
    }

    // 지원 편집기 목록
    const editors = {
      'vscode': 'code',
      'notepad': 'notepad',
      'notepad++': 'notepad++',
      'sublime': 'subl',
      'atom': 'atom',
      'vim': 'vim',
      'default': null  // 기본 프로그램
    };

    const editorCmd = editors[editor] || editors['default'];

    if (editorCmd) {
      const proc = spawn(editorCmd, [targetPath], {
        shell: true,
        detached: true,
        stdio: 'ignore'
      });
      proc.unref();
    } else {
      // 기본 프로그램으로 열기
      await shell.openPath(targetPath);
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
