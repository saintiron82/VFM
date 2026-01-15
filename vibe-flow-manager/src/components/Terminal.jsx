import { useRef, useEffect } from 'react'
import { Terminal as XTerm } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'

function Terminal({ sessionId, cwd, title, onClose }) {
    const termRef = useRef(null)
    const xtermRef = useRef(null)
    const fitAddonRef = useRef(null)

    useEffect(() => {
        if (!termRef.current) return

        // xterm 초기화
        const xterm = new XTerm({
            cursorBlink: true,
            fontSize: 14,
            fontFamily: 'Consolas, "Courier New", monospace',
            theme: {
                background: '#1a1a2e',
                foreground: '#e0e0ff',
                cursor: '#6366f1',
                selection: 'rgba(99, 102, 241, 0.3)',
                black: '#000000',
                red: '#ef4444',
                green: '#22c55e',
                yellow: '#f59e0b',
                blue: '#3b82f6',
                magenta: '#a855f7',
                cyan: '#06b6d4',
                white: '#e0e0ff',
                brightBlack: '#6b7280',
                brightRed: '#f87171',
                brightGreen: '#4ade80',
                brightYellow: '#fbbf24',
                brightBlue: '#60a5fa',
                brightMagenta: '#c084fc',
                brightCyan: '#22d3ee',
                brightWhite: '#ffffff'
            },
            scrollback: 1000,
            convertEol: true
        })

        const fitAddon = new FitAddon()
        xterm.loadAddon(fitAddon)
        xterm.open(termRef.current)

        // 초기 fit
        setTimeout(() => {
            fitAddon.fit()
        }, 0)

        xtermRef.current = xterm
        fitAddonRef.current = fitAddon

        // 입력 처리
        xterm.onData(data => {
            window.electronAPI.terminalInput(sessionId, data)
        })

        // 출력 처리
        const outputHandler = ({ sessionId: sid, data }) => {
            if (sid === sessionId && xtermRef.current) {
                xtermRef.current.write(data)
            }
        }
        window.electronAPI.onTerminalOutput(outputHandler)

        // 터미널 시작
        window.electronAPI.spawnTerminal({ sessionId, cwd, title })

        // 리사이즈 핸들러
        const handleResize = () => {
            if (fitAddonRef.current) {
                fitAddonRef.current.fit()
            }
        }
        window.addEventListener('resize', handleResize)

        // 클린업
        return () => {
            window.removeEventListener('resize', handleResize)
            window.electronAPI.closeTerminal(sessionId)
            if (xtermRef.current) {
                xtermRef.current.dispose()
            }
        }
    }, [sessionId, cwd, title])

    return (
        <div className="terminal-wrapper">
            <div ref={termRef} className="terminal-container" />
        </div>
    )
}

export default Terminal
